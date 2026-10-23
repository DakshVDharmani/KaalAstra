"""Extract only SVEN evaluation fixtures without executing downloaded files."""
import hashlib
import json
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / "datasets/evaluation/sven-master.zip"
TARGET = ROOT / "datasets/evaluation/sven"

def main():
    counts = {"files": 0, "bytes": 0, "sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest()}
    with zipfile.ZipFile(SOURCE) as archive:
        if archive.testzip():
            raise ValueError("corrupt SVEN archive")
        for info in archive.infolist():
            prefix = "sven-master/data_eval/"
            if not info.filename.startswith(prefix) or info.is_dir():
                continue
            rel = pathlib.PurePosixPath(info.filename[len(prefix):])
            if rel.is_absolute() or ".." in rel.parts or info.file_size > 2_000_000:
                raise ValueError("unsafe archive entry")
            dest = TARGET.joinpath(*rel.parts)
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(archive.read(info))
            counts["files"] += 1
            counts["bytes"] += info.file_size
    (ROOT / "datasets/manifests/sven_extraction.json").write_text(json.dumps(counts, indent=2), encoding="utf-8")
    print(json.dumps(counts, indent=2))

if __name__ == "__main__":
    main()
