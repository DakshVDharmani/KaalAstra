"""Preserve PrimeVul's paired splits; flag cross-split project contamination."""
import collections
import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "datasets/raw/primevul"
OUT = ROOT / "datasets/processed"

def norm(text):
    return re.sub(r"\s+", " ", text).strip()

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    stats = {}
    projects = {}
    all_hashes = {}
    with (OUT / "primevul_pairs.jsonl").open("w", encoding="utf-8") as output:
        for split in ("train", "valid", "test"):
            path = RAW / (split + "_paired.jsonl")
            rows = [json.loads(line) for line in path.open(encoding="utf-8")]
            counts = collections.Counter()
            projects[split] = set()
            for index in range(0, len(rows), 2):
                pair = rows[index:index + 2]
                counts["input_pairs"] += 1
                if len(pair) != 2 or {x.get("target") for x in pair} != {0, 1}:
                    counts["rejected_unpaired"] += 1
                    continue
                vuln = next(x for x in pair if x["target"] == 1)
                fixed = next(x for x in pair if x["target"] == 0)
                if (vuln.get("project_url"), vuln.get("commit_id"), vuln.get("cve")) != (fixed.get("project_url"), fixed.get("commit_id"), fixed.get("cve")):
                    counts["rejected_pair_mismatch"] += 1
                    continue
                before, after = vuln.get("func") or "", fixed.get("func") or ""
                if not norm(before) or not norm(after) or norm(before) == norm(after) or max(len(before), len(after)) > 50000:
                    counts["rejected_code_quality"] += 1
                    continue
                key = hashlib.sha256((norm(before) + "\0" + norm(after)).encode()).hexdigest()
                if key in all_hashes:
                    counts["rejected_duplicate_pair"] += 1
                    continue
                all_hashes[key] = split
                project = vuln.get("project_url") or vuln.get("project")
                projects[split].add(project)
                output.write(json.dumps({"source": "PrimeVul", "source_split": split, "project": project,
                    "commit_url": vuln.get("commit_url"), "commit_sha": vuln.get("commit_id"), "cve": vuln.get("cve"),
                    "cwe": vuln.get("cwe"), "language": "c_or_cpp", "before_code": before, "after_code": after,
                    "pair_sha256": key, "root_cause": None, "exact_vulnerable_line": None}, ensure_ascii=False) + "\n")
                counts["accepted_pairs"] += 1
            stats[split] = dict(counts)
            stats[split]["projects"] = len(projects[split])
            stats[split]["raw_sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
    stats["train_test_project_overlap"] = len(projects["train"] & projects["test"])
    stats["train_valid_project_overlap"] = len(projects["train"] & projects["valid"])
    stats["note"] = "Publisher splits preserved; projects overlap, so use cross-project holdout for independent claims."
    (OUT / "primevul_statistics.json").write_text(json.dumps(stats, indent=2), encoding="utf-8")
    print(json.dumps(stats, indent=2))

if __name__ == "__main__":
    main()
