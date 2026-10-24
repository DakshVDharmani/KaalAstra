import sys
from typing import List, Optional
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.tree import Tree
from rich.text import Text
from rich.syntax import Syntax
from rich.layout import Layout
from llm_engine import ReviewReport, KaalAstraFinding
from graph_engine import FocusedSubgraph
from git_capture import CommitMetadata
from verifier import VerificationResult

# Force UTF-8 on Windows terminal for crisp rendering
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

console = Console()

BANNER = """
[bold cyan]██╗  ██╗ █████╗  █████╗ ██╗      █████╗ ███████╗████████╗██████╗  █████╗ [/bold cyan]
[bold cyan]██║ ██╔╝██╔══██╗██╔══██╗██║     ██╔══██╗██╔════╝╚══██╔══╝██╔══██╗██╔══██╗[/bold cyan]
[bold white]█████╔╝ ███████║███████║██║     ███████║███████╗   ██║   ██████╔╝███████║[/bold white]
[bold blue]██╔═██╗ ██╔══██║██╔══██║██║     ██╔══██║╚════██║   ██║   ██╔══██╗██╔══██║[/bold blue]
[bold blue]██║  ██╗██║  ██║██║  ██║███████╗██║  ██║███████║   ██║   ██║  ██║██║  ██║[/bold blue]
[dim cyan]  Graph-Aware Commit Sentinel & Verified Vulnerability Remediation Pipeline[/dim cyan]
"""

def print_banner():
    console.print(BANNER)

def render_commit_summary(commit: CommitMetadata):
    grid = Table.grid(expand=True)
    grid.add_column(style="bold yellow", ratio=1)
    grid.add_column(ratio=3)

    grid.add_row("Target Commit:", f"[bold white]{commit.short_hash}[/bold white] ({commit.commit_hash})")
    grid.add_row("Branch:", f"[cyan]{commit.branch}[/cyan]")
    grid.add_row("Author:", f"{commit.author}")
    grid.add_row("Message:", f"[italic]{commit.message}[/italic]")
    grid.add_row("Files Changed:", f"{len(commit.changed_files)} files modified")

    console.print(Panel(grid, title="[bold cyan]⚡ Commit Radar[/bold cyan]", border_style="cyan"))

def render_graph_topology(subgraph: FocusedSubgraph):
    tree = Tree("[bold cyan]Repository Topology & Caller Impact[/bold cyan]")
    
    for c_node in subgraph.changed_nodes:
        sink_branch = tree.add(f"[bold yellow]MODIFIED SINK:[/bold yellow] [white]{c_node.file_path}[/white] -> [bold green]{c_node.name}()[/bold green] (Lines {c_node.start_line}-{c_node.end_line})")
        
        c_callers = [
            caller for caller in subgraph.callers
            if any(e.caller_id == caller.node_id and e.callee_id == c_node.node_id for e in subgraph.edges)
        ]
        
        if not c_callers:
            sink_branch.add("[dim](No external callers in codebase)[/dim]")
        else:
            for caller in c_callers:
                if caller.node_type == "route":
                    if caller in subgraph.unprotected_entrypoints:
                        sink_branch.add(f"[bold red]⚠️  CALLER ROUTE (UNPROTECTED):[/bold red] [white]{caller.file_path}[/white] [bold red]{caller.name}[/bold red] -> [bold red]NO AUTH MIDDLEWARE![/bold red]")
                    else:
                        sink_branch.add(f"[bold green]✓ CALLER ROUTE (PROTECTED):[/bold green] [white]{caller.file_path}[/white] [cyan]{caller.name}[/cyan] -> [dim]Middleware: {', '.join(caller.middlewares)}[/dim]")
                else:
                    sink_branch.add(f"[cyan]Caller Func:[/cyan] {caller.file_path} -> {caller.name}()")

    console.print(Panel(tree, title="[bold magenta]🕸️ Code Knowledge Graph[/bold magenta]", border_style="magenta"))

def render_report(report: ReviewReport, verification: Optional[VerificationResult] = None):
    # Mode badge
    if report.is_baseline_run:
        console.print(Panel("[bold yellow]RUNNING IN BASELINE MODE (Graph Context Omitted)[/bold yellow]\nSimulating conventional diff-only AI code reviewer.", border_style="yellow"))
    else:
        console.print(Panel(f"[bold green]KAALASTRA GRAPH-AWARE INTELLIGENCE[/bold green]\n{report.summary}", border_style="green"))

    # Findings Table
    if not report.findings:
        console.print(Panel("[bold green]✓ No security regressions detected.[/bold green]", border_style="green"))
        return

    for f in report.findings:
        color = "red" if f.severity in ["CRITICAL", "HIGH"] else "yellow"
        
        table = Table(show_header=False, expand=True, box=None)
        table.add_column("Key", style="bold cyan", width=22)
        table.add_column("Value")

        table.add_row("Finding ID:", f"[bold white]{f.finding_id}[/bold white]")
        table.add_row("Title:", f"[bold {color}]{f.title}[/bold {color}]")
        table.add_row("Severity / CWE:", f"[{color}]{f.severity}[/{color}] | [bold yellow]{f.cwe}[/bold yellow] | Confidence: [bold green]{f.confidence}[/bold green]")
        table.add_row("Affected Location:", f"[white]{f.affected_file}[/white] (Lines {f.line_range})")
        table.add_row("New Regression?:", "[bold red]YES[/bold red]" if f.is_new_regression else "[dim]Pre-existing[/dim]")
        table.add_row("Failure Mechanism:", f"{f.failure_mechanism}")
        table.add_row("Graph Topology Evidence:", f"[italic cyan]{f.graph_evidence}[/italic cyan]")
        table.add_row("Diff-Only Blindspot:", f"[italic red]{f.why_diff_only_misses_this}[/italic red]")
        table.add_row("Proposed Remediation:", f"{f.proposed_remediation}")

        console.print(Panel(table, title=f"[{color}]🚨 Security Alert: {f.finding_id} [/{color}]", border_style=color))

        if f.patch_unified_diff:
            syntax = Syntax(f.patch_unified_diff, "diff", theme="monokai", line_numbers=False)
            console.print(Panel(syntax, title=f"[bold green]🛠️ Evidence-Backed Patch ({f.patch_file})[/bold green]", border_style="green"))

    if verification:
        v_color = "green" if verification.status == "VERIFIED" else "yellow"
        v_table = Table.grid(expand=True)
        v_table.add_column(style="bold white", ratio=1)
        v_table.add_column(ratio=3)

        v_table.add_row("Verification Status:", f"[{v_color}]{verification.status} ✓[/{v_color}]")
        v_table.add_row("Unit Tests Passed:", f"[bold green]{verification.test_suite_passed}[/bold green]")
        v_table.add_row("Semgrep Alerts Post-Fix:", f"[bold green]{verification.scanner_alerts_count}[/bold green]")
        v_table.add_row("Verification Details:", f"{verification.details}")

        console.print(Panel(v_table, title=f"[{v_color}]🔬 Automated Fix Verification Matrix[/{v_color}]", border_style=v_color))

