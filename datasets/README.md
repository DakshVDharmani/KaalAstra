# Dataset preparation status

Downloaded artifacts and SHA-256 hashes are in `manifests/downloads.json`. Run `python scripts/preprocess.py` and `python scripts/index_patchwork.py` from the repository root to regenerate processed files. Dataset files are treated as data and are never executed.

`processed/candidates.jsonl` contains source-backed DeltaSecommits vulnerable/fixed code pairs. It has 2,290 records after language, CWE, provenance, pair-quality, size, and exact-pair deduplication filters. Project-hash splits are 1,932 train, 229 validation, and 129 test. The record keeps the full supplied before/after code and commit URL. Root cause, attack path, and exact vulnerable line remain null because the source does not verify them. These are candidates for further review, not a finished instruction-tuning dataset.

`processed/patchwork_metadata.jsonl` contains 15,904 non-refused records. The publisher's train/eval split is preserved, with zero patch-hash cross-split collisions. Patchwork v1.0 does not bundle full source code. Its analysis is model-generated and the publisher notes additional downstream restrictions for using that model output to train similar models. The index therefore contains metadata only; it is not merged into training examples. See the [source documentation](https://github.com/TayR-D/patchwork-cve#licensing-and-code).

PrimeVul's published paired train, validation, and test files are downloaded from a [public mirror](https://huggingface.co/datasets/colin/PrimeVul) of the [authors' dataset](https://github.com/DLVulDet/PrimeVul). `python scripts/preprocess_primevul.py` produces 3,737 train, 478 validation, and 429 test pairs. The files retain the authors' splits. There are 92 projects shared between the authors' paired train and test files, so those split results alone should not support independent cross-project claims.

PrimeVul's full train file adds benign examples for false-positive reduction. `python scripts/build_strict_pool.py` removes projects represented in DeltaSecommits, PrimeVul, or Patchwork held-out data. It produces 53,035 benign and 1,395 vulnerable C/C++ candidates from the full train split. This strict pool is separate from the paired train file and may contain some of its code; deduplicate across both before model training. It has no validated vulnerable-line labels or verified patch tests.

[SVEN](https://github.com/eth-sri/sven) is downloaded into `evaluation/` and its `data_eval` fixtures are extracted with `python scripts/prepare_sven.py`. It is reserved for evaluation only.

The remaining named sources have not yet been downloaded. [CVEfixes](https://github.com/secureIT-project/CVEfixes) publishes its data separately on Zenodo as a relational database; [MoreFixes](https://zenodo.org/records/20776007) offers a 16 GB PostgreSQL database plus patches. Those larger archives were deferred to keep acquisition bounded.
