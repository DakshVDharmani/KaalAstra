"""Reproduce public dataset downloads from the tracked SHA-256 manifest."""
import hashlib
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "datasets/manifests/downloads.json"

def digest(path):
    sha = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            sha.update(chunk)
    return sha.hexdigest()

def main():
    for record in json.loads(MANIFEST.read_text(encoding="utf-8")):
        target = ROOT / record["path"]
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and target.stat().st_size == record["bytes"] and digest(target) == record["sha256"]:
            print(record["source"], "verified")
            continue
        partial = target.with_name(target.name + ".partial")
        result = subprocess.run(["curl.exe", "-sS", "-L", "--fail", "--retry", "2", "--connect-timeout", "15", "--max-time", "240", "-o", str(partial), record["url"]], timeout=260, check=False)
        if result.returncode or not partial.exists() or partial.stat().st_size != record["bytes"] or digest(partial) != record["sha256"]:
            partial.unlink(missing_ok=True)
            raise RuntimeError("download or checksum failed: " + record["source"])
        partial.replace(target)
        print(record["source"], "downloaded and verified")

if __name__ == "__main__":
    main()
