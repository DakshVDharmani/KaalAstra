import sys
import os
import warnings
warnings.filterwarnings("ignore")
from pathlib import Path
from typing import Optional
import typer
import click
from typer.core import TyperOption
from rich.console import Console

# Typer versions before Click 8.3 pass ``flag_value=None`` to Click. Click 8.3
# now treats that explicit None as a flag value, which turns string options
# (such as --engine) into flags. Restore Click's UNSET default for compatibility.
if hasattr(click.core, "UNSET"):
    _typer_option_init = TyperOption.__init__

    def _click_option_compat(self, *args, **kwargs):
        if kwargs.get("flag_value") is None:
            kwargs["flag_value"] = click.core.UNSET
        _typer_option_init(self, *args, **kwargs)

    TyperOption.__init__ = _click_option_compat

from git_capture import capture_commit
from graph_engine import CodeGraph
from scanner import run_all_scanners
from tavily_research import get_contextual_advisories
from llm_engine import run_kaalastra_review
from verifier import verify_patch
from reporter import (
    print_banner,
    render_commit_summary,
    render_graph_topology,
    render_report,
    console
)

app = typer.Typer(help="KaalAstra: Graph-Aware Commit Sentinel & Verified Remediation")

@app.command()
def scan(
    repo_path: str = typer.Argument(".", help="Path to git repository"),
    commit_ref: str = typer.Option("HEAD", "--commit", "-c", is_flag=False, help="Commit hash or ref to analyze"),
    baseline: bool = typer.Option(False, "--baseline", "-b", is_flag=True, help="Run in diff-only baseline mode (omit graph)"),
    verify: bool = typer.Option(True, "--verify", is_flag=True, help="Automatically verify patch with unit tests"),
    no_verify: bool = typer.Option(False, "--no-verify", is_flag=True, help="Skip automatic patch verification"),
    as_json: bool = typer.Option(False, "--json", is_flag=True, help="Output machine-readable JSON for IDE extensions"),
    finsec: bool = typer.Option(False, "--finsec", is_flag=True, help="Enable elsiddik/finsec_detector HuggingFace model"),
    engine: str = typer.Option("hybrid", "--engine", "-e", is_flag=False, help="Engine mode: hybrid | finsec | baseline")
):
    """Run Graph-Aware Security Review on the given commit."""
    repo_p = str(Path(repo_path).resolve())
    is_baseline = baseline or (engine == "baseline")
    use_finsec = finsec or (engine == "finsec")

    if as_json:
        # Quiet machine mode for VS Code extension
        commit = capture_commit(repo_p, commit_ref)
        subgraph = None
        if not is_baseline:
            graph = CodeGraph(repo_p)
            graph.build()
            subgraph = graph.get_focused_subgraph(commit.changed_files)

        changed_rel_paths = [f.file_path for f in commit.changed_files]

        if engine == "finsec":
            from finsec_detector import scan_files_with_finsec
            from llm_engine import KaalAstraFinding, ReviewReport
            finsec_raw = scan_files_with_finsec(repo_p, changed_rel_paths, commit_hash=commit.commit_hash)
            findings = []
            for idx, sf in enumerate(finsec_raw, 1):
                patch_diff = ""
                if "Suggested Fix:" in sf.message and sf.code_snippet:
                    fix_text = sf.message.split("Suggested Fix:")[1].strip().rstrip(".)")
                    patch_diff = (
                        f"--- a/{sf.file_path}\n"
                        f"+++ b/{sf.file_path}\n"
                        f"@@ -{sf.start_line},1 +{sf.start_line},2 @@\n"
                        f" {sf.code_snippet}\n"
                        f"+  {fix_text}\n"
                    )
                findings.append(KaalAstraFinding(
                    finding_id=f"FINSEC-{idx:03d}",
                    title=f"FinSec-AI: {sf.rule_id}",
                    severity=sf.severity,
                    confidence="CONFIRMED",
                    cwe=sf.rule_id.replace("FINSEC_", "").replace("_", "-"),
                    affected_file=sf.file_path,
                    line_range=str(sf.start_line),
                    is_new_regression=True,
                    failure_mechanism=sf.message,
                    graph_evidence="Pure FinSec-AI (elsiddik/finsec_detector) code analysis without NLP prose",
                    why_diff_only_misses_this="Detected by neural AppSec pattern matching in source AST",
                    proposed_remediation="Apply suggested secure code fix",
                    patch_file=sf.file_path,
                    patch_unified_diff=patch_diff,
                    regression_test_summary="FinSec neural verification"
                ))
            report = ReviewReport(
                commit_hash=commit.short_hash,
                is_baseline_run=False,
                findings=findings,
                summary=f"FinSec-AI (elsiddik/finsec_detector) audited {len(changed_rel_paths)} files and detected {len(findings)} security flaws.",
                scanner_evidence=f"{len(findings)} issues found by elsiddik/finsec_detector",
                external_advisories=[]
            )
        else:
            scanner_findings = run_all_scanners(repo_p, changed_rel_paths, enable_finsec=use_finsec, commit_hash=commit.commit_hash)

            # The VS Code JSON scan should not block on optional external
            # research. Tavily remains available through the dedicated Ask
            # Tavily action and in the interactive CLI workflow.
            advisories = []

            report = run_kaalastra_review(commit, subgraph, scanner_findings, advisories, is_baseline=is_baseline)

        verification = None
        if verify and not no_verify and report.findings:
            first_f = report.findings[0]
            if first_f.patch_unified_diff and first_f.patch_file:
                verification = verify_patch(repo_p, first_f.patch_file, first_f.patch_unified_diff)

        import json
        payload = {
            "commit": commit.dict(),
            "subgraph": subgraph.dict() if subgraph else None,
            "report": report.dict(),
            "verification": verification.dict() if verification else None
        }
        print(json.dumps(payload))
        return

    # Step 1: Git Capture
    with console.status("[bold cyan]1/5 Capturing Git commit & diff...[/bold cyan]", spinner="dots"):
        commit = capture_commit(repo_p, commit_ref)
    
    render_commit_summary(commit)

    # Step 2: Code Knowledge Graph
    subgraph = None
    if not is_baseline:
        with console.status("[bold magenta]2/5 Constructing Code Knowledge Graph & resolving callers...[/bold magenta]", spinner="dots"):
            graph = CodeGraph(repo_p)
            graph.build()
            subgraph = graph.get_focused_subgraph(commit.changed_files)
        render_graph_topology(subgraph)
    else:
        console.print("[dim yellow]» Baseline Mode Enabled: Skipping repository graph construction.[/dim yellow]")

    # Step 3: Local Static & FinSec Analysis
    with console.status("[bold blue]3/5 Running static AST and FinSec AI analyzers...[/bold blue]", spinner="dots"):
        changed_rel_paths = [f.file_path for f in commit.changed_files]
        scanner_findings = run_all_scanners(repo_p, changed_rel_paths, enable_finsec=use_finsec, commit_hash=commit.commit_hash)

    # Step 4: Tavily Threat Research
    advisories = []
    if not is_baseline and subgraph and subgraph.unprotected_entrypoints:
        with console.status("[bold green]4/5 Querying Tavily for authoritative vendor security advisories...[/bold green]", spinner="dots"):
            advisories = get_contextual_advisories(subgraph.unprotected_entrypoints, commit.changed_files)

    # Step 5: KaalAstra LLM Reasoning or Pure FinSec-AI
    if engine == "finsec":
        with console.status("[bold magenta]5/5 Running Pure FineSec-AI (elsiddik/finsec_detector) code analysis...[/bold magenta]", spinner="dots"):
            from finsec_detector import scan_files_with_finsec
            from llm_engine import KaalAstraFinding, ReviewReport
            finsec_raw = scan_files_with_finsec(repo_p, changed_rel_paths, commit_hash=commit.commit_hash)
            findings = []
            for idx, sf in enumerate(finsec_raw, 1):
                patch_diff = ""
                if "Suggested Fix:" in sf.message and sf.code_snippet:
                    fix_text = sf.message.split("Suggested Fix:")[1].strip().rstrip(".)")
                    patch_diff = (
                        f"--- a/{sf.file_path}\n"
                        f"+++ b/{sf.file_path}\n"
                        f"@@ -{sf.start_line},1 +{sf.start_line},2 @@\n"
                        f" {sf.code_snippet}\n"
                        f"+  {fix_text}\n"
                    )
                findings.append(KaalAstraFinding(
                    finding_id=f"FINSEC-{idx:03d}",
                    title=f"FinSec-AI: {sf.rule_id}",
                    severity=sf.severity,
                    confidence="CONFIRMED",
                    cwe=sf.rule_id.replace("FINSEC_", "").replace("_", "-"),
                    affected_file=sf.file_path,
                    line_range=str(sf.start_line),
                    is_new_regression=True,
                    failure_mechanism=sf.message,
                    graph_evidence="Pure FinSec-AI (elsiddik/finsec_detector) code analysis without NLP prose",
                    why_diff_only_misses_this="Detected by neural AppSec pattern matching in source AST",
                    proposed_remediation="Apply suggested secure code fix",
                    patch_file=sf.file_path,
                    patch_unified_diff=patch_diff,
                    regression_test_summary="FinSec neural verification"
                ))
            report = ReviewReport(
                commit_hash=commit.short_hash,
                is_baseline_run=False,
                findings=findings,
                summary=f"FinSec-AI (elsiddik/finsec_detector) audited {len(changed_rel_paths)} files and detected {len(findings)} security flaws.",
                scanner_evidence=f"{len(findings)} issues found by elsiddik/finsec_detector",
                external_advisories=[]
            )
    else:
        with console.status("[bold red]5/5 KaalAstra Neural Engine analyzing exploit paths...[/bold red]", spinner="dots"):
            report = run_kaalastra_review(
                commit=commit,
                subgraph=subgraph,
                scanner_findings=scanner_findings,
                advisories=advisories,
                is_baseline=is_baseline
            )

    # Step 6: Fix Verification
    verification = None
    if verify and not no_verify and report.findings:
        first_finding = report.findings[0]
        if first_finding.patch_unified_diff and first_finding.patch_file:
            with console.status("[bold cyan]🔬 Verifying patch against unit test suite and Semgrep...[/bold cyan]", spinner="dots"):
                verification = verify_patch(repo_p, first_finding.patch_file, first_finding.patch_unified_diff)

    render_report(report, verification)

@app.command()
def explain(
    snippet: str = typer.Option(..., "--snippet", "-s", is_flag=False, help="Code snippet captured from editor"),
    file_name: str = typer.Option("code.js", "--file", "-f", is_flag=False, help="File name"),
    question: str = typer.Option("Why did this happen?", "--question", "-q", is_flag=False, help="Developer question"),
    title: str = typer.Option("", "--title", "-t", is_flag=False, help="Vulnerability title"),
    cwe: str = typer.Option("", "--cwe", "-c", is_flag=False, help="CWE identifier"),
    as_json: bool = typer.Option(True, "--json", is_flag=True, help="Output machine-readable JSON")
):
    """Query Tavily research and Gemini for an in-depth explanation of marked code."""
    import json
    from tavily_research import explain_vulnerability_with_tavily
    res = explain_vulnerability_with_tavily(snippet, file_name, question, title, cwe)
    if as_json:
        print(json.dumps(res))
    else:
        print(res["explanation"])

@app.command()
def finsec(
    file_path: str = typer.Argument(..., help="Path to code file to audit with elsiddik/finsec_detector"),
    local: bool = typer.Option(False, "--local", is_flag=True, help="Run model locally with PyTorch (requires downloading 14.5 GB weights)"),
    as_json: bool = typer.Option(True, "--json", is_flag=True, help="Output machine-readable JSON format without NLP prose")
):
    """Audit source code directly using FineSec-AI (elsiddik/finsec_detector)."""
    import json
    from finsec_detector import FinSecDetector
    
    path_obj = Path(file_path).resolve()
    if not path_obj.exists():
        console.print(f"[bold red]File not found:[/bold red] {file_path}")
        raise typer.Exit(1)
        
    code_content = path_obj.read_text(encoding="utf-8", errors="replace")
    detector = FinSecDetector(use_local=local)
    vulns = detector.analyze_code(code_content)
    
    if as_json:
        print(json.dumps({"file": str(path_obj), "vulnerabilities": vulns}, indent=2))
    else:
        console.print(f"[bold cyan]Auditing {path_obj.name} with elsiddik/finsec_detector...[/bold cyan]")
        for v in vulns:
            console.print(f" - [{v.get('severity')}] {v.get('cwe')}: {v.get('description')}")
            if v.get('vulnerable_line'):
                console.print(f"   Line: [red]{v.get('vulnerable_line')}[/red]")
            if v.get('fix_code'):
                console.print(f"   Fix:  [green]{v.get('fix_code')}[/green]")

@app.command()
def serve(
    port: int = typer.Option(8000, "--port", "-p", is_flag=False, help="Port for FastAPI server")
):
    """Start the KaalAstra FastAPI daemon for VS Code Extension integration."""
    import uvicorn
    print_banner()
    console.print(f"[bold green]Starting KaalAstra API Server on port {port}...[/bold green]")
    uvicorn.run("server:app", host="127.0.0.1", port=port, reload=False)

if __name__ == "__main__":
    app()
