import asyncio
import json
from pathlib import Path
from typing import Optional, Dict, Any
from fastapi import FastAPI, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel

from git_capture import capture_commit
from graph_engine import CodeGraph
from scanner import run_all_scanners
from tavily_research import get_contextual_advisories
from llm_engine import run_kaalastra_review
from verifier import verify_patch
from events import EventBus, PipelineEvent

app = FastAPI(title="KaalAstra Security Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ScanRequest(BaseModel):
    repo_path: str
    commit_ref: str = "HEAD"
    baseline: bool = False
    verify: bool = True

@app.get("/health")
def health():
    return {"status": "ok", "engine": "KaalAstra", "version": "1.0.0"}

@app.post("/api/scan")
def scan_repository(req: ScanRequest):
    repo_p = str(Path(req.repo_path).resolve())
    
    # 1. Git Capture
    commit = capture_commit(repo_p, req.commit_ref)
    
    # 2. Graph
    subgraph = None
    if not req.baseline:
        graph = CodeGraph(repo_p)
        graph.build()
        subgraph = graph.get_focused_subgraph(commit.changed_files)
        
    # 3. Static & Secrets
    changed_rel_paths = [f.file_path for f in commit.changed_files]
    scanner_findings = run_all_scanners(repo_p, changed_rel_paths)
    
    # 4. Tavily
    advisories = []
    if not req.baseline and subgraph and subgraph.unprotected_entrypoints:
        advisories = get_contextual_advisories(subgraph.unprotected_entrypoints, commit.changed_files)
        
    # 5. LLM Review
    report = run_kaalastra_review(
        commit=commit,
        subgraph=subgraph,
        scanner_findings=scanner_findings,
        advisories=advisories,
        is_baseline=req.baseline
    )
    
    # 6. Verification
    verification = None
    if req.verify and report.findings:
        first_f = report.findings[0]
        if first_f.patch_unified_diff and first_f.patch_file:
            verification = verify_patch(repo_p, first_f.patch_file, first_f.patch_unified_diff)
            
    return {
        "commit": commit.dict(),
        "subgraph": subgraph.dict() if subgraph else None,
        "report": report.dict(),
        "verification": verification.dict() if verification else None
    }

@app.get("/api/scan/stream")
async def scan_stream(repo_path: str, commit_ref: str = "HEAD", baseline: bool = False, verify: bool = True):
    """Server-Sent Events endpoint streaming real-time pipeline events to the VS Code extension."""
    async def event_generator():
        repo_p = str(Path(repo_path).resolve())
        
        yield {
            "event": "STAGE_START",
            "data": json.dumps({"stage": "INIT", "message": "KaalAstra Sentinel initialized."})
        }
        await asyncio.sleep(0.1)

        # 1. Commit
        yield {
            "event": "STAGE_PROGRESS",
            "data": json.dumps({"stage": "GIT_CAPTURE", "message": f"Capturing commit {commit_ref}..."})
        }
        commit = capture_commit(repo_p, commit_ref)
        yield {
            "event": "COMMIT_CAPTURED",
            "data": json.dumps({
                "short_hash": commit.short_hash,
                "author": commit.author,
                "message": commit.message,
                "files_count": len(commit.changed_files)
            })
        }
        await asyncio.sleep(0.1)

        # 2. Graph
        subgraph = None
        if not baseline:
            yield {
                "event": "STAGE_PROGRESS",
                "data": json.dumps({"stage": "GRAPH_BUILD", "message": "Constructing Code Knowledge Graph..."})
            }
            graph = CodeGraph(repo_p)
            graph.build()
            subgraph = graph.get_focused_subgraph(commit.changed_files)
            yield {
                "event": "GRAPH_TOPOLOGY",
                "data": json.dumps({
                    "ascii_tree": subgraph.ascii_tree,
                    "unprotected_count": len(subgraph.unprotected_entrypoints),
                    "callers_count": len(subgraph.callers)
                })
            }
            await asyncio.sleep(0.1)

        # 3. Scanners
        yield {
            "event": "STAGE_PROGRESS",
            "data": json.dumps({"stage": "SCANNER", "message": "Executing Semgrep AST and secret scans..."})
        }
        changed_rel_paths = [f.file_path for f in commit.changed_files]
        scanner_findings = run_all_scanners(repo_p, changed_rel_paths)
        yield {
            "event": "SCANNER_DONE",
            "data": json.dumps({"alerts_count": len(scanner_findings)})
        }
        await asyncio.sleep(0.1)

        # 4. Tavily
        advisories = []
        if not baseline and subgraph and subgraph.unprotected_entrypoints:
            yield {
                "event": "STAGE_PROGRESS",
                "data": json.dumps({"stage": "TAVILY", "message": "Querying Tavily threat intelligence..."})
            }
            advisories = get_contextual_advisories(subgraph.unprotected_entrypoints, commit.changed_files)
            yield {
                "event": "TAVILY_DONE",
                "data": json.dumps({"advisories_count": len(advisories)})
            }
            await asyncio.sleep(0.1)

        # 5. LLM
        yield {
            "event": "STAGE_PROGRESS",
            "data": json.dumps({"stage": "LLM_REASONING", "message": "KaalAstra Neural Engine analyzing exploit paths..."})
        }
        report = run_kaalastra_review(commit, subgraph, scanner_findings, advisories, baseline)
        yield {
            "event": "REPORT_COMPLETE",
            "data": json.dumps(report.dict())
        }
        await asyncio.sleep(0.1)

        # 6. Verification
        if verify and report.findings:
            first_f = report.findings[0]
            if first_f.patch_unified_diff and first_f.patch_file:
                yield {
                    "event": "STAGE_PROGRESS",
                    "data": json.dumps({"stage": "VERIFYING", "message": "Running automated verification suite..."})
                }
                v_res = verify_patch(repo_p, first_f.patch_file, first_f.patch_unified_diff)
                yield {
                    "event": "VERIFICATION_COMPLETE",
                    "data": json.dumps(v_res.dict())
                }

        yield {
            "event": "PIPELINE_DONE",
            "data": json.dumps({"status": "SUCCESS", "message": "KaalAstra review complete."})
        }

    return EventSourceResponse(event_generator())

