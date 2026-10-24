"""Fail before GPU work if the packaged corpus violates its split/label contract."""
import argparse
import collections
import hashlib
import json
import pathlib
import re
from risk_core import SCHEMA, read_rows, make_prompt, atomic_json

def audit(directory):
    keys, summary = {}, {}
    for split in ("train", "validation", "test"):
        rows = read_rows(directory / (split + ".jsonl"))
        labels, sources, languages = collections.Counter(), collections.Counter(), collections.Counter()
        keys[split] = {name: set() for name in ("project", "code_sha256", "vulnerability_id")}
        for row in rows:
            meta = row["metadata"]
            if row.get("schema") != SCHEMA or meta["label"] not in (0, 1):
                raise ValueError(f"{split}: wrong schema or label")
            if row["prompt"] != make_prompt(row["code"], meta["language"]):
                raise ValueError(f"{split}: prompt differs from shared inference contract")
            if row["completion"] != [{"role": "assistant", "content": "A" if meta["label"] else "B"}]:
                raise ValueError(f"{split}: inconsistent target")
            expected = hashlib.sha256(re.sub(r"\s+", " ", row["code"]).strip().encode()).hexdigest()
            if expected != meta["code_sha256"] or not meta["project"]:
                raise ValueError(f"{split}: missing provenance or code hash mismatch")
            if expected in keys[split]["code_sha256"]:
                raise ValueError(f"{split}: duplicate or conflicting code")
            for name in keys[split]:
                if meta.get(name): keys[split][name].add(meta[name])
            labels[meta["label"]] += 1
            sources[meta["source"]] += 1
            languages[meta["language"]] += 1
        if set(labels) != {0, 1}:
            raise ValueError(f"{split}: a class is missing")
        summary[split] = {"rows": len(rows), "classes": dict(labels), "sources": dict(sources),
            "languages": dict(languages), "projects": len(keys[split]["project"])}
    for left, right in (("train", "validation"), ("train", "test"), ("validation", "test")):
        for key in keys[left]:
            if keys[left][key] & keys[right][key]:
                raise ValueError(f"{left}/{right}: {key} leakage")
    if summary["train"]["classes"][0] != summary["train"]["classes"][1]:
        raise ValueError("Training corpus is not class balanced")
    return {"schema": SCHEMA, "passed": True, "splits": summary,
        "limitations": ["Near-duplicate semantic clones not excluded", "Upstream labels not independently executed",
        "No trusted patch, location, severity or attack-path targets", "Prior v1 results inspected part of this test split"]}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path)
    args = parser.parse_args()
    result = audit(args.data_dir)
    if args.output: atomic_json(args.output, result)
    print(json.dumps(result, indent=2))
