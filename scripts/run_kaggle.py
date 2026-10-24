"""Single entry point: audit -> one bounded train -> paired evaluation -> export."""
import argparse
import json
import os
import pathlib
import subprocess
import sys
import threading
import time
from audit_training_data import audit
from export_run import export_run
from risk_core import SCHEMA, atomic_json

def stage(command, env, log_path, timeout):
    if timeout < 60: raise TimeoutError("Insufficient remaining time for the next stage")
    with log_path.open("a", encoding="utf-8") as log:
        process = subprocess.Popen(command, env=env, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace", bufsize=1)
        def relay():
            for line in process.stdout:
                log.write(line)
                log.flush()
                print(line, end="", flush=True)
        reader = threading.Thread(target=relay, daemon=True)
        reader.start()
        try:
            code = process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
            raise TimeoutError("Stage reached its time budget; the latest saved artifacts are preserved")
        finally:
            reader.join(timeout=10)
        if code: raise RuntimeError(f"Stage exited with code {code}; inspect {log_path.name}")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=pathlib.Path, required=True)
    parser.add_argument("--run-dir", type=pathlib.Path, default=pathlib.Path('/kaggle/working/kaalastra_run_v2'))
    parser.add_argument("--deadline-unix", type=float, default=0)
    args = parser.parse_args()
    deadline = args.deadline_unix or time.time() + 3.5 * 3600
    args.run_dir.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, "CUDA_VISIBLE_DEVICES": "0", "TOKENIZERS_PARALLELISM": "false"}
    home = pathlib.Path(__file__).resolve().parent
    report = {"schema": SCHEMA, "status": "running", "started_unix": time.time(), "deadline_unix": deadline}
    try:
        atomic_json(args.run_dir / 'data_audit.json', audit(args.data_dir))
        manifest_path = args.run_dir / 'run_manifest.json'
        manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
        if manifest and manifest.get('schema') != SCHEMA: raise ValueError('Output directory contains a different model objective')
        if not manifest.get('training_complete'):
            seconds = min(2 * 3600, deadline - time.time() - 3600)
            if seconds < 300: raise TimeoutError('Less than five minutes remain for training after evaluation reserve')
            command = [sys.executable, '-u', str(home / 'train_kaggle.py'), '--data-dir', str(args.data_dir),
                '--output-dir', str(args.run_dir), '--max-length', '768', '--train-seconds', str(seconds)]
            if manifest: command.append('--resume')
            stage(command, env, args.run_dir / 'training.log', min(seconds, deadline - time.time() - 120))
        export_run(args.run_dir)
        stage([sys.executable, '-u', str(home / 'evaluate_kaggle.py'), '--data-dir', str(args.data_dir),
            '--run-dir', str(args.run_dir), '--limit-per-class', '100', '--deadline-unix', str(deadline - 60)],
            env, args.run_dir / 'evaluation.log', deadline - time.time() - 60)
        report['status'] = 'complete'
    except Exception as error:
        report.update(status='incomplete', error=str(error))
        raise
    finally:
        report['finished_unix'] = time.time()
        atomic_json(args.run_dir / 'pipeline_status.json', report)
        print('Saved:', export_run(args.run_dir), flush=True)
        print(json.dumps(report, indent=2), flush=True)

if __name__ == '__main__': main()
