"""Compare a base Nemotron and its KAALASTRA adapter on the same held-out rows."""
import argparse
import contextlib
import json
import pathlib
import random

def parse_json(text):
    decoder = json.JSONDecoder()
    for index, char in enumerate(text):
        if char == "{":
            try:
                value, _ = decoder.raw_decode(text[index:])
                if isinstance(value, dict):
                    return value
            except json.JSONDecodeError:
                pass
    return None

def metrics(rows):
    tp = fp = tn = fn = malformed = cwe_right = cwe_total = 0
    for row in rows:
        actual = row["actual"]
        parsed = row["parsed"]
        if parsed is None or parsed.get("status") not in {"vulnerable", "no_confirmed_finding"}:
            malformed += 1
            predicted = 1  # Count unparseable responses as findings for conservative FPR.
        else:
            predicted = int(parsed["status"] == "vulnerable")
        tp += actual == 1 and predicted == 1
        fp += actual == 0 and predicted == 1
        tn += actual == 0 and predicted == 0
        fn += actual == 1 and predicted == 0
        if actual == 1 and predicted == 1:
            cwe_total += 1
            findings = parsed.get("findings", []) if isinstance(parsed, dict) else []
            found = findings[0].get("cwe") if findings and isinstance(findings[0], dict) else None
            cwe_right += found == row["expected_cwe"]
    return {"n": len(rows), "tp": tp, "fp": fp, "tn": tn, "fn": fn,
        "precision": tp / (tp + fp) if tp + fp else None,
        "recall": tp / (tp + fn) if tp + fn else None,
        "f1": 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else None,
        "false_positive_rate": fp / (fp + tn) if fp + tn else None,
        "cwe_accuracy_on_true_positives": cwe_right / cwe_total if cwe_total else None,
        "unparseable": malformed}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=pathlib.Path, required=True)
    parser.add_argument("--run-dir", type=pathlib.Path, required=True)
    parser.add_argument("--limit-per-class", type=int, default=30)
    args = parser.parse_args()
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
    from peft import PeftModel
    manifest = json.loads((args.run_dir / "run_manifest.json").read_text(encoding="utf-8"))
    rows = [json.loads(line) for line in (args.data_dir / "test.jsonl").open(encoding="utf-8")]
    rng = random.Random(manifest["seed"])
    positive = [r for r in rows if r["metadata"]["label"] == 1]
    negative = [r for r in rows if r["metadata"]["label"] == 0]
    rng.shuffle(positive)
    rng.shuffle(negative)
    sample = positive[:args.limit_per_class] + negative[:args.limit_per_class]
    rng.shuffle(sample)
    if not sample:
        raise RuntimeError("No held-out samples")
    model_id, revision = manifest["model"], manifest["model_revision"]
    trust = "NVIDIA-Nemotron-Nano-9B-v2" in model_id
    dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    quant = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=dtype)
    tokenizer = AutoTokenizer.from_pretrained(model_id, revision=revision, trust_remote_code=trust)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    base = AutoModelForCausalLM.from_pretrained(model_id, revision=revision,
        quantization_config=quant, device_map={"": 0}, torch_dtype=dtype, trust_remote_code=trust)
    model = PeftModel.from_pretrained(base, args.run_dir / "adapter")
    model.eval()
    results = {}
    for mode in ("base", "adapter"):
        predictions = []
        adapter_context = model.disable_adapter() if mode == "base" else contextlib.nullcontext()
        with adapter_context, torch.inference_mode():
            for number, row in enumerate(sample, 1):
                inputs = tokenizer.apply_chat_template(row["prompt"], tokenize=True,
                    add_generation_prompt=True, return_tensors="pt").to("cuda:0")
                output = model.generate(input_ids=inputs, max_new_tokens=192, do_sample=False,
                    pad_token_id=tokenizer.pad_token_id)
                text = tokenizer.decode(output[0][inputs.shape[-1]:], skip_special_tokens=True)
                predictions.append({"actual": row["metadata"]["label"],
                    "expected_cwe": row["metadata"].get("cwe"), "parsed": parse_json(text),
                    "raw_output": text, "source": row["metadata"]["source"]})
                if number % 10 == 0:
                    print(mode, number, "/", len(sample), flush=True)
        results[mode] = metrics(predictions)
        with (args.run_dir / ("predictions_" + mode + ".jsonl")).open("w", encoding="utf-8") as out:
            for row in predictions:
                out.write(json.dumps(row, ensure_ascii=False) + "\n")
    results["note"] = "Exact-line and patch correctness unavailable: held-out records lack independently verified labels. No commercial-product comparison was run."
    (args.run_dir / "heldout_results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    main()
