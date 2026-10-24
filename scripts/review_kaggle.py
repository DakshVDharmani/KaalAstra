"""Risk classification of one complete function; never invent locations or patches."""
import argparse
import json
import pathlib
from risk_core import SCHEMA, make_prompt, prompt_ids, token_ids
from risk_model import load_base, score

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-dir", type=pathlib.Path, required=True)
    parser.add_argument("--code-file", type=pathlib.Path, required=True)
    parser.add_argument("--language", required=True)
    args = parser.parse_args()
    manifest = json.loads((args.run_dir / "run_manifest.json").read_text())
    if manifest.get("schema") != SCHEMA: raise RuntimeError("This wrapper requires a v2 risk-classification adapter")
    thresholds = json.loads((args.run_dir / "thresholds.json").read_text())
    from transformers import AutoTokenizer
    from peft import PeftModel
    tokenizer = AutoTokenizer.from_pretrained(args.run_dir / "adapter")
    code = args.code_file.read_text(encoding="utf-8")
    if not code.strip(): raise ValueError("Code file is empty")
    ids = prompt_ids(tokenizer, make_prompt(code, args.language))
    if len(ids) > manifest["max_length"]:
        print(json.dumps({"status": "not_assessed", "reason": "Function exceeds the evaluated token limit",
            "input_tokens": len(ids), "limit": manifest["max_length"]}))
        return
    model = PeftModel.from_pretrained(load_base(manifest["model"], manifest["model_revision"]), args.run_dir / "adapter")
    model.eval()
    value = score(model, ids, token_ids(tokenizer))
    threshold = thresholds["thresholds"]["adapter"]
    print(json.dumps({"status": "vulnerable" if value >= threshold else "no_confirmed_finding",
        "risk_score": value, "threshold": threshold, "input_tokens": len(ids),
        "cwe": None, "location": None, "patch": None,
        "uncertainty": "Function-level classification only. Score is not a calibrated probability; no finding is not proof of safety."}, indent=2))

if __name__ == "__main__": main()
