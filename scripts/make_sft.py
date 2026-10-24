"""Build leakage-aware, source-labeled SFT JSONL for Kaggle.

No generated Patchwork analysis or SVEN evaluation fixture enters training.
Unknown root causes, locations, severity, and patches are never fabricated.
"""
import collections
import hashlib
import json
import pathlib
import random
import re
import urllib.parse
from risk_core import SCHEMA, make_prompt

ROOT = pathlib.Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "datasets/processed"
DEST = ROOT / "datasets/training"
SEED = 20261024

def records(name):
    with (PROCESSED / name).open(encoding="utf-8") as stream:
        for line in stream:
            yield json.loads(line)

def project_key(value):
    value = str(value or "").strip().lower().rstrip("/")
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme and parsed.netloc:
        bits = parsed.path.strip("/").removesuffix(".git").split("/")
        return "/".join(bits[:2]) if len(bits) >= 2 else bits[0]
    return value

def code_hash(code):
    return hashlib.sha256(re.sub(r"\s+", " ", code).strip().encode()).hexdigest()

def cwe_value(value):
    if isinstance(value, list):
        value = next((x for x in value if isinstance(x, str) and re.fullmatch(r"CWE-\d+", x)), None)
    return value if isinstance(value, str) and re.fullmatch(r"CWE-\d+", value) else None

def item(row, code, vulnerable, split, source):
    cwe = cwe_value(row.get("cwe")) if vulnerable else None
    code = code.strip()
    if not code or len(code) > 50000 or not project_key(row.get("project")):
        return None
    language = row.get("language") or "unknown"
    return {"schema": SCHEMA, "code": code, "prompt": make_prompt(code, language),
        "completion": [{"role": "assistant", "content": "A" if vulnerable else "B"}],
        "metadata": {"source": source, "source_split": split, "project": project_key(row.get("project")),
            "vulnerability_id": row.get("cve") or row.get("source_record_id"),
            "pair_id": row.get("pair_sha256"),
            "code_sha256": code_hash(code), "label": int(vulnerable), "cwe": cwe,
            "language": language}}

def main():
    DEST.mkdir(parents=True, exist_ok=True)
    delta = list(records("candidates.jsonl"))
    prime_pairs = list(records("primevul_pairs.jsonl"))
    strict = list(records("primevul_strict_train.jsonl"))
    patch_eval = {project_key((r.get("repo_owner") or "") + "/" + (r.get("repo_name") or ""))
        for r in records("patchwork_metadata.jsonl") if r.get("split") == "eval"}
    test_projects = {project_key(r["project"]) for r in delta if r["split"] == "test"}
    test_projects.update(project_key(r["project"]) for r in prime_pairs if r["source_split"] == "test")
    val_projects = {project_key(r["project"]) for r in delta if r["split"] == "validation"}
    val_projects.update(project_key(r["project"]) for r in prime_pairs if r["source_split"] == "valid")
    val_projects -= test_projects
    heldout_projects = test_projects | val_projects | patch_eval
    test_ids = {r.get("source_record_id") for r in delta if r["split"] == "test"}
    test_ids.update(r.get("cve") for r in prime_pairs if r["source_split"] == "test")
    test_ids -= {None, ""}
    val_ids = {r.get("source_record_id") for r in delta if r["split"] == "validation"}
    val_ids.update(r.get("cve") for r in prime_pairs if r["source_split"] == "valid")
    heldout_ids = (test_ids | val_ids) - {None, ""}
    pools = {"test": [], "validation": [], "train": []}
    rejected = collections.Counter()

    def add(row, code, vulnerable, split, source):
        candidate = item(row, code, vulnerable, split, source)
        if candidate is None:
            rejected["missing_provenance_or_bad_code"] += 1
        else:
            pools[split].append(candidate)

    for row in delta:
        split = row["split"]
        project = project_key(row["project"])
        if split == "train" and (project in heldout_projects or row.get("source_record_id") in heldout_ids):
            rejected["delta_train_heldout_overlap"] += 1
        elif split == "validation" and (project in test_projects or row.get("source_record_id") in test_ids):
            rejected["validation_project_or_id_in_test"] += 1
        else:
            add(row, row["before_code"], True, split, "DeltaSecommits")
    for row in prime_pairs:
        split = {"train": "train", "valid": "validation", "test": "test"}[row["source_split"]]
        project = project_key(row["project"])
        if split == "train" and (project in heldout_projects or row.get("cve") in heldout_ids):
            rejected["prime_pair_train_heldout_overlap"] += 1
        elif split == "validation" and (project in test_projects or row.get("cve") in test_ids):
            rejected["validation_project_or_id_in_test"] += 1
        else:
            add(row, row["before_code"], True, split, "PrimeVul")
            add(row, row["after_code"], False, split, "PrimeVul_fixed")
    for row in strict:
        if project_key(row["project"]) in heldout_projects or row.get("cve") in heldout_ids:
            rejected["full_train_heldout_overlap"] += 1
        else:
            add(row, row["code"], row["is_vulnerable"], "train", "PrimeVul_full")

    # Give the test split first claim to repeated code, then validation, then train.
    labels_by_hash = collections.defaultdict(set)
    for rows in pools.values():
        for row in rows:
            labels_by_hash[row["metadata"]["code_sha256"]].add(row["metadata"]["label"])
    seen_code = {}
    clean = {}
    for split in ("test", "validation", "train"):
        clean[split] = []
        for row in pools[split]:
            key = row["metadata"]["code_sha256"]
            if len(labels_by_hash[key]) > 1:
                rejected["contradictory_code_removed"] += 1
                continue
            if key in seen_code:
                rejected["duplicate_code"] += 1
                if seen_code[key] != row["metadata"]["label"]:
                    rejected["contradictory_duplicate"] += 1
                continue
            seen_code[key] = row["metadata"]["label"]
            clean[split].append(row)
    # Keep the training set practical and avoid a benign majority that swamps positives.
    positives = [r for r in clean["train"] if r["metadata"]["label"] == 1]
    negatives = [r for r in clean["train"] if r["metadata"]["label"] == 0]
    rng = random.Random(SEED)
    rng.shuffle(negatives)
    # Keep paired fixed versions before unrelated benign functions.
    negatives.sort(key=lambda row: row["metadata"]["source"] != "PrimeVul_fixed")
    count = min(len(positives), len(negatives))
    clean["train"] = positives[:count] + negatives[:count]
    for split in clean:
        rng.shuffle(clean[split])
        with (DEST / (split + ".jsonl")).open("w", encoding="utf-8") as output:
            for row in clean[split]:
                output.write(json.dumps(row, ensure_ascii=False) + "\n")
    summary = {"seed": SEED, "source_files": ["candidates.jsonl", "primevul_pairs.jsonl", "primevul_strict_train.jsonl", "patchwork_metadata.jsonl (eval project exclusion only)"],
        "status": "v2 binary classification corpus; no performance claim",
        "schema": SCHEMA,
        "splits": {split: {"total": len(rows), "vulnerable": sum(r["metadata"]["label"] for r in rows),
            "benign": sum(1-r["metadata"]["label"] for r in rows),
            "projects": len({r["metadata"]["project"] for r in rows}),
            "by_language": dict(collections.Counter(r["metadata"]["language"] for r in rows)),
            "by_source": dict(collections.Counter(r["metadata"]["source"] for r in rows))} for split, rows in clean.items()},
        "rejected": dict(rejected), "heldout_project_keys": len(heldout_projects),
        "output_schema": "A=vulnerable, B=no confirmed finding; binary next-token loss",
        "limitations": ["No verified exact line, root cause, severity, or minimal patch labels.",
            "PrimeVul labels are function-level; a no-finding label is not a proof of security.",
            "Code was not parsed or executed; source labels may contain errors."]}
    (DEST / "manifest.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))

if __name__ == "__main__":
    main()
