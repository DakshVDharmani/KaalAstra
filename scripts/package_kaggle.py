"""Create the single private Kaggle Dataset ZIP used by the notebook."""
import hashlib
import json
import pathlib
import zipfile
from audit_training_data import audit

ROOT = pathlib.Path(__file__).resolve().parents[1]
TRAIN = ROOT / "datasets/training"
PACKAGE = ROOT / "datasets/kaalastra-kaggle-sft.zip"
FILES = {
    "train.jsonl": TRAIN / "train.jsonl",
    "validation.jsonl": TRAIN / "validation.jsonl",
    "test.jsonl": TRAIN / "test.jsonl",
    "manifest.json": TRAIN / "manifest.json",
    "train_kaggle.py": ROOT / "scripts/train_kaggle.py",
    "evaluate_kaggle.py": ROOT / "scripts/evaluate_kaggle.py",
    "review_kaggle.py": ROOT / "scripts/review_kaggle.py",
}
for script in ('risk_core', 'risk_model', 'audit_training_data', 'export_run', 'run_kaggle'):
    FILES[script + '.py'] = ROOT / 'scripts' / (script + '.py')

def main():
    audit(TRAIN)
    for name, path in FILES.items():
        if not path.is_file():
            raise FileNotFoundError(f"Missing {name}: {path}")
    with zipfile.ZipFile(PACKAGE, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for name, path in FILES.items():
            archive.write(path, name)
    digest = hashlib.sha256(PACKAGE.read_bytes()).hexdigest()
    summary = {"path": str(PACKAGE.relative_to(ROOT)), "bytes": PACKAGE.stat().st_size,
        "sha256": digest, "contents": {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in FILES.items()}}
    (ROOT / "datasets/manifests/kaggle_package.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))

if __name__ == "__main__":
    main()
