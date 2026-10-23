"""Generate the ready-to-import Kaggle notebook from the checked package hash."""
import json
import pathlib
import textwrap

ROOT = pathlib.Path(__file__).resolve().parents[1]
PACKAGE = json.loads((ROOT / "datasets/manifests/kaggle_package.json").read_text(encoding="utf-8"))
EXPECTED_SHA256 = PACKAGE["sha256"]
EXPECTED_FILES = PACKAGE["contents"]

def markdown(source):
    return {"cell_type": "markdown", "metadata": {}, "source": textwrap.dedent(source).strip().splitlines(True)}

def code(source):
    return {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [],
        "source": textwrap.dedent(source).strip().splitlines(True)}

cells = [
    markdown("""
    # KAALASTRA: Nemotron security-review QLoRA on Kaggle

    1. Attach your **private** Kaggle Dataset containing `kaalastra-kaggle-sft.zip`.
    2. In Notebook Settings, set **Accelerator: GPU** and **Internet: On**.
    3. Run cells top to bottom. The first training run is a 60-step pilot.
    4. Keep this notebook private until you have reviewed dataset rights and results.

    This notebook trains only on the local train split. Validation is used for training feedback; test is reserved for the optional final comparison. Patchwork generated analyses and SVEN fixtures are excluded.
    """),
    code("""
    import torch, shutil
    print('PyTorch:', torch.__version__, 'CUDA:', torch.version.cuda)
    assert torch.cuda.is_available(), 'Enable GPU in Notebook Settings, then restart the session.'
    for i in range(torch.cuda.device_count()):
        p = torch.cuda.get_device_properties(i)
        print(i, p.name, round(p.total_memory / 1024**3, 1), 'GiB')
    print('Free disk:', round(shutil.disk_usage('/kaggle/working').free / 1e9, 1), 'GB')
    """),
    code("""
    import subprocess, sys
    subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', '-U',
                    'transformers>=4.55,<5', 'peft>=0.17,<1',
                    'accelerate>=1,<2', 'bitsandbytes>=0.46,<1',
                    'huggingface_hub>=0.34,<1'], check=True)
    check = "import torch, transformers, peft, accelerate, bitsandbytes, huggingface_hub; print('Training imports OK:', 'torch', torch.__version__, 'transformers', transformers.__version__, 'peft', peft.__version__, 'hub', huggingface_hub.__version__)"
    subprocess.run([sys.executable, '-c', check], check=True)
    print('Training dependencies are ready. Resolver warnings about preinstalled Gradio or Diffusers can be ignored when this import check passes.')
    """),
    code("""
    import hashlib, json, pathlib, zipfile
    matches = list(pathlib.Path('/kaggle/input').rglob('kaalastra-kaggle-sft.zip'))
    expected_zip = 'EXPECTED_SHA256_VALUE'
    expected_files = EXPECTED_FILE_HASHES_VALUE
    if len(matches) == 1:
        package = matches[0]
        actual = hashlib.sha256(package.read_bytes()).hexdigest()
        assert actual == expected_zip, f'ZIP hash differs from local package manifest: {actual}'
        data_dir = pathlib.Path('/kaggle/working/kaalastra_sft')
        data_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(package) as archive:
            for member in archive.infolist():
                path = pathlib.PurePosixPath(member.filename)
                assert not path.is_absolute() and '..' not in path.parts
            archive.extractall(data_dir)
    else:
        # Kaggle can automatically unpack ZIP uploads into the attached Dataset.
        roots = [p.parent for p in pathlib.Path('/kaggle/input').rglob('train.jsonl')
                 if (p.parent / 'train_kaggle.py').exists()]
        assert len(roots) == 1, f'Attach the private KAALASTRA Dataset; found roots: {roots}'
        data_dir = roots[0]
    for name, expected in expected_files.items():
        actual = hashlib.sha256((data_dir / name).read_bytes()).hexdigest()
        assert actual == expected, f'{name} hash mismatch: {actual}'
    print('Verified data directory:', data_dir)
    print(json.dumps(json.loads((data_dir / 'manifest.json').read_text())['splits'], indent=2))
    """.replace("EXPECTED_SHA256_VALUE", EXPECTED_SHA256).replace("EXPECTED_FILE_HASHES_VALUE", repr(EXPECTED_FILES))),
    markdown("""
    ## Model access

    The default is `nvidia/Llama-3.1-Nemotron-Nano-8B-v1`, which uses a conventional Llama architecture. The 9B v2 hybrid model requires `mamba-ssm`; Kaggle's Python 3.13 environment may not have a compatible build. The training script runs a real forward/backward preflight. Report the exact model ID and revision in the run manifest.

If Hugging Face requests authentication, create a **read-only** token and store it as a Kaggle Notebook Secret named `HF_TOKEN`; do not paste it into a cell.
    """),
    code("""
    import os
    MODEL_ID = 'nvidia/Llama-3.1-Nemotron-Nano-8B-v1'
    try:
        from kaggle_secrets import UserSecretsClient
        token = UserSecretsClient().get_secret('HF_TOKEN')
        if token:
            os.environ['HF_TOKEN'] = token
            print('Hugging Face read token loaded from Kaggle Secrets.')
    except Exception:
        print('No Kaggle HF_TOKEN secret; trying public model access.')
    """),
    markdown("""
    ## Pilot: 60 optimization steps

    This downloads the base model, loads it in NF4 4-bit, adds LoRA adapters, runs one forward/backward check, then trains. Model download time is separate from training time. The script saves checkpoints and validation metrics under `/kaggle/working/kaalastra_pilot`.
    """),
    code("""
    import subprocess, sys
    pilot_dir = pathlib.Path('/kaggle/working/kaalastra_pilot')
    command = [sys.executable, str(data_dir / 'train_kaggle.py'),
        '--data-dir', str(data_dir), '--output-dir', str(pilot_dir),
        '--model', MODEL_ID, '--pilot', '--max-steps', '60', '--max-length', '1024']
    print('Running:', ' '.join(command))
    single_gpu_env = os.environ.copy()
    single_gpu_env['CUDA_VISIBLE_DEVICES'] = '0'
    subprocess.run(command, check=True, env=single_gpu_env)
    print('Pilot adapter:', pilot_dir / 'adapter')
    """),
    markdown("""
    ## Optional larger run

    Start only after the pilot completes and its validation loss is finite. Change `RUN_FULL` to `True`. This run uses the full prepared training set at 1,536 tokens and up to 600 optimizer steps. If the session stops after checkpoints were saved, set `RESUME_FULL=True` and rerun this cell in the same saved working environment.
    """),
    code("""
    RUN_FULL = False
    RESUME_FULL = False
    full_dir = pathlib.Path('/kaggle/working/kaalastra_full')
    if RUN_FULL:
        command = [sys.executable, str(data_dir / 'train_kaggle.py'),
            '--data-dir', str(data_dir), '--output-dir', str(full_dir),
            '--model', MODEL_ID, '--max-steps', '600', '--max-length', '1536']
        if RESUME_FULL:
            command.append('--resume')
        subprocess.run(command, check=True, env=single_gpu_env)
        print('Full adapter:', full_dir / 'adapter')
    else:
        print('Full run skipped. Set RUN_FULL=True after reviewing the pilot.')
    """),
    markdown("""
    ## Optional held-out comparison

    This compares the untouched base model and the trained adapter on the **same** balanced test sample. It reports precision, recall, F1, false-positive rate, CWE accuracy on true positives, and invalid JSON count. It does not report vulnerable-line or patch metrics because those labels are not independently verified. Run it once for the final adapter; repeated test-driven tuning compromises the holdout.
    """),
    code("""
    RUN_TEST = False
    final_dir = full_dir if RUN_FULL else pilot_dir
    if RUN_TEST:
        command = [sys.executable, str(data_dir / 'evaluate_kaggle.py'),
            '--data-dir', str(data_dir), '--run-dir', str(final_dir), '--limit-per-class', '30']
        subprocess.run(command, check=True, env=single_gpu_env)
        print((final_dir / 'heldout_results.json').read_text())
    else:
        print('Held-out test skipped. Set RUN_TEST=True once for the final adapter.')
    """),
    code("""
    import zipfile
    chosen = final_dir if (final_dir / 'adapter').exists() else pilot_dir
    assert (chosen / 'adapter').exists(), 'No completed adapter to export.'
    archive = pathlib.Path('/kaggle/working/kaalastra_adapter.zip')
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as out:
        for path in (chosen / 'adapter').rglob('*'):
            if path.is_file():
                out.write(path, path.relative_to(chosen))
        for name in ('run_manifest.json', 'validation_metrics.json', 'heldout_results.json', 'metrics.jsonl'):
            path = chosen / name
            if path.exists():
                out.write(path, name)
    print('Download this from the Kaggle Output pane:', archive)
    print('Includes adapter, run manifest, and available metrics. Checkpoints remain in the run directory.')
    """),
    markdown("""
    ## Optional: review your own code

    Put one source file under `/kaggle/working/`, set its path and language below, and change `RUN_REVIEW` to `True`. The script loads the **exact base revision recorded at training time** plus your adapter and prints a security-only response. Treat its findings as hypotheses until independently verified.
    """),
    code("""
    RUN_REVIEW = False
    CODE_FILE = '/kaggle/working/code_to_review.py'
    LANGUAGE = 'python'
    if RUN_REVIEW:
        assert pathlib.Path(CODE_FILE).is_file(), f'Missing code file: {CODE_FILE}'
        subprocess.run([sys.executable, str(data_dir / 'review_kaggle.py'),
            '--run-dir', str(chosen), '--code-file', CODE_FILE, '--language', LANGUAGE],
            check=True, env=single_gpu_env)
    else:
        print('Review skipped. Set CODE_FILE, LANGUAGE, and RUN_REVIEW=True to use your adapter.')
    """),
    markdown("""
    ## Preserve the result

    Download `/kaggle/working/kaalastra_adapter.zip` promptly from the working/output pane. To retain a Kaggle version, use **Save Version** and check the output-saving option. **Save & Run All** starts a fresh run from cell one; set the full-run switch first if that is the run you want to preserve. A live session can end without preserving unsaved working files. Keep the source dataset private if you do not intend to redistribute the included code.
    """),
]
notebook = {"cells": cells, "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
    "language_info": {"name": "python"}}, "nbformat": 4, "nbformat_minor": 5}
out = ROOT / "notebooks/kaalastra_nemotron_kaggle.ipynb"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(notebook, indent=1), encoding="utf-8")
print(out)
