# Training audit for the Kaggle v2 package

## Decision and measurable scope

The old pilot was unsuitable for a full run: on 60 test records it produced 1 true positive, 29 false negatives and 30 true negatives. Its base output was unparseable on all 60 records, so the reported base F1 was an artifact of scoring invalid outputs as vulnerabilities. The v2 code trains a binary function-level risk score and compares base and adapter using the same two-token scoring rule. No v2 GPU result exists yet.

| Risk in the earlier pipeline | Change in v2 | Check |
| --- | --- | --- |
| Repeated JSON fields dominated loss while security labels were often cut off | Cross-entropy on the A/B next-token logits after the complete prompt | CPU gradient smoke test; tokenizer verifies both answers are one token |
| Mismatched train and inference prompts | Canonical prompt shared by preparation, evaluation and inference | Dataset audit checks each stored prompt |
| Wrong or ambiguous Nemotron thinking control | System content `detailed thinking off`; task in the user message | Checked against NVIDIA model card |
| Oversized inputs silently cropped or ran evaluation out of memory | Functions over 768 prompt tokens excluded or returned `not_assessed`; inference uses one next-token forward | Tokenization audit and no-truncation test |
| Fixed PrimeVul pairs were randomly lost among benign examples | Balance after length filtering and prioritize `PrimeVul_fixed` negatives | Selection test and source counts |
| Duplicate code could have contradictory labels | Remove all conflicting hashes; audit disjoint code hashes, projects and vulnerability IDs | Corpus audit |
| Base invalid JSON counted as vulnerable | Direct A/B logits for both modes; no JSON parser in metric path | Metric tests |
| Long run and evaluation progress lost with Kaggle reset | Two-hour training cap, checkpoint/export every 40 steps, each prediction flushed to disk, cache identity checked for resume | Cache and export tests |
| Training and evaluation could occupy two T4s inefficiently | Child processes see only GPU 0; longest eligible example checked before Trainer starts | Source and runtime preflight; GPU execution remains unverified locally |
| Old run could be mixed with new data or adapter | SHA-256 package checks and v2 schema assertion | Notebook/package consistency checks |

## Corpus audit

The generated corpus has 3,998 train, 504 validation and 971 test rows before tokenizer filtering. Train is exactly balanced. At 768 tokens with the saved Nemotron tokenizer, 2,722 training rows remain after balancing (1,361 per class), 331 validation rows (237 vulnerable, 94 benign), and 554 test rows (341 vulnerable, 213 benign). The automatic comparison samples up to 100 eligible test records per class with a fixed seed. The current [corpus audit](../datasets/manifests/training_audit.json) and [tokenization audit](../datasets/manifests/tokenization_audit.json) record counts and exclusions.

Source labels were not verified by executing code. Whitespace-normalized exact duplicates and project/ID overlaps are excluded, but semantic near-clones may remain. The corpus is dominated by C/C++; small other-language subsets do not support broad language claims. Function-level labels do not support exact locations, patches, CWEs, severity, attack paths or complete-project coverage. The test split was partly inspected during v1 debugging, so v2 test results are exploratory rather than an untouched independent benchmark.

## Evaluation gate

Thresholds are selected on validation for base and adapter independently under a 20% false-positive cap. Test outputs include confusion matrices, precision, recall, F1, balanced accuracy, MCC, false-positive rate and project-cluster bootstrap intervals. `candidate_gate_passed` requires adapter recall >= 0.60, false-positive rate <= 0.20 and point improvement in both F1 and balanced accuracy against the same base. It does not imply statistical certainty or superiority to external systems. Compare confidence intervals and inspect predictions before any extension integration.

## Runtime and verification limit

The notebook's 3h30 wall-clock budget begins before dependency installation. `run_kaggle.py` permits at most two hours in its training subprocess, including model loading and tokenization, and reserves at least one hour for evaluation. The actual optimizer steps and epoch coverage are recorded in `run_manifest.json`. Completion of every training example cannot be guaranteed on Kaggle T4 throughput, and Kaggle availability, network download or GPU quota can still fail. The longest-example preflight catches many OOM and integration errors before the timed Trainer work, but only a real Kaggle GPU run can validate CUDA kernels and achieved accuracy.

References: [NVIDIA Nemotron model card](https://huggingface.co/nvidia/Llama-3.1-Nemotron-Nano-8B-v1), [Hugging Face Trainer documentation](https://huggingface.co/docs/transformers/v4.57.1/en/main_classes/trainer), [pip interpreter management](https://pip.pypa.io/en/stable/topics/python-option/), [bitsandbytes requirements](https://pypi.org/project/bitsandbytes/0.50.2/).
