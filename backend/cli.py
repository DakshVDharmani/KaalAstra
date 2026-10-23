import sys
import os
import warnings
warnings.filterwarnings("ignore")
from pathlib import Path
from typing import Optional
import typer
from rich.console import Console

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
    commit_ref: str = typer.Option("HEAD", "--commit", "-c", help="Commit hash or ref to analyze"),
    baseline: bool = typer.Option(False, "--baseline", "-b", help="Run in diff-only baseline mode (omit graph)"),
    verify: bool = typer.Option(True, "--verify/--no-verify", help="Automatically verify patch with unit tests"),
    as_json: bool = typer.Option(False, "--json", help="Output machine-readable JSON for IDE extensions")
):
    """Run Graph-Aware Security Review on the given commit."""
    repo_p = str(Path(repo_path).resolve())

    if as_json:
        # Quiet machine mode for VS Code extension
        commit = capture_commit(repo_p, commit_ref)
        subgraph = None
        if not baseline:
            graph = CodeGraph(repo_p)
            graph.build()
            subgraph = graph.get_focused_subgraph(commit.changed_files)

        changed_rel_paths = [f.file_path for f in commit.changed_files]
        scanner_findings = run_all_scanners(repo_p, changed_rel_paths)

        advisories = []
        if not baseline and subgraph and subgraph.unprotected_entrypoints:
            advisories = get_contextual_advisories(subgraph.unprotected_entrypoints, commit.changed_files)

        report = run_kaalastra_review(commit, subgraph, scanner_findings, advisories, is_baseline=baseline)

        verification = None
        if verify and report.findings:
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
    if not baseline:
        with console.status("[bold magenta]2/5 Constructing Code Knowledge Graph & resolving callers...[/bold magenta]", spinner="dots"):
            graph = CodeGraph(repo_p)
            graph.build()
            subgraph = graph.get_focused_subgraph(commit.changed_files)
        render_graph_topology(subgraph)
    else:
        console.print("[dim yellow]» Baseline Mode Enabled: Skipping repository graph construction.[/dim yellow]")

    # Step 3: Local Static Analysis
    with console.status("[bold blue]3/5 Running Semgrep AST rules and secret scanners...[/bold blue]", spinner="dots"):
        changed_rel_paths = [f.file_path for f in commit.changed_files]
        scanner_findings = run_all_scanners(repo_p, changed_rel_paths)

    # Step 4: Tavily Threat Research
    advisories = []
    if not baseline and subgraph and subgraph.unprotected_entrypoints:
        with console.status("[bold green]4/5 Querying Tavily for authoritative vendor security advisories...[/bold green]", spinner="dots"):
            advisories = get_contextual_advisories(subgraph.unprotected_entrypoints, commit.changed_files)

    # Step 5: KaalAstra LLM Reasoning
    with console.status("[bold red]5/5 KaalAstra Neural Engine analyzing exploit paths...[/bold red]", spinner="dots"):
        report = run_kaalastra_review(
            commit=commit,
            subgraph=subgraph,
            scanner_findings=scanner_findings,
            advisories=advisories,
            is_baseline=baseline
        )

    # Step 6: Fix Verification
    verification = None
    if verify and report.findings:
        first_finding = report.findings[0]
        if first_finding.patch_unified_diff and first_finding.patch_file:
            with console.status("[bold cyan]🔬 Verifying patch against unit test suite and Semgrep...[/bold cyan]", spinner="dots"):
                verification = verify_patch(repo_p, first_finding.patch_file, first_finding.patch_unified_diff)

    render_report(report, verification)

@app.command()
def explain(
    snippet: str = typer.Option(..., "--snippet", "-s", help="Code snippet captured from editor"),
    file_name: str = typer.Option("code.js", "--file", "-f", help="File name"),
    question: str = typer.Option("Why did this happen?", "--question", "-q", help="Developer question"),
    title: str = typer.Option("", "--title", "-t", help="Vulnerability title"),
    cwe: str = typer.Option("", "--cwe", "-c", help="CWE identifier"),
    as_json: bool = typer.Option(True, "--json", help="Output machine-readable JSON")
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
def serve(
    port: int = typer.Option(8000, "--port", "-p", help="Port for FastAPI server")
):
    """Start the KaalAstra FastAPI daemon for VS Code Extension integration."""
    import uvicorn
    print_banner()
    console.print(f"[bold green]Starting KaalAstra API Server on port {port}...[/bold green]")
    uvicorn.run("server:app", host="127.0.0.1", port=port, reload=False)

if __name__ == "__main__":
    app()
