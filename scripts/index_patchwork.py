"""Index Patchwork metadata while preserving its publisher's held-out eval split."""
import collections
import gzip
import hashlib
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / "datasets/raw/patchwork-cve_patchwork-cve.jsonl.gz"
OUT = ROOT / "datasets/processed"

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    counts = collections.Counter()
    patch_splits = collections.defaultdict(set)
    with gzip.open(SOURCE, "rt", encoding="utf-8") as stream, (OUT / "patchwork_metadata.jsonl").open("w", encoding="utf-8") as dest:
        for line in stream:
            row = json.loads(line)
            counts["input_rows"] += 1
            split = row.get("split")
            if row.get("patch_sha256"):
                patch_splits[row["patch_sha256"]].add(split)
            # v1.0 has forced CWE values on refusals; exclude them.
            if not row.get("analyzable") or not row.get("cwe_final"):
                counts["rejected_refusal_or_missing_cwe"] += 1
                continue
            if split not in {"train", "eval"}:
                counts["rejected_invalid_split"] += 1
                continue
            output = {k: row.get(k) for k in ("cve", "osv_id", "ecosystem", "repo_owner", "repo_name", "fix_sha", "patch_sha256", "cwe_final", "advisory_cwe", "label_source", "split")}
            output["source"] = "patchwork-cve v1.0"
            output["source_url"] = "https://github.com/TayR-D/patchwork-cve"
            output["code_available"] = False
            output["analysis_is_model_generated"] = True
            dest.write(json.dumps(output) + "\n")
            counts["accepted_" + split] += 1
    counts["patch_hash_cross_split_collisions"] = sum(len(s) > 1 for s in patch_splits.values())
    counts["source_sha256"] = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    (OUT / "patchwork_statistics.json").write_text(json.dumps(counts, indent=2), encoding="utf-8")
    print(json.dumps(counts, indent=2))

if __name__ == "__main__":
    main()
