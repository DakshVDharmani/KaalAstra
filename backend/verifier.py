import os
import subprocess
import tempfile
import shutil
from pathlib import Path
from typing import Dict, Any, Optional
from pydantic import BaseModel
from scanner import run_semgrep_scan

class VerificationResult(BaseModel):
    status: str  # VERIFIED, PARTIALLY_VERIFIED, FAILED_VERIFICATION, NOT_VERIFIED
    test_suite_passed: bool
    test_output: str
    scanner_clean: bool
    scanner_alerts_count: int
    details: str

def run_npm_tests(repo_path: str) -> tuple[bool, str]:
    """Run npm test in repo and capture pass/fail."""
    try:
        proc = subprocess.run(
            ["npm.cmd", "test"],
            cwd=repo_path,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=30
        )
        passed = (proc.returncode == 0)
        output = proc.stdout + "\n" + proc.stderr
        return passed, output.strip()
    except Exception as e:
        return False, f"Failed to execute npm test: {str(e)}"

def verify_patch(repo_path: str, patch_file_rel: str, patch_diff: str) -> VerificationResult:
    """Applies patch in a safe backup context, runs test suite and scanners, and verifies."""
    base_p = Path(repo_path).resolve()
    target_file = base_p / patch_file_rel
    
    if not target_file.exists():
        return VerificationResult(
            status="NOT_VERIFIED",
            test_suite_passed=False,
            test_output="",
            scanner_clean=False,
            scanner_alerts_count=0,
            details=f"Target file to patch '{patch_file_rel}' does not exist."
        )

    # 1. Backup original file
    backup_file = target_file.with_suffix(target_file.suffix + ".kaalastra_bak")
    shutil.copy2(target_file, backup_file)

    try:
        # 2. Try applying patch using git apply
        patch_applied = False
        with tempfile.NamedTemporaryFile("w", delete=False, suffix=".patch", encoding="utf-8") as tf:
            tf.write(patch_diff)
            temp_patch_path = tf.name

        try:
            apply_res = subprocess.run(
                ["git", "-C", str(base_p), "apply", temp_patch_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace"
            )
            if apply_res.returncode == 0:
                patch_applied = True
        except Exception:
            pass
        finally:
            if os.path.exists(temp_patch_path):
                os.remove(temp_patch_path)

        # 3. Run regression tests
        test_passed, test_out = run_npm_tests(str(base_p))

        # 4. Run static scanner on patched file
        scanner_results = run_semgrep_scan(str(base_p), [patch_file_rel])
        scanner_clean = (len(scanner_results) == 0)

        # 5. Determine verification state
        if test_passed and scanner_clean:
            status = "VERIFIED"
            details = "All regression tests passed cleanly and Semgrep AST scan confirmed 0 security alerts."
        elif test_passed and not scanner_clean:
            status = "PARTIALLY_VERIFIED"
            details = f"Unit tests passed, but Semgrep flagged {len(scanner_results)} potential alerts."
        else:
            status = "FAILED_VERIFICATION"
            details = "Regression tests failed after applying the patch."

        return VerificationResult(
            status=status,
            test_suite_passed=test_passed,
            test_output=test_out,
            scanner_clean=scanner_clean,
            scanner_alerts_count=len(scanner_results),
            details=details
        )
    finally:
        # Restore backup so working tree remains intact unless explicitly accepted
        if backup_file.exists():
            shutil.copy2(backup_file, target_file)
            os.remove(backup_file)

