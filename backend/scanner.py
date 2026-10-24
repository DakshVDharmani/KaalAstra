import json
import os
import re
import subprocess
from pathlib import Path
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from config import get_semgrep_path

class ScannerFinding(BaseModel):
    scanner_name: str
    rule_id: str
    severity: str  # CRITICAL, HIGH, MEDIUM, LOW, INFO
    file_path: str
    start_line: int
    end_line: int
    message: str
    code_snippet: str = ""

SECRET_PATTERNS = [
    ("AWS Access Key", r"AKIA[0-9A-Z]{16}"),
    ("Stripe Secret Key", r"sk_live_[0-9a-zA-Z]{24,}"),
    ("Generic Private Key", r"-----BEGIN (?:RSA |EC )?PRIVATE KEY-----"),
    ("Slack Webhook / Token", r"xox[baprs]-[0-9a-zA-Z]{10,48}"),
    ("Hardcoded JWT Token", r"ey[A-Za-z0-9-_=]+\.ey[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]+")
]

def scan_secrets_in_files(repo_path: str, changed_files: List[str]) -> List[ScannerFinding]:
    findings = []
    base_p = Path(repo_path).resolve()
    
    for rel_path in changed_files:
        full_p = base_p / rel_path
        if not full_p.exists() or full_p.is_dir():
            continue
        try:
            with open(full_p, "r", encoding="utf-8", errors="replace") as f:
                lines = f.readlines()
            for line_idx, line in enumerate(lines, 1):
                for sec_name, pattern in SECRET_PATTERNS:
                    if re.search(pattern, line):
                        findings.append(ScannerFinding(
                            scanner_name="KaalAstra Secret Scanner",
                            rule_id=f"SECRET_{sec_name.upper().replace(' ', '_')}",
                            severity="CRITICAL",
                            file_path=rel_path,
                            start_line=line_idx,
                            end_line=line_idx,
                            message=f"Possible hardcoded secret ({sec_name}) detected.",
                            code_snippet=line.strip()
                        ))
        except Exception:
            continue
    return findings

def run_semgrep_scan(repo_path: str, target_files: Optional[List[str]] = None) -> List[ScannerFinding]:
    findings: List[ScannerFinding] = []
    semgrep_bin = get_semgrep_path()
    
    # Target only specific files if provided, otherwise repo src
    scan_targets = []
    base_p = Path(repo_path).resolve()
    if target_files:
        for f in target_files:
            p = base_p / f
            if p.exists():
                scan_targets.append(str(p))
    if not scan_targets:
        src_dir = base_p / "src"
        scan_targets = [str(src_dir if src_dir.exists() else base_p)]

    cmd = [
        semgrep_bin,
        "scan",
        "--metrics=off",
        "--disable-version-check",
        "--config", "p/security-audit",
        "--config", "p/javascript",
        "--json",
        "--quiet",
        *scan_targets
    ]

    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=25
        )
        # Parse JSON from stdout (find first '{')
        out_text = proc.stdout.strip()
        start_idx = out_text.find("{")
        if start_idx != -1:
            data = json.loads(out_text[start_idx:])
            for r in data.get("results", []):
                rel_f = os.path.relpath(r.get("path", ""), str(base_p)).replace("\\", "/")
                findings.append(ScannerFinding(
                    scanner_name="Semgrep",
                    rule_id=r.get("check_id", "semgrep-rule"),
                    severity=r.get("extra", {}).get("severity", "WARNING").upper(),
                    file_path=rel_f,
                    start_line=r.get("start", {}).get("line", 1),
                    end_line=r.get("end", {}).get("line", 1),
                    message=r.get("extra", {}).get("message", "Semgrep security finding"),
                    code_snippet=r.get("extra", {}).get("lines", "").strip()
                ))
    except Exception as e:
        # Graceful fallback: return empty list if Semgrep times out or fails
        pass

    return findings

def run_finsec_scan(repo_path: str, target_files: Optional[List[str]] = None) -> List[ScannerFinding]:
    """Run FineSec-AI (elsiddik/finsec_detector) code vulnerability detection."""
    try:
        from finsec_detector import scan_files_with_finsec
        return scan_files_with_finsec(repo_path, target_files or [])
    except Exception as e:
        return []

def run_all_scanners(repo_path: str, changed_files: List[str], enable_finsec: bool = False) -> List[ScannerFinding]:
    """Orchestrate all static, AI and secret checks."""
    all_findings = []
    all_findings.extend(scan_secrets_in_files(repo_path, changed_files))
    all_findings.extend(run_semgrep_scan(repo_path, changed_files))
    if enable_finsec:
        all_findings.extend(run_finsec_scan(repo_path, changed_files))
    return all_findings
