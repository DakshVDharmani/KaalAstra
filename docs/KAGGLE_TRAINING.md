# KAALASTRA fine-tuning on Kaggle: exact first run

This guide is for the prepared 4-bit LoRA pilot, not a claim that a model has already been trained. It uses a single Kaggle GPU, PyTorch, Transformers, bitsandbytes, and PEFT. Run the 60-step pilot first. The training notebook saves an adapter, validation loss, a model revision, and an exact data hash. The optional test cell compares the base and tuned model on the same held-out rows.

## 1. Know what is in the upload

The upload is [`datasets/kaalastra-kaggle-sft.zip`](../datasets/kaalastra-kaggle-sft.zip), about 5.2 MB. The data rows contain code and source labels; raw research datasets are **not** needed on Kaggle for this run.

| File in ZIP | Purpose | Records |
| --- | --- | ---: |
| `train.jsonl` | Adapter updates only | 5,997: 1,999 vulnerable, 3,998 benign |
| `validation.jsonl` | Loss checks during training | 504: 326 vulnerable, 178 benign |
| `test.jsonl` | One final base/adapter comparison | 985: 558 vulnerable, 427 benign |
| `manifest.json` | Split counts and limitations | 1 |
| `train_kaggle.py` | QLoRA training program | 1 |
| `evaluate_kaggle.py` | Held-out comparison program | 1 |
| `review_kaggle.py` | Security-only review of one file after training | 1 |

The train, validation, and test files have **zero shared project keys, zero shared exact code hashes, and zero shared vulnerability IDs**. Training combines DeltaSecommits and PrimeVul labels. PrimeVul's full training split contributes benign examples and additional vulnerable functions. Patchwork contributes **only held-out project exclusion metadata**; its generated analyses are not training targets. SVEN remains separate evaluation data and is not in this package. These are source-labeled examples, not independently validated security explanations or exact-line labels.

The current training mix is C/C++ heavy: 5,380 of 5,997 rows have PrimeVul's `c_or_cpp` language label. JavaScript, TypeScript, PHP, and Python examples remain too few for strong language-specific claims. The full language and source counts are in `training/manifest.json` inside the ZIP. More verified web-language data and independent evaluation are needed before relying on the model for those ecosystems.

You can regenerate everything locally from the repository root with:

```powershell
python scripts/make_sft.py
python scripts/package_kaggle.py
python scripts/create_kaggle_notebook.py
```

Rebuild the notebook whenever you rebuild the ZIP: the notebook stores the package and member-file SHA-256 hashes. The package manifest is [`datasets/manifests/kaggle_package.json`](../datasets/manifests/kaggle_package.json). The dataset files and package are Git-ignored.

## 2. What you need before opening Kaggle

1. A Kaggle account with GPU notebook access. If Kaggle asks for account or phone verification, complete its prompts. GPU availability and remaining quota depend on your account and current capacity.
2. The ZIP above and [`notebooks/kaalastra_nemotron_kaggle.ipynb`](../notebooks/kaalastra_nemotron_kaggle.ipynb) downloaded from this workspace to your computer.
3. Internet enabled in the Kaggle Notebook session to install packages and download the model. Expect a much larger model download than the 5.2 MB dataset ZIP; leave enough notebook disk space.
4. Optional: a Hugging Face account and a **read-only** access token if model download asks you to authenticate. Store it as a Kaggle Notebook Secret named `HF_TOKEN`, not in a code cell.

The default model is [`nvidia/Llama-3.1-Nemotron-Nano-8B-v1`](https://huggingface.co/nvidia/Llama-3.1-Nemotron-Nano-8B-v1), a conventional Llama-architecture Nemotron model. Read its NVIDIA and Llama license terms before use. The alternative [`nvidia/NVIDIA-Nemotron-Nano-9B-v2`](https://huggingface.co/nvidia/NVIDIA-Nemotron-Nano-9B-v2) is a hybrid Mamba/attention model that requires `mamba-ssm`; the current Kaggle Python 3.13 environment did not include it. Its 4-bit training compatibility on Kaggle's T4 is unconfirmed. Report the actual model ID and revision from the run manifest.

## 3. Upload the private dataset

1. Sign in at [Kaggle](https://www.kaggle.com/).
2. Open **Datasets** and click **New Dataset**.
3. Give it a name such as `kaalastra-sft-private`.
4. Upload `kaalastra-kaggle-sft.zip` from `C:\KaalAstra\datasets\`.
5. Set **Visibility: Private**. Kaggle's dataset upload may unpack ZIP archives automatically; the notebook accepts either the ZIP or the unpacked seven files.
6. Click **Create Dataset** and wait until processing finishes.

Do not upload the raw PrimeVul, DeltaSecommits, Patchwork, or SVEN directories for this first run. The prepared ZIP is sufficient and smaller. Private visibility is important because the rows include source code from multiple upstream projects with their own licenses.

## 4. Import and configure the notebook

1. Open **Code** on Kaggle and choose **New Notebook**.
2. In the notebook menu choose **File > Import Notebook** and select `kaalastra_nemotron_kaggle.ipynb`.
3. Keep the notebook **Private** while you are testing it.
4. Open the notebook **Settings** panel. Set **Accelerator: GPU** and **Internet: On**. The session may restart when you change the accelerator.
5. In **Input** or **Add Data**, find your private `kaalastra-sft-private` Dataset and attach it.
6. If a token is required, open the notebook's **Add-ons / Secrets** control, add `HF_TOKEN` with a Hugging Face read token, and allow notebook access to that secret. Do not print the token.

The notebook prints the assigned GPU and disk space in its first cell. Kaggle can assign a P100 or T4 configuration and GPU availability can vary; this script uses **GPU 0 only**, even if two T4s are shown. It does not combine their VRAM.

## 5. Run the 8B pilot

1. Set `MODEL_ID = 'nvidia/Llama-3.1-Nemotron-Nano-8B-v1'` in the model cell.
2. Run each cell from the top through **Pilot**. Wait for the package installation and model download.
3. Confirm these messages appear before training steps: package hashes verified, GPU detected, tokenized train/validation counts, trainable LoRA parameters, and `Forward/backward preflight passed`.
4. The pilot uses 512 source examples before length filtering, 64 validation examples, a 1,024-token maximum, microbatch 1, gradient accumulation 8, NF4 4-bit weights, LoRA rank 16, and 60 optimizer steps. Some long examples are skipped if their answer would be truncated.
5. At completion, look for `Adapter saved to /kaggle/working/kaalastra_pilot/adapter` and a finite validation loss. A pilot success establishes that training executed on your GPU; it does **not** establish security accuracy.

The script records the exact model revision, PyTorch/Transformers/PEFT/bitsandbytes versions, GPU, data hashes, seed, and settings in `run_manifest.json`. Checkpoints are written every 30 steps under the run directory. Notebook sessions are temporary: save or download important output promptly.

## 6. If the pilot preflight fails

Read the first meaningful error above `Nemotron QLoRA preflight failed`.

| Symptom | Action |
| --- | --- |
| No CUDA GPU | Reopen Settings, choose GPU, and restart the session. |
| `DataParallel` appears in the traceback on a dual-T4 Kaggle session | Restart the session and launch the training subprocess with `env={**os.environ, 'CUDA_VISIBLE_DEVICES': '0'}`. The updated notebook already does this. A model loaded on GPU 0 alone does not prevent Trainer from seeing both GPUs. |
| pip warns that preinstalled Gradio or Diffusers requires Hugging Face Hub 1.x, or that Gradio requires Pillow below 13 | Continue if the install cell prints `Training imports OK`. Those packages are not used by this notebook. Keep Hub below 1.x for the selected Transformers 4.x stack. |
| Model download says 401/403 | Check model access on Hugging Face, then add a read-only `HF_TOKEN` secret. |
| Out of memory | Keep microbatch 1. Change pilot `--max-length` from `1024` to `768`, or full-run `1536` to `1024`; restart the session before retrying. |
| `mamba-ssm` is missing while loading the 9B v2 model | Change `MODEL_ID` to `nvidia/Llama-3.1-Nemotron-Nano-8B-v1` and rerun the pilot. Do not describe the result as a 9B run. |
| Package import/version conflict | Restart the Kaggle session after the install cell, then rerun top to bottom. |
| ZIP or member hash mismatch | Rebuild the package and notebook locally, reupload a new Kaggle Dataset version, and reattach that version. |

The 9B model card lists A10G, A100, H100, and Jetson AGX Thor among its recommended hardware; Kaggle's free P100/T4 availability does not imply that NVIDIA's preferred kernels will work. The 8B model has a simpler transformer architecture. Training is not confirmed until the pilot succeeds on your assigned machine.

## 7. Run longer training

After a successful pilot, change `RUN_FULL = False` to `RUN_FULL = True` in the notebook's **Optional larger run** cell. Run that cell. It starts a fresh adapter from the base model; it does not continue the pilot adapter. It trains on the 5,997-row source file before length filtering, with a 1,536-token maximum and up to 600 optimizer steps. This is a starting budget, not an optimal hyperparameter claim. Watch validation loss and GPU memory. If the session ends but the checkpoint directory is still present in your working environment, set `RESUME_FULL = True` and rerun the full cell. If the working environment was destroyed, reattach a saved checkpoint artifact first; a fresh session cannot resume from files that no longer exist.

Do not tune settings against the test file. Use validation loss for pilot/full-run decisions. The included test cell is intended for one final comparison after you choose an adapter.

## 8. Evaluate and download

1. After the final adapter is saved, set `RUN_TEST = True` in the **Optional held-out comparison** cell and run it once.
2. The script evaluates the untouched base model and the adapter on the same 30 vulnerable and 30 benign test rows by default. It records predictions and computes precision, recall, F1, false-positive rate, CWE accuracy on true positives, and malformed JSON count. A 60-row result is only a pilot estimate; increase `--limit-per-class` for a more reliable final evaluation if GPU time permits.
3. Run the export cell. It creates `/kaggle/working/kaalastra_adapter.zip` containing the adapter, run manifest, and available metrics. Download that file from Kaggle's working/output pane to your computer.
4. Use **Save Version** to retain notebook code and outputs. Check its output-saving option. **Save & Run All** starts a clean execution from the beginning, so set `RUN_FULL` and `RUN_TEST` as desired *before* choosing it. Confirm the ZIP is visible in the saved version's **Output** tab. A quick save can preserve an interactive run if output saving is enabled in your Kaggle UI; verify the actual saved artifact.

No exact-line localization or patch correctness score is produced: those labels and executable tests are not independently verified in this training package. If F1 improves, report the exact test sample size, model revision, dataset hash, and both base/adapter results. If it does not improve, keep the result and revise the dataset or training settings against validation data.

## Files generated in Kaggle

```text
/kaggle/working/kaalastra_pilot/
    adapter/                 # LoRA weights and tokenizer reference
    checkpoints/             # Trainer checkpoints for same-session resume
    metrics.jsonl            # Training/evaluation log events
    run_manifest.json        # Exact model, data, package, seed, GPU
    validation_metrics.json  # Validation loss after training

/kaggle/working/kaalastra_full/  # Same layout if RUN_FULL=True
/kaggle/working/kaalastra_adapter.zip
```

The adapter is **not** a standalone full model. Load it with the exact base model and revision in `run_manifest.json`. Keep the ZIP private until you have reviewed upstream code licenses, model license terms, and the evaluation result.

## 9. Use the adapter for a code review

In the same Kaggle notebook, place a source file at `/kaggle/working/code_to_review.py` or another path under your working directory. In the optional **review your own code** cell, set `CODE_FILE` to that path, `LANGUAGE` to the real language, and `RUN_REVIEW = True`. Run only that cell. The script loads the exact base model revision from `run_manifest.json`, attaches the saved LoRA adapter, and prints the model response. It reads the source file as text and does not execute it.

This first adapter was trained on vulnerability labels and JSON formatting. It was **not** trained on independently verified attack paths, exact vulnerable lines, severity, or minimal patches. Treat any such generated detail as an unverified hypothesis, and use the held-out comparison before trusting even the classification output.
