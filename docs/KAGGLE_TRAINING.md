# Kaggle training: KAALASTRA v2

## What this run can do

This is a new function-level vulnerability classifier using QLoRA on `nvidia/Llama-3.1-Nemotron-Nano-8B-v1`, pinned to revision `54641c1611fcff44fa4865626462445e0a153fc7`. It learns vulnerable versus no-confirmed-finding labels. It does not learn verified patches, exact lines, CWE assignments, severity, attack paths or complete repository analysis. A negative classification is not proof that code is safe.

The previous pilot found only 1 of 30 vulnerable test functions. Its base comparison was invalid because all 60 base responses were unparseable. That result is a failed pilot, not evidence of superiority. V2 addresses the objective and evaluation defects; its accuracy remains unmeasured until this run finishes.

One run targets **3 hours 30 minutes from the first notebook cell**, including installation and downloads. Training receives up to two hours, with approximately one hour reserved for evaluation. It ends after one epoch or the time budget, whichever comes first. Slow downloads, GPU availability and throughput can prevent a complete run. The script records actual steps and epoch coverage; it does not promise that every example was trained within the deadline.

## 1. Use these two matching files

- `C:\KaalAstra\datasets\kaalastra-kaggle-sft.zip`
- `C:\KaalAstra\notebooks\kaalastra_nemotron_kaggle.ipynb`

The notebook checks every packaged file's hash. Update the ZIP and notebook together. Do not paste old `RUN_FULL`, `RUN_TEST`, `--pilot`, `--model`, `--max-input-tokens` or `evaluate_kaggle_safe.py` cells into this notebook. The new scripts have a different interface and model objective. Your old downloaded adapter remains preserved locally and is incompatible with the v2 evaluator.

## 2. Upload the data

1. Open Kaggle and sign in.
2. Open your private KAALASTRA dataset, choose **New Version**, and replace the old uploaded package with the ZIP above. Alternatively create a new private dataset containing only this ZIP.
3. Finish uploading and wait for dataset processing to complete.
4. Keep the dataset private. Downloaded source data is ignored by Git; the repository contains source provenance and audit summaries.

## 3. Import a fresh notebook

1. Create a Kaggle notebook and use **File → Import Notebook** to import the `.ipynb` above.
2. Use **Add Input** to attach your newly uploaded dataset version. Remove old versions or duplicate attachments.
3. In notebook settings, enable **GPU** and **Internet**. A T4 is the target; if Kaggle assigns two T4s, the script deliberately uses GPU 0 only.
4. If authentication is required by your Hugging Face account/model access, add a Kaggle secret named `HF_TOKEN` and enable access for this notebook. Never paste the token into a code cell.
5. Ensure your GPU quota covers the run. Avoid starting another GPU process in the notebook.
6. Select **Save Version → Save & Run All** to execute a saved notebook version. Do this once; running an interactive copy and then another saved run would duplicate training.

The notebook creates a separate training Python environment that inherits Kaggle's CUDA PyTorch and pins Transformers, PEFT, Accelerate, bitsandbytes and Hugging Face Hub. The notebook kernel does not load a second model. Unused inherited Gradio/Diffusers can still produce resolver warnings; the training subprocess import and GPU checks must pass.

## 4. What runs automatically

1. Verify ZIP and individual script/data hashes.
2. Install training dependencies and verify GPU visibility/imports.
3. Audit split isolation, code hashes, labels and prompt consistency.
4. Tokenize complete functions; exclude oversized examples without truncation and rebalance training afterward.
5. Load the pinned 4-bit model and perform a longest-example forward/backward check.
6. Train rank-8 LoRA with microbatch 1, accumulation 4, maximum prompt length 768 and non-reentrant gradient checkpointing. Save checkpoints and a portable ZIP every 40 optimizer steps.
7. Score the validation set using both base and adapter. Select each model's threshold using validation only, maximizing F1 subject to a validation false-positive-rate cap of 20%.
8. Score up to 100 eligible test functions per class with both models. Persist each prediction immediately. There is no autoregressive generation or JSON-output parsing.
9. Report F1, recall, false-positive rate, balanced accuracy, class counts, language breakdown and paired project-bootstrap intervals.
10. Export the adapter, tokenizer, manifests, thresholds, prediction logs, metrics, status and logs to `/kaggle/working/kaalastra_adapter.zip`.

The data package contains **3,998 train**, **504 validation**, and **971 test** rows before token filtering. Train is evenly balanced. PrimeVul/PrimeVul fixed pairs and DeltaSecommits supply training examples. Patchwork is metadata for project exclusion only; SVEN is outside this training corpus. Most examples are C/C++; small counts in other languages cannot establish broad-language performance. See `datasets/manifests/tokenization_audit.json` for eligible counts with the saved tokenizer.

## 5. Check completion and results

Open the saved notebook version and its **Output** tab. Download **`kaalastra_adapter.zip`**. Also retain the output directory `kaalastra_run_v2` if you need Trainer checkpoints for interrupted-training recovery; checkpoints are deliberately excluded from the portable ZIP.

- `pipeline_status.json`: `complete` means training and comparison finished; `incomplete` includes the error. An incomplete ZIP can contain useful saved work but is not a successful model.
- `run_manifest.json`: actual optimizer steps, epoch coverage, selected checkpoint, hashes, version information and stop reason.
- `heldout_results.json`: measured base-versus-adapter results.
- `thresholds.json`: thresholds selected on validation.
- `predictions_validation_base.jsonl`, `predictions_validation_adapter.jsonl`, `predictions_test_base.jsonl`, `predictions_test_adapter.jsonl`: individual persisted scores.
- `training.log`, `evaluation.log`, `metrics.jsonl`: diagnostics.

`candidate_gate_passed` requires test recall >= 0.60, FPR <= 0.20 and higher F1 **and** balanced accuracy than the same quantized base. It is a local candidate gate, not production approval. Inspect bootstrap intervals: point improvements with intervals crossing zero are uncertain. Single-class language slices are flagged and their zero-division metrics should not be compared as a broad benchmark.

Part of this test corpus was inspected during v1 development. Treat this as an exploratory comparison. No commercial scanner comparison or independent SOTA evaluation has been run. The model must earn stronger claims on new, independent labeled projects.

## 6. If evaluation stops: resume evaluation only

Do not retrain if the adapter exists. In the same session, after the setup cells define `python`, `data_dir` and `single_gpu_env`, run:

```python
command = [python, '-u', str(data_dir / 'evaluate_kaggle.py'),
    '--data-dir', str(data_dir), '--run-dir', '/kaggle/working/kaalastra_run_v2',
    '--limit-per-class', '100']
subprocess.run(command, check=True, env=single_gpu_env)
subprocess.run([python, str(data_dir / 'export_run.py'),
    '--run-dir', '/kaggle/working/kaalastra_run_v2'], check=True)
```

This separate recovery run has no original run deadline unless you pass `--deadline-unix`. It reuses complete prediction records whose model/data identity matches. Do not change data, adapter or manifest to force reuse of a mismatched cache.

If the session was reset, first attach your **saved run outputs** as a private Kaggle input and copy/extract them to `/kaggle/working/kaalastra_run_v2`. The ZIP's `adapter/` must end up directly inside that run directory, alongside `run_manifest.json`. Attach the matching training dataset and run the setup cells before the evaluation command above. If neither saved outputs nor a download exists, erased session files cannot be recovered.

Interrupted training can resume through `run_kaggle.py` only if its run directory includes a complete `checkpoints/checkpoint-*` directory. A portable adapter ZIP alone does not contain optimizer state and cannot resume the exact training step. Never delete a saved run to get past an error.

## 7. Try a complete function after successful evaluation

Write one complete function to `/kaggle/working/example.c`, then run:

```python
subprocess.run([python, str(data_dir / 'review_kaggle.py'),
    '--run-dir', '/kaggle/working/kaalastra_run_v2',
    '--code-file', '/kaggle/working/example.c', '--language', 'c'],
    check=True, env=single_gpu_env)
```

The result reports a risk score and validation-selected threshold. Oversized functions return `not_assessed`; they are not silently marked safe. CWE, location and patch fields remain null because reliable targets are absent. Extension integration needs a separate function extractor, coverage reporting, static-analysis checks and a serving process; this notebook does not deploy a service.

## Rebuild locally after editing scripts

```powershell
python scripts/make_sft.py
python scripts/audit_training_data.py --data-dir datasets/training --output datasets/manifests/training_audit.json
python -m unittest discover -s tests -v
python scripts/package_kaggle.py
python scripts/create_kaggle_notebook.py
```

Re-upload both outputs after any change. A hash mismatch should be fixed by using matching versions, never by deleting assertions.
