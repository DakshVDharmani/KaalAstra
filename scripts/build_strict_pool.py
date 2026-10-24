"""Build a conservative PrimeVul training pool isolated from held-out projects."""
import collections
import hashlib
import json
import pathlib
import re
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "datasets/raw/primevul/train_full.jsonl"
OUT = ROOT / "datasets/processed"

def project_key(value):
    value = str(value or "").strip().lower().rstrip("/")
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme and parsed.netloc:
        parts = parsed.path.strip("/").removesuffix(".git").split("/")
        if len(parts) >= 2:
            return "/".join(parts[:2])
        return parts[0]
    return value

def code_key(value):
    return hashlib.sha256(re.sub(r"\s+", " ", value).strip().encode()).hexdigest()

def lines(path):
    with path.open(encoding="utf-8") as stream:
        for line in stream:
            yield json.loads(line)

def main():
    held_projects = set()
    held_codes = set()
    for row in lines(OUT / "candidates.jsonl"):
        if row["split"] != "train":
            held_projects.add(project_key(row["project"]))
            held_codes.update((code_key(row["before_code"]), code_key(row["after_code"])))
    for row in lines(OUT / "primevul_pairs.jsonl"):
        if row["source_split"] != "train":
            held_projects.add(project_key(row["project"]))
            held_codes.update((code_key(row["before_code"]), code_key(row["after_code"])))
    for row in lines(OUT / "patchwork_metadata.jsonl"):
        if row["split"] == "eval":
            held_projects.add(project_key((row.get("repo_owner") or "") + "/" + (row.get("repo_name") or "")))
    labels_by_code = collections.defaultdict(set)
    for row in lines(RAW):
        code = row.get("func") or ""
        if code:
            labels_by_code[code_key(code)].add(row.get("target"))
    counts = collections.Counter()
    seen = set()
    with (OUT / "primevul_strict_train.jsonl").open("w", encoding="utf-8") as output:
        for row in lines(RAW):
            counts["input_rows"] += 1
            code = row.get("func") or ""
            project = project_key(row.get("project_url") or row.get("project"))
            key = code_key(code)
            if project in held_projects:
                counts["rejected_heldout_project"] += 1
            elif key in held_codes:
                counts["rejected_heldout_code"] += 1
            elif not code.strip() or len(code) > 50000:
                counts["rejected_code_quality"] += 1
            elif len(labels_by_code[key]) != 1:
                counts["rejected_conflicting_labels"] += 1
            elif key in seen:
                counts["rejected_duplicate_code"] += 1
            else:
                seen.add(key)
                output.write(json.dumps({"source": "PrimeVul", "source_split": "train", "project": project,
                    "commit_url": row.get("commit_url"), "cve": row.get("cve"), "cwe": row.get("cwe"),
                    "language": "c_or_cpp", "code": code, "is_vulnerable": bool(row["target"]),
                    "code_sha256": key, "exact_vulnerable_line": None}, ensure_ascii=False) + "\n")
                counts["accepted_vulnerable" if row["target"] else "accepted_benign"] += 1
    counts["heldout_project_keys"] = len(held_projects)
    counts["heldout_code_hashes"] = len(held_codes)
    counts["source_sha256"] = hashlib.sha256(RAW.read_bytes()).hexdigest()
    (OUT / "strict_pool_statistics.json").write_text(json.dumps(counts, indent=2), encoding="utf-8")
    print(json.dumps(counts, indent=2))

if __name__ == "__main__":
    main()
