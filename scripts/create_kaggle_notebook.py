"""Generate the v2 notebook from the exact checked dataset package."""
import json
import pathlib
import textwrap

ROOT = pathlib.Path(__file__).resolve().parents[1]
PACKAGE = json.loads((ROOT / 'datasets/manifests/kaggle_package.json').read_text())
def cell(kind, text):
    value = {'cell_type': kind, 'metadata': {}, 'source': textwrap.dedent(text).strip().splitlines(True)}
    if kind == 'code': value.update(execution_count=None, outputs=[])
    return value

cells = [cell('markdown', '''
# KAALASTRA v2 — one bounded Nemotron risk-classification run
Attach the matching private dataset ZIP, enable a GPU and Internet, then use **Save Version → Save & Run All**.
This is a new binary classification objective. Do not mix old pilot adapters, scripts or cells with it.
Training is capped at two hours including model setup. The total 3h30 budget includes installation, downloads and evaluation.
A completed pipeline is not a guarantee of useful accuracy; inspect `candidate_gate_passed` and the actual metrics.
'''), cell('code', '''
import os, sys, time, pathlib, subprocess, json, hashlib, zipfile
SESSION_STARTED = time.time()
DEADLINE = SESSION_STARTED + 3.5 * 3600
single_gpu_env = {**os.environ, 'CUDA_VISIBLE_DEVICES': '0', 'TOKENIZERS_PARALLELISM': 'false'}
run_dir = pathlib.Path('/kaggle/working/kaalastra_run_v2')
print('Deadline (UTC):', time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(DEADLINE)))
'''), cell('code', '''
expected_zip = EXPECTED_ZIP
expected_files = EXPECTED_FILES
root = pathlib.Path('/kaggle/input')
matches = list(root.rglob('kaalastra-kaggle-sft.zip'))
if len(matches) == 1:
    package = matches[0]
    assert hashlib.sha256(package.read_bytes()).hexdigest() == expected_zip, 'Wrong dataset version: upload the matching ZIP.'
    data_dir = pathlib.Path('/kaggle/working/kaalastra_sft_v2')
    data_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(package) as archive:
        assert set(archive.namelist()) == set(expected_files), 'Unexpected ZIP entries'
        for entry in archive.namelist():
            assert pathlib.PurePosixPath(entry).name == entry and '\\\\' not in entry
        archive.extractall(data_dir)
else:
    assert not matches, 'Attach only one version of the dataset.'
    candidates = [p.parent for p in root.rglob('run_kaggle.py') if all((p.parent / name).is_file() for name in expected_files)]
    assert len(candidates) == 1, 'Attach exactly one matching v2 dataset (ZIP or unpacked files).'
    data_dir = candidates[0]
for name, expected in expected_files.items():
    actual = hashlib.sha256((data_dir / name).read_bytes()).hexdigest()
    assert actual == expected, f'{name} mismatch. Replace dataset and notebook together; do not bypass this check.'
print('Verified:', data_dir)
print(json.dumps(json.loads((data_dir / 'manifest.json').read_text())['splits'], indent=2))
'''.replace('EXPECTED_ZIP', repr(PACKAGE['sha256'])).replace('EXPECTED_FILES', repr(PACKAGE['contents']))), cell('markdown', '''
The next cell uses a separate Python environment for training, inheriting Kaggle's CUDA PyTorch.
It leaves the notebook kernel's package installation unchanged. No Gradio or Diffusers imports are needed.
If the model requires authentication, add a Kaggle secret named `HF_TOKEN` before starting.
'''), cell('code', '''
venv_dir = pathlib.Path('/kaggle/working/kaalastra_env')
subprocess.run([sys.executable, '-m', 'venv', '--system-site-packages', '--without-pip', str(venv_dir)], check=True, timeout=120)
python = str(venv_dir / 'bin/python')
subprocess.run([sys.executable, '-m', 'pip', '--python', python, 'install', '--disable-pip-version-check',
    'transformers==4.57.6', 'peft==0.21.2', 'accelerate==1.11.0',
    'bitsandbytes==0.50.2', 'huggingface-hub==0.36.2'], check=True, timeout=900)
try:
    from kaggle_secrets import UserSecretsClient
    token = UserSecretsClient().get_secret('HF_TOKEN')
    if token: single_gpu_env['HF_TOKEN'] = token
except Exception:
    print('No HF_TOKEN secret loaded; using public model access.')
check = "import sys; sys.path.insert(0, sys.argv[1]); import torch, transformers, peft, accelerate, bitsandbytes; from risk_model import gpu_check; print('GPU:', gpu_check().name); print('Training imports OK:', torch.__version__, transformers.__version__, peft.__version__, accelerate.__version__, bitsandbytes.__version__)"
subprocess.run([python, '-c', check, str(data_dir)], check=True, env=single_gpu_env, timeout=120)
'''), cell('markdown', '''
## Train, compare, export
One command runs the corpus audit, longest-example forward/backward preflight, training, validation threshold selection, paired test and export.
There is no separate pilot. Checkpoints are saved every 40 optimizer steps; predictions are saved after each example.
If a stage fails, the run reports **incomplete** and exports whatever was saved. A timeout is not a successful evaluation.
'''), cell('code', '''
command = [python, '-u', str(data_dir / 'run_kaggle.py'), '--data-dir', str(data_dir),
    '--run-dir', str(run_dir), '--deadline-unix', str(DEADLINE)]
print('Running:', ' '.join(command))
result = subprocess.run(command, env=single_gpu_env)
print('Pipeline exit code:', result.returncode)
if result.returncode:
    print('INCOMPLETE: inspect pipeline_status.json and logs. Saved adapters and predictions are preserved.')
'''), cell('code', '''
from IPython.display import display, FileLink
for name in ('pipeline_status.json', 'heldout_results.json'):
    path = run_dir / name
    if path.exists(): print(name, path.read_text())
archive = pathlib.Path('/kaggle/working/kaalastra_adapter.zip')
if archive.exists():
    display(FileLink(str(archive)))
    print('Download kaalastra_adapter.zip from the saved notebook version Output tab.')
else:
    print('No export exists: inspect the setup cell errors.')
print('Do not reset the session until artifacts are saved or downloaded.')
'''), cell('markdown', '''
## Read the result before deployment
`pipeline_status.status=complete` means the pipeline completed. `heldout_results.candidate_gate_passed` separately checks recall >= 0.60,
false-positive rate <= 0.20 and improvement in both F1 and balanced accuracy against the same base model.
This is an exploratory local comparison, not a SOTA or production certification. Prior v1 development inspected part of the test data.
The adapter classifies complete functions up to 768 prompt tokens; it does not provide verified CWE, line numbers, fixes or repository coverage.

If a session disappears, only downloaded or persisted outputs can be recovered. The ZIP includes adapter, tokenizer, manifests,
thresholds, predictions, logs and available metrics. Trainer checkpoints stay in the output directory, outside the portable ZIP.
See `docs/KAGGLE_TRAINING.md` in the project for recovery and inference commands.
''')]
notebook = {'cells': cells, 'metadata': {'kernelspec': {'display_name': 'Python 3', 'language': 'python', 'name': 'python3'},
    'language_info': {'name': 'python'}, 'kaggle': {'accelerator': 'gpu', 'isInternetEnabled': True}}, 'nbformat': 4, 'nbformat_minor': 5}
for index, entry in enumerate(cells): entry['id'] = f'kaalastra-v2-{index}'
path = ROOT / 'notebooks/kaalastra_nemotron_kaggle.ipynb'
path.write_text(json.dumps(notebook, indent=2), encoding='utf-8')
print(path)
