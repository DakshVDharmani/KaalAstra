import json
import os
import re
import subprocess
from pathlib import Path
from typing import List, Dict, Any, Optional
from config import FINSEC_MODEL_ID, HF_TOKEN
from scanner import ScannerFinding

FINSEC_SYSTEM_PROMPT = (
    "You are FineSec-AI, an expert Application Security Engineer. "
    "Analyze code snippet for vulnerabilities and output JSON report with fields: "
    "'vulnerabilities' (list of objects with severity, cwe, description, vulnerable_line, fix_code)."
)

def build_finsec_prompt(code_snippet: str) -> str:
    """Format prompt according to FineSec-AI / elsiddik/finsec_detector training format."""
    return (
        f"### System Prompt: \n{FINSEC_SYSTEM_PROMPT}\n\n"
        f"### Input Code:\n{code_snippet}\n\n"
        f"### Security Analysis (JSON):\n"
    )

def is_local_model_cached(model_id: str = "elsiddik/finsec_detector") -> bool:
    """Check if the 14GB Hugging Face model is already downloaded in local cache."""
    repo_folder_name = "models--" + model_id.replace("/", "--")
    cache_path = Path.home() / ".cache" / "huggingface" / "hub" / repo_folder_name
    if not cache_path.exists():
        return False
    snapshots = list(cache_path.glob("snapshots/*"))
    for s in snapshots:
        if list(s.glob("*.safetensors")) or list(s.glob("*.bin")):
            return True
    return False

def analyze_code_heuristic(code_snippet: str) -> List[Dict[str, Any]]:
    """Deterministic AppSec rule engine matching FineSec-AI schema for offline / zero-latency scans."""
    vulns = []
    lines = code_snippet.splitlines()

    # Rule 1: Missing authentication / authorization in sensitive financial/admin functions
    sensitive_fn_patterns = [
        (r"function\s+(refund\w*|transfer\w*|payout\w*|deleteUser\w*)\s*\([^)]*\)", "CWE-306", "HIGH",
         "Missing caller authentication/authorization checks inside sensitive financial operation.",
         "if (!user || user.role !== 'admin') throw new Error('Unauthorized');"),
        (r"router\.(post|put|delete)\(['\"]/(refund|transfer|payout|admin)", "CWE-285", "HIGH",
         "Exposed sensitive state-modifying route without mandatory authentication middleware.",
         "router.post('/refund', authMiddleware, roleCheck('admin'), handler);")
    ]

    for pattern, cwe, sev, desc, fix in sensitive_fn_patterns:
        for idx, line in enumerate(lines, 1):
            if re.search(pattern, line, re.IGNORECASE):
                # Filter out comment lines when inspecting for real executable auth checks
                context_lines = []
                for cl in lines[idx:min(len(lines), idx + 10)]:
                    s = cl.strip()
                    if s.startswith("//") or s.startswith("/*") or s.startswith("*"):
                        continue
                    context_lines.append(s)
                context = "\n".join(context_lines)

                # An authentic check must have an executable check verifying role/admin and throwing/returning error
                has_auth_check = bool(
                    re.search(r"if\s*\(.*?(?:role|admin|auth|user).*?\)", context, re.IGNORECASE) and
                    re.search(r"(throw|return\s+(?:res|next|false|error)|unauthorized)", context, re.IGNORECASE)
                )
                if not has_auth_check:
                    vulns.append({
                        "severity": sev,
                        "cwe": cwe,
                        "description": desc,
                        "vulnerable_line": line.strip(),
                        "fix_code": fix
                    })

    # Rule 2: SQL Injection
    sqli_pattern = r"(SELECT|INSERT|UPDATE|DELETE)\s+.*?\$\{.*?\}"
    for line in lines:
        if re.search(sqli_pattern, line, re.IGNORECASE):
            vulns.append({
                "severity": "CRITICAL",
                "cwe": "CWE-89",
                "description": "SQL Injection vulnerability via template string interpolation in database query.",
                "vulnerable_line": line.strip(),
                "fix_code": "db.query('SELECT * FROM users WHERE id = ?', [userId]);"
            })

    # Rule 3: Command Injection
    cmd_pattern = r"(exec|spawn|eval)\s*\(\s*(?:req\.|params\.|body\.|\`.*?\$\{)"
    for line in lines:
        if re.search(cmd_pattern, line):
            vulns.append({
                "severity": "CRITICAL",
                "cwe": "CWE-78",
                "description": "OS Command / Code Injection via unsanitized user parameter in execution sink.",
                "vulnerable_line": line.strip(),
                "fix_code": "Use parameterized argument lists and strict input allowlists instead of raw shell execution."
            })

    # Rule 4: Hardcoded Secret Keys
    secret_patterns = [
        (r"sk_live_[0-9a-zA-Z]{24,}", "Stripe Live Secret Key"),
        (r"AKIA[0-9A-Z]{16}", "AWS Access Key ID")
    ]
    for pattern, name in secret_patterns:
        for line in lines:
            if re.search(pattern, line):
                vulns.append({
                    "severity": "CRITICAL",
                    "cwe": "CWE-798",
                    "description": f"Hardcoded credential ({name}) committed directly to source code.",
                    "vulnerable_line": line.strip(),
                    "fix_code": "process.env.SECRET_KEY"
                })

    return vulns

class FinSecDetector:
    def __init__(self, model_id: str = "elsiddik/finsec_detector", use_local: bool = False):
        self.model_id = model_id
        self.use_local = use_local
        self.tokenizer = None
        self.model = None
        self._is_loaded = False

    def load_model(self):
        """Lazy loader for local transformers model."""
        if self._is_loaded:
            return

        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        if not is_local_model_cached(self.model_id):
            print(f"[*] Note: '{self.model_id}' is a 7B parameter model (~14.5 GB weights).")
            print("[*] Local execution will download model weights into ~/.cache/huggingface/hub.")
            print("[*] (Tip: For instant zero-download execution in 1-2s, use the --api flag or UI Cloud mode.)")

        print(f"[*] Loading FinSec detector: {self.model_id}...")
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_id)

        device = "cuda" if torch.cuda.is_available() else "cpu"
        load_kwargs = {}
        if device == "cuda":
            load_kwargs["device_map"] = "auto"
            load_kwargs["torch_dtype"] = torch.float16
        else:
            load_kwargs["torch_dtype"] = torch.float32

        self.model = AutoModelForCausalLM.from_pretrained(
            self.model_id,
            **load_kwargs
        )
        if device == "cpu":
            self.model.to("cpu")

        self.model.eval()
        self._is_loaded = True
        print("[+] FinSec detector model loaded successfully.")

    def run_inference_local(self, code_snippet: str) -> str:
        """Run inference using the local loaded transformers model."""
        import torch
        if not self._is_loaded:
            self.load_model()

        prompt = build_finsec_prompt(code_snippet)
        inputs = self.tokenizer(prompt, return_tensors="pt")
        inputs = {k: v.to(self.model.device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=1024,
                temperature=0.1,
                do_sample=False,
                pad_token_id=self.tokenizer.eos_token_id
            )

        input_len = inputs["input_ids"].shape[1]
        generated_tokens = outputs[0][input_len:]
        output_text = self.tokenizer.decode(generated_tokens, skip_special_tokens=True).strip()
        return output_text

    def run_inference_api(self, code_snippet: str) -> str:
        """Hugging Face Inference API (Zero 14GB download, fast cloud GPU inference)."""
        import requests
        prompt = build_finsec_prompt(code_snippet)
        api_url = f"https://api-inference.huggingface.co/models/{self.model_id}"
        headers = {}
        if HF_TOKEN:
            headers["Authorization"] = f"Bearer {HF_TOKEN}"

        response = requests.post(
            api_url,
            headers=headers,
            json={
                "inputs": prompt,
                "parameters": {
                    "max_new_tokens": 1024,
                    "temperature": 0.1,
                    "return_full_text": False
                }
            },
            timeout=15
        )
        response.raise_for_status()
        res_data = response.json()
        if isinstance(res_data, list) and len(res_data) > 0:
            return res_data[0].get("generated_text", "").strip()
        elif isinstance(res_data, dict):
            return res_data.get("generated_text", "").strip()
        return str(res_data)

    def analyze_code(self, code_snippet: str) -> List[Dict[str, Any]]:
        """Run FinSec model and parse strictly code errors into JSON format."""
        raw_output = ""

        # 1. Attempt local or API inference
        if self.use_local:
            try:
                raw_output = self.run_inference_local(code_snippet)
            except Exception as e:
                print(f"[!] Local FinSec inference unavailable: {e}. Using deterministic AppSec engine.")
                return analyze_code_heuristic(code_snippet)
        else:
            try:
                raw_output = self.run_inference_api(code_snippet)
            except Exception:
                return analyze_code_heuristic(code_snippet)

        # 2. Extract strictly JSON from model output
        cleaned = raw_output.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[len("```json"):].strip()
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:].strip()
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()

        parsed = {}
        try:
            parsed = json.loads(cleaned)
        except Exception:
            match = re.search(r"\{.*\}", cleaned, re.DOTALL)
            if match:
                try:
                    parsed = json.loads(match.group(0))
                except Exception:
                    pass

        vulns = parsed.get("vulnerabilities", [])
        if not isinstance(vulns, list):
            if isinstance(parsed, list):
                vulns = parsed
            else:
                vulns = []

        if not vulns:
            vulns = analyze_code_heuristic(code_snippet)

        return vulns

def scan_files_with_finsec(
    repo_path: str,
    target_files: List[str],
    detector: Optional[FinSecDetector] = None,
    commit_hash: Optional[str] = None
) -> List[ScannerFinding]:
    """Audit modified files with elsiddik/finsec_detector and produce KaalAstra ScannerFindings."""
    findings: List[ScannerFinding] = []
    base_p = Path(repo_path).resolve()

    if detector is None:
        detector = FinSecDetector(use_local=False)

    for rel_path in target_files:
        full_p = base_p / rel_path

        code_content = None
        # Try fetching exact commit version if commit_hash is supplied
        if commit_hash:
            try:
                cmd = ["git", "-C", str(base_p), "show", f"{commit_hash}:{rel_path}"]
                res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace")
                if res.returncode == 0 and res.stdout.strip():
                    code_content = res.stdout
            except Exception:
                pass

        if code_content is None:
            if not full_p.exists() or full_p.is_dir():
                continue
            try:
                with open(full_p, "r", encoding="utf-8", errors="replace") as f:
                    code_content = f.read()
            except Exception:
                continue

        file_lines = code_content.splitlines()
        vulns = detector.analyze_code(code_content)

        for v in vulns:
            cwe = v.get("cwe", "CWE-Unspecified")
            severity = str(v.get("severity", "HIGH")).upper()
            desc = v.get("description", "FinSec detected security bug")
            vuln_line = str(v.get("vulnerable_line", "")).strip()
            fix_code = str(v.get("fix_code", "")).strip()

            line_no = 1
            if vuln_line:
                for idx, line in enumerate(file_lines, 1):
                    if vuln_line in line or line.strip() in vuln_line:
                        line_no = idx
                        break

            msg = desc
            if fix_code:
                msg += f" (Suggested Fix: {fix_code[:100]}...)"

            findings.append(ScannerFinding(
                scanner_name="FinSec-AI (elsiddik/finsec_detector)",
                rule_id=f"FINSEC_{cwe.replace('-', '_')}",
                severity=severity,
                file_path=rel_path.replace("\\", "/"),
                start_line=line_no,
                end_line=line_no,
                message=msg,
                code_snippet=vuln_line or (file_lines[line_no - 1].strip() if line_no <= len(file_lines) else "")
            ))

    return findings
