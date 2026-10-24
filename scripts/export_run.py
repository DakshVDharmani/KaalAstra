"""Atomic exports include predictions and incomplete-run diagnostics, not checkpoints."""
import argparse
import pathlib
import zipfile

def export_run(run_dir, output=None):
    run_dir = pathlib.Path(run_dir)
    output = pathlib.Path(output) if output else run_dir.parent / "kaalastra_adapter.zip"
    temporary = output.with_suffix(".partial.zip")
    with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(run_dir.rglob("*")):
            relative = path.relative_to(run_dir)
            if path.is_file() and "checkpoints" not in relative.parts and path.suffix not in (".tmp", ".zip"):
                archive.write(path, relative)
    temporary.replace(output)
    return output

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-dir", type=pathlib.Path, required=True)
    args = parser.parse_args()
    print(export_run(args.run_dir))
