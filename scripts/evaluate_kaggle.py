"""Comparable A/B scoring, validation-only thresholds, streamed resumable predictions."""
import argparse
import collections
import contextlib
import hashlib
import json
import os
import pathlib
import random
import time
from risk_core import (SCHEMA, atomic_json, choose_threshold, cluster_intervals, digest,
    encode_rows, metrics, read_rows, token_ids)
from risk_model import load_base, score
from export_run import export_run

def cached_predictions(path, identity):
    cache = {}
    if not path.exists(): return cache
    lines = path.read_text(encoding="utf-8").splitlines()
    for index, line in enumerate(lines):
        try: row = json.loads(line)
        except json.JSONDecodeError:
            if index != len(lines) - 1: raise
            break  # Interrupted final write; recover the complete lines.
        if row["cache_identity"] != identity: raise ValueError("Prediction cache belongs to a different model/data configuration")
        cache[row["id"]] = row
    path.write_text("".join(json.dumps(row) + "\n" for row in cache.values()), encoding="utf-8")
    return cache

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=pathlib.Path, required=True)
    parser.add_argument("--run-dir", type=pathlib.Path, required=True)
    parser.add_argument("--limit-per-class", type=int, default=100)
    parser.add_argument("--deadline-unix", type=float, default=0)
    args = parser.parse_args()
    if args.limit_per_class < 0: raise ValueError("limit-per-class must be nonnegative")
    manifest = json.loads((args.run_dir / "run_manifest.json").read_text())
    if manifest.get("schema") != SCHEMA:
        raise RuntimeError("This evaluator requires a v2 classifier adapter; the old JSON pilot is a different objective")
    from transformers import AutoTokenizer
    from peft import PeftModel
    tokenizer = AutoTokenizer.from_pretrained(args.run_dir / "adapter")
    answer_ids = token_ids(tokenizer)
    splits, excluded = {}, {}
    for split in ("validation", "test"):
        data_path = args.data_dir / (split + ".jsonl")
        if digest(data_path) != manifest["data_hashes"][split]: raise ValueError("Evaluation data differs from training manifest")
        splits[split], excluded[split] = encode_rows(read_rows(data_path), tokenizer, manifest["max_length"])
        if {row["labels"] for row in splits[split]} != {0, 1}: raise ValueError("Both evaluation classes are required")
        if split == "test" and args.limit_per_class:
            rng = random.Random(manifest["seed"])
            rng.shuffle(splits[split])
            splits[split] = [r for label in (0, 1) for r in [x for x in splits[split] if x["labels"] == label][:args.limit_per_class]]
    identity = hashlib.sha256(json.dumps({"schema": SCHEMA, "manifest": manifest,
        "adapter_sha256": digest(args.run_dir / "adapter/adapter_model.safetensors")}, sort_keys=True).encode()).hexdigest()
    base = load_base(manifest["model"], manifest["model_revision"])
    model = PeftModel.from_pretrained(base, args.run_dir / "adapter")
    model.eval()
    scored = {}
    for split in ("validation", "test"):
        scored[split] = {}
        for mode in ("base", "adapter"):
            path = args.run_dir / f"predictions_{split}_{mode}.jsonl"
            cache = cached_predictions(path, identity)
            adapter_context = model.disable_adapter() if mode == "base" else contextlib.nullcontext()
            with adapter_context, path.open("a", encoding="utf-8") as stream:
                for number, row in enumerate(splits[split], 1):
                    key = row["metadata"]["code_sha256"]
                    if key not in cache:
                        if args.deadline_unix and time.time() > args.deadline_unix - 30:
                            raise TimeoutError("Evaluation deadline reached; completed predictions are saved and resumable")
                        risk = score(model, row["input_ids"], answer_ids)
                        record = {"id": key, "actual": row["labels"], "score": risk,
                            "project": row["metadata"]["project"], "language": row["metadata"]["language"],
                            "source": row["metadata"]["source"], "cwe": row["metadata"].get("cwe"),
                            "cache_identity": identity}
                        if not 0 <= risk <= 1: raise RuntimeError("Nonfinite risk score")
                        stream.write(json.dumps(record) + "\n")
                        stream.flush()
                        os.fsync(stream.fileno())
                        cache[key] = record
                    if number % 25 == 0: print(split, mode, number, "/", len(splits[split]), flush=True)
            scored[split][mode] = [cache[row["metadata"]["code_sha256"]] for row in splits[split]]
            export_run(args.run_dir)

    report = {"schema": SCHEMA, "comparison": "Same quantized Nemotron base versus v2 adapter; constrained A/B scoring",
        "max_input_tokens": manifest["max_length"], "excluded_for_length": excluded,
        "test_caveat": "Exploratory: part of this held-out dataset was inspected during v1 development; not an independent SOTA benchmark",
        "score_caveat": "Two-answer softmax is a risk score, not a calibrated probability of exploitability",
        "validation": {}, "test": {}, "by_language": {}}
    thresholds = {}
    for mode in ("base", "adapter"):
        validation = scored["validation"][mode]
        selected = choose_threshold([r["actual"] for r in validation], [r["score"] for r in validation], max_fpr=.2)
        thresholds[mode] = selected["threshold"]
        report["validation"][mode] = selected
        rows = scored["test"][mode]
        report["test"][mode] = metrics([r["actual"] for r in rows], [r["score"] for r in rows], thresholds[mode])
        report["by_language"][mode] = {}
        for language in sorted({r["language"] for r in rows}):
            subset = [r for r in rows if r["language"] == language]
            report["by_language"][mode][language] = metrics([r["actual"] for r in subset], [r["score"] for r in subset], thresholds[mode])
    paired = [{"actual": a["actual"], "project": a["project"], "base": b["score"], "adapter": a["score"]}
        for b, a in zip(scored["test"]["base"], scored["test"]["adapter"])]
    report["paired_project_bootstrap_delta_95pct"] = cluster_intervals(paired, thresholds)
    report["improved_metrics"] = [name for name in ("f1", "balanced_accuracy")
        if report["test"]["adapter"][name] > report["test"]["base"][name]]
    current = report["test"]["adapter"]
    report["candidate_gate_passed"] = (current["recall"] >= .6 and current["false_positive_rate"] <= .2
        and len(report["improved_metrics"]) == 2)
    report["gate_note"] = "A local candidate gate only; no claim of superiority to other security products or production readiness"
    atomic_json(args.run_dir / "thresholds.json", {"schema": SCHEMA, "selection_split": "validation", "thresholds": thresholds})
    atomic_json(args.run_dir / "heldout_results.json", report)
    print(json.dumps(report, indent=2), flush=True)
    print("Export:", export_run(args.run_dir), flush=True)

if __name__ == "__main__": main()
