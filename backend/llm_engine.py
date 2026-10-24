import json
import re
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
try:
    import google.generativeai as genai
except ImportError:
    genai = None
from config import GEMINI_API_KEY, MODEL_NAME, CANDIDATE_MODELS, HF_TOKEN, HF_REVIEW_MODEL
from git_capture import CommitMetadata
from graph_engine import FocusedSubgraph
from scanner import ScannerFinding
from tavily_research import SecurityAdvisory

class KaalAstraFinding(BaseModel):
    finding_id: str
    title: str
    severity: str  # CRITICAL, HIGH, MEDIUM, LOW
    confidence: str  # CONFIRMED, HIGH, PLAUSIBLE
    cwe: str
    affected_file: str
    line_range: str
    is_new_regression: bool
    failure_mechanism: str
    graph_evidence: str
    why_diff_only_misses_this: str
    proposed_remediation: str
    patch_file: str
    patch_unified_diff: str
    regression_test_summary: str

class ReviewReport(BaseModel):
    commit_hash: str
    is_baseline_run: bool  # True if graph was omitted
    findings: List[KaalAstraFinding]
    summary: str
    scanner_evidence: str
    external_advisories: List[Dict[str, str]]


def _local_only_report(
    commit: CommitMetadata,
    scanner_findings: List[ScannerFinding],
    advisories: List[SecurityAdvisory],
    is_baseline: bool,
    reason: str
) -> ReviewReport:
    findings = []
    for idx, scanner_finding in enumerate(scanner_findings, 1):
        severity = scanner_finding.severity.upper()
        if severity not in {"CRITICAL", "HIGH", "MEDIUM", "LOW"}:
            severity = "MEDIUM"
        findings.append(KaalAstraFinding(
            finding_id=f"KAAL-STATIC-{idx:03d}",
            title=f"{scanner_finding.scanner_name}: {scanner_finding.rule_id}",
            severity=severity,
            confidence="HIGH",
            cwe=scanner_finding.rule_id,
            affected_file=scanner_finding.file_path,
            line_range=str(scanner_finding.start_line),
            is_new_regression=True,
            failure_mechanism=scanner_finding.message,
            graph_evidence="Reported by a local scanner; AI review was unavailable.",
            why_diff_only_misses_this="Detected by local static analysis.",
            proposed_remediation="Review the flagged code and apply the scanner's recommended secure pattern.",
            patch_file=scanner_finding.file_path,
            patch_unified_diff="",
            regression_test_summary="Add a regression test for this security condition."
        ))
    return ReviewReport(
        commit_hash=commit.short_hash,
        is_baseline_run=is_baseline,
        findings=findings,
        summary=f"{reason} Local scanners reported {len(findings)} finding(s); this is not a complete AI review.",
        scanner_evidence=f"{len(scanner_findings)} local static alerts detected",
        external_advisories=[{"title": a.title, "url": a.url} for a in advisories]
    )

def run_kaalastra_review(
    commit: CommitMetadata,
    subgraph: Optional[FocusedSubgraph],
    scanner_findings: List[ScannerFinding],
    advisories: List[SecurityAdvisory],
    is_baseline: bool = False
) -> ReviewReport:
    """Run Graph-Aware or Baseline LLM Security Review with strict JSON output."""
    if not HF_TOKEN and (genai is None or not GEMINI_API_KEY):
        return _local_only_report(
            commit, scanner_findings, advisories, is_baseline,
            "No configured external AI review provider is available."
        )

    # Build prompt
    prompt_sections = [
        "YOU ARE KaalAstra: A Principal Application Security Engineer and Graph-Aware Commit Sentinel.",
        f"You are analyzing Commit {commit.short_hash} on branch {commit.branch}.",
        f"Commit Message: \"{commit.message}\"",
        f"Author: {commit.author}",
        "\n=== SECTION 1: GIT UNIFIED DIFF ===",
        commit.raw_diff
    ]

    if is_baseline or not subgraph:
        prompt_sections.append("\n=== REPOSITORY GRAPH CONTEXT: [DISABLED (BASELINE MODE)] ===")
        prompt_sections.append("You ONLY have access to the lines changed in the diff above.")
    else:
        prompt_sections.append("\n=== SECTION 2: CODE KNOWLEDGE GRAPH (TOPOLOGY & CALLERS) ===")
        prompt_sections.append(subgraph.ascii_tree)
        prompt_sections.append("\nGRAPH RELATIONSHIPS:")
        for edge in subgraph.edges:
            prompt_sections.append(f" - Caller: {edge.caller_id} invokes {edge.callee_id} at line {edge.line_number}")
        if subgraph.unprotected_entrypoints:
            prompt_sections.append("\nCRITICAL SENSITIVE ENTRYPOINTS IDENTIFIED BY GRAPH:")
            for ep in subgraph.unprotected_entrypoints:
                prompt_sections.append(f" - Route: {ep.name} in {ep.file_path} (Middlewares: {ep.middlewares or 'NONE'})")
                prompt_sections.append(f"   Snippet:\n{ep.code_snippet}\n")

    prompt_sections.append("\n=== SECTION 3: LOCAL STATIC SCANNER FINDINGS ===")
    if scanner_findings:
        for sf in scanner_findings:
            prompt_sections.append(f" - [{sf.scanner_name}] {sf.rule_id} ({sf.severity}) in {sf.file_path}:{sf.start_line}: {sf.message}")
    else:
        prompt_sections.append(" - Semgrep and Secret scanners completed: 0 automated rule alerts.")

    if advisories:
        prompt_sections.append("\n=== SECTION 4: TAVILY EXTERNAL THREAT INTELLIGENCE ===")
        for adv in advisories:
            prompt_sections.append(f" - [{adv.title}] ({adv.url}): {adv.content_snippet}")

    prompt_sections.append("""
=== REVIEW INSTRUCTIONS ===
1. Examine if this commit introduces any security regression, authentication bypass, authorization gap, injection, or broken trust boundary.
2. CRITICAL: Distinguish between what the diff appears to do in isolation vs. what happens when callers in the broader repository graph invoke the modified function.
3. If an upstream caller calls the modified function with untrusted input without authentication or signature verification, explain the exact exploit path.
4. For remediation: Describe the security requirement and a safe approach. Do not write code or a patch. A separately selected coding agent will propose file changes for user review.
5. Output MUST be valid JSON adhering strictly to this JSON format:
{
  "summary": "Concise 2-sentence executive summary of the review",
  "findings": [
    {
      "finding_id": "KAAL-2026-001",
      "title": "Short title of the vulnerability",
      "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      "confidence": "CONFIRMED" | "HIGH" | "PLAUSIBLE",
      "cwe": "CWE-306",
      "affected_file": "relative/path/to/file.js",
      "line_range": "11-18",
      "is_new_regression": true,
      "failure_mechanism": "Detailed explanation of how the bug manifests",
      "graph_evidence": "Explain how the code knowledge graph proved this vulnerability",
      "why_diff_only_misses_this": "Why a diff-only reviewer would miss this issue",
      "proposed_remediation": "Clear explanation of the fix",
      "patch_file": "",
      "patch_unified_diff": "",
      "regression_test_summary": "Description of the regression test that catches this"
    }
  ]
}

Respond ONLY with the JSON object. Do not wrap with conversational filler.
""")

    full_prompt = "\n".join(prompt_sections)
    raw_text = ""
    if HF_TOKEN:
        # One bounded Inference Providers request against the latest commit diff
        # and its focused graph context. Do not send the repository contents.
        import requests

        try:
            response = requests.post(
                "https://router.huggingface.co/v1/chat/completions",
                headers={"Authorization": f"Bearer {HF_TOKEN}"},
                json={
                    "model": HF_REVIEW_MODEL,
                    "messages": [{"role": "user", "content": full_prompt}],
                    "temperature": 0.1,
                    "max_tokens": 1200,
                    "response_format": {"type": "json_object"}
                },
                timeout=(3, 12)
            )
            if not response.ok:
                return _local_only_report(
                    commit, scanner_findings, advisories, is_baseline,
                    f"Hugging Face review returned HTTP {response.status_code}."
                )
            choices = response.json().get("choices", [])
            if not choices:
                return _local_only_report(
                    commit, scanner_findings, advisories, is_baseline,
                    "Hugging Face returned no review result."
                )
            raw_text = (choices[0].get("message", {}).get("content") or "").strip()
        except Exception as error:
            return _local_only_report(
                commit, scanner_findings, advisories, is_baseline,
                f"Hugging Face review could not complete: {str(error)[:180]}"
            )
    else:
        genai.configure(api_key=GEMINI_API_KEY)
        for candidate_model in CANDIDATE_MODELS:
            try:
                model = genai.GenerativeModel(candidate_model)
                response = model.generate_content(
                    full_prompt,
                    generation_config={"response_mime_type": "application/json"}
                )
                if response and response.text:
                    raw_text = response.text.strip()
                    break
            except Exception:
                continue

    try:
        parsed_json = json.loads(raw_text, strict=False)
    except Exception:
        # Fallback regex extraction if model wraps in code fences
        match = re.search(r"\{.*\}", raw_text, re.DOTALL)
        if match:
            try:
                parsed_json = json.loads(match.group(0), strict=False)
            except Exception:
                parsed_json = {"summary": "Model output formatting error", "findings": []}
        else:
            parsed_json = {"summary": "Unable to parse model JSON", "findings": []}

    findings = []
    for f_data in parsed_json.get("findings", []):
        findings.append(KaalAstraFinding(
            finding_id=f_data.get("finding_id", "KAAL-001"),
            title=f_data.get("title", "Security Finding"),
            severity=f_data.get("severity", "HIGH"),
            confidence=f_data.get("confidence", "HIGH"),
            cwe=f_data.get("cwe", "CWE-Unspecified"),
            affected_file=f_data.get("affected_file", ""),
            line_range=str(f_data.get("line_range", "")),
            is_new_regression=bool(f_data.get("is_new_regression", True)),
            failure_mechanism=f_data.get("failure_mechanism", ""),
            graph_evidence=f_data.get("graph_evidence", ""),
            why_diff_only_misses_this=f_data.get("why_diff_only_misses_this", ""),
            proposed_remediation=f_data.get("proposed_remediation", ""),
            patch_file="",
            patch_unified_diff="",
            regression_test_summary=f_data.get("regression_test_summary", "")
        ))

    scanner_summary = f"{len(scanner_findings)} static alerts detected" if scanner_findings else "0 alerts from static analysis (Semgrep passed cleanly)"

    return ReviewReport(
        commit_hash=commit.short_hash,
        is_baseline_run=is_baseline,
        findings=findings,
        summary=parsed_json.get("summary", ""),
        scanner_evidence=scanner_summary,
        external_advisories=[{"title": a.title, "url": a.url} for a in advisories]
    )
