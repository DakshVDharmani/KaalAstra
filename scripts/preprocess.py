"""Prepare source-backed candidates without inventing explanations or fixes."""
import collections
import hashlib
import json
import pathlib
import re

import pyarrow.parquet as pq

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "datasets" / "raw" / "DeltaSecommits_train.parquet"
OUT = ROOT / "datasets" / "processed"
PRIORITY = {22, 78, 79, 89, 918, 502, 287, 862, 863, 798, 367, 362, 20, 915, 1321, 400, 190, 416, 787, 125}
LANGUAGE = {"js": "javascript", "ts": "typescript", "php": "php", "py": "python", "c": "c", "cc": "cpp", "cpp": "cpp", "h": "c", "hpp": "cpp"}

def canonical(code):
    return re.sub(r"\s+", " ", code).strip()

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rows = pq.read_table(RAW).to_pylist()
    seen = set()
    counts = collections.Counter()
    splits = collections.Counter()
    with (OUT / "candidates.jsonl").open("w", encoding="utf-8") as accepted, (OUT / "rejected_records.jsonl").open("w", encoding="utf-8") as rejected:
        for row in rows:
            cwe = row.get("cwe") or ""
            ext = (row.get("file_extension") or "").lower().lstrip(".")
            before = row.get("prior_version") or ""
            after = row.get("after_version") or ""
            project = (row.get("project") or "").rstrip("/").lower()
            reason = None
            if ext not in LANGUAGE or not re.fullmatch(r"CWE-\d+", cwe):
                reason = "unsupported_language_or_cwe"
            elif not project or not row.get("commit_href") or not row.get("vuln_id"):
                reason = "missing_provenance"
            elif not canonical(before) or not canonical(after) or canonical(before) == canonical(after):
                reason = "missing_or_identical_pair"
            elif len(before) > 50000 or len(after) > 50000:
                reason = "oversized_pair"
            key = hashlib.sha256((canonical(before) + "\0" + canonical(after)).encode()).hexdigest()
            if not reason and key in seen:
                reason = "duplicate_pair"
            if reason:
                counts["rejected_" + reason] += 1
                rejected.write(json.dumps({"source": "DeltaSecommits", "vuln_id": row.get("vuln_id"), "reason": reason}) + "\n")
                continue
            seen.add(key)
            project_hash = int(hashlib.sha256(project.encode()).hexdigest()[:8], 16) % 100
            split = "test" if project_hash < 10 else "validation" if project_hash < 20 else "train"
            splits[split] += 1
            cwe_num = int(cwe[4:])
            candidate = {
                "source": "DeltaSecommits", "source_record_id": row["vuln_id"], "project": project,
                "commit_url": row["commit_href"], "commit_sha": row.get("commit_sha"),
                "language": LANGUAGE[ext], "cwe": cwe, "before_code": before, "after_code": after,
                "file_paths": row.get("file_paths_str"), "summary": row.get("summary"),
                "split": split, "pair_sha256": key, "priority_cwe": cwe_num in PRIORITY,
                "verified_fix_evidence": "linked advisory and fixing commit; patch correctness not independently tested",
                "root_cause": None, "attack_path": None, "exact_vulnerable_line": None,
            }
            accepted.write(json.dumps(candidate, ensure_ascii=False) + "\n")
            counts["accepted"] += 1
            counts["priority_cwe"] += int(cwe_num in PRIORITY)
    stats = {"input_rows": len(rows), **counts, "splits": dict(splits), "split_method": "sha256(project), 80/10/10", "source_sha256": hashlib.sha256(RAW.read_bytes()).hexdigest()}
    (OUT / "dataset_statistics.json").write_text(json.dumps(stats, indent=2), encoding="utf-8")
    print(json.dumps(stats, indent=2))

if __name__ == "__main__":
    main()
