"""One bounded QLoRA classification run. No generated explanations are training labels."""
import argparse
import collections
import json
import os
import pathlib
import random
import time
from risk_core import (MODEL, REVISION, SCHEMA, atomic_json, balance, digest,
    encode_rows, read_rows, token_ids)
from risk_model import RiskCollator, binary_loss, gpu_check, load_base, trainer_class, trainer_metrics
from export_run import export_run
from audit_training_data import audit

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=pathlib.Path, required=True)
    parser.add_argument("--output-dir", type=pathlib.Path, required=True)
    parser.add_argument("--max-length", type=int, default=768)
    parser.add_argument("--max-steps", type=int, default=-1)
    parser.add_argument("--train-seconds", type=float, default=7200)
    parser.add_argument("--seed", type=int, default=20261024)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    if not 256 <= args.max_length <= 768 or args.train_seconds < 300 or args.max_steps == 0 or args.max_steps < -1:
        raise ValueError("Use 256..768 tokens, at least 300 seconds, and positive steps or -1 for one epoch")
    began = time.monotonic()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    previous = args.output_dir / "run_manifest.json"
    if previous.exists() and not args.resume:
        raise RuntimeError("Output already contains a run. Use a new directory or --resume with saved checkpoints.")
    audit_report = audit(args.data_dir)
    atomic_json(args.output_dir / "data_audit.json", audit_report)
    import torch
    import transformers
    import peft
    import bitsandbytes
    from transformers import AutoTokenizer, TrainingArguments, TrainerCallback, set_seed
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    gpu = gpu_check()
    set_seed(args.seed)
    tokenizer = AutoTokenizer.from_pretrained(MODEL, revision=REVISION, token=os.environ.get("HF_TOKEN"))
    tokenizer.pad_token = tokenizer.eos_token
    answer_ids = token_ids(tokenizer)
    train, train_excluded = encode_rows(read_rows(args.data_dir / "train.jsonl"), tokenizer, args.max_length)
    validation, val_excluded = encode_rows(read_rows(args.data_dir / "validation.jsonl"), tokenizer, args.max_length)
    train = balance(train, args.seed)
    if len(train) < 100 or min(collections.Counter(r["labels"] for r in validation).values(), default=0) < 10 or len({r["labels"] for r in validation}) != 2:
        raise RuntimeError("Too few eligible examples in either class after length filtering")
    manifest = {"schema": SCHEMA, "model": MODEL, "model_revision": REVISION,
        "objective": "cross entropy on two next-token logits, B=0 and A=1",
        "seed": args.seed, "max_length": args.max_length, "train_seconds": args.train_seconds,
        "gpu": gpu.name, "gpu_vram_gib": gpu.total_memory / 1024**3,
        "torch": torch.__version__, "transformers": transformers.__version__,
        "peft": peft.__version__, "bitsandbytes": bitsandbytes.__version__,
        "answer_token_ids": answer_ids, "train_count": len(train), "validation_count": len(validation),
        "train_classes": dict(collections.Counter(r["labels"] for r in train)),
        "validation_classes": dict(collections.Counter(r["labels"] for r in validation)),
        "train_sources": dict(collections.Counter(r["metadata"]["source"] for r in train)),
        "excluded_for_length": {"train": train_excluded, "validation": val_excluded},
        "data_hashes": {name: digest(args.data_dir / (name + ".jsonl")) for name in ("train", "validation", "test")},
        "training_complete": False, "gradient_accumulation_steps": 4}
    checkpoint = None
    if args.resume:
        from transformers.trainer_utils import get_last_checkpoint
        old = json.loads(previous.read_text())
        for key in ("schema", "model_revision", "max_length", "seed", "data_hashes"):
            if old[key] != manifest[key]: raise RuntimeError(f"Resume mismatch: {key}")
        checkpoint = get_last_checkpoint(str(args.output_dir / "checkpoints"))
        if not checkpoint: raise RuntimeError("No complete checkpoint available for resume")
    atomic_json(previous, manifest)
    print(json.dumps(manifest, indent=2), flush=True)
    model = load_base(MODEL, REVISION)
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False})
    model = get_peft_model(model, LoraConfig(r=8, lora_alpha=16, lora_dropout=0.05,
        bias="none", task_type="CAUSAL_LM", target_modules="all-linear"))
    model.print_trainable_parameters()
    collator = RiskCollator(tokenizer.pad_token_id)
    batch = {key: value.to("cuda:0") for key, value in collator([max(train, key=lambda row: len(row["input_ids"]))]).items()}
    model.train()
    loss, output = binary_loss(model, batch, answer_ids)
    if not torch.isfinite(loss): raise RuntimeError("Nonfinite preflight loss")
    loss.backward()
    if not any(p.grad is not None and torch.isfinite(p.grad).all() and p.grad.abs().sum() > 0 for p in model.parameters() if p.requires_grad):
        raise RuntimeError("No finite nonzero adapter gradients")
    model.zero_grad(set_to_none=True)
    del batch, loss, output
    torch.cuda.empty_cache()
    print("Longest-example forward/backward preflight passed", flush=True)

    class PersistAndBudget(TrainerCallback):
        def on_step_end(self, args_, state, control, **kwargs):
            if time.monotonic() - began >= args.train_seconds - 120:
                control.should_training_stop = True
                control.should_save = True
                control.should_evaluate = False
        def on_log(self, args_, state, control, logs=None, **kwargs):
            with (args.output_dir / "metrics.jsonl").open("a", encoding="utf-8") as stream:
                stream.write(json.dumps({"step": state.global_step, **(logs or {})}) + "\n")
        def on_save(self, args_, state, control, model=None, **kwargs):
            model.save_pretrained(args.output_dir / "adapter", safe_serialization=True)
            tokenizer.save_pretrained(args.output_dir / "adapter")
            manifest.update(saved_step=state.global_step, training_complete=False)
            atomic_json(previous, manifest)
            export_run(args.output_dir)
            print("Checkpoint and portable adapter ZIP saved at step", state.global_step, flush=True)

    config = TrainingArguments(output_dir=str(args.output_dir / "checkpoints"),
        per_device_train_batch_size=1, per_device_eval_batch_size=1,
        gradient_accumulation_steps=4, num_train_epochs=1, max_steps=args.max_steps,
        learning_rate=5e-5, lr_scheduler_type="linear", warmup_ratio=.05,
        logging_steps=10, eval_strategy="steps", eval_steps=40, save_steps=40,
        save_total_limit=2, load_best_model_at_end=True,
        metric_for_best_model="balanced_accuracy", greater_is_better=True,
        fp16=not torch.cuda.is_bf16_supported(), bf16=torch.cuda.is_bf16_supported(),
        optim="adamw_torch", report_to="none", remove_unused_columns=False,
        label_names=["labels"], dataloader_num_workers=0, seed=args.seed, data_seed=args.seed)
    trainer = trainer_class()(model=model, args=config, train_dataset=train, eval_dataset=validation,
        data_collator=collator, compute_metrics=trainer_metrics, processing_class=tokenizer,
        callbacks=[PersistAndBudget()], answer_ids=answer_ids)
    trainer.train(resume_from_checkpoint=checkpoint)
    trainer.model.save_pretrained(args.output_dir / "adapter", safe_serialization=True)
    tokenizer.save_pretrained(args.output_dir / "adapter")
    manifest.update(training_complete=True, stop_reason="budget" if time.monotonic() - began >= args.train_seconds - 120 else "epoch_or_step_limit",
        optimizer_steps=trainer.state.global_step, epoch=trainer.state.epoch,
        best_checkpoint=trainer.state.best_model_checkpoint, best_validation_balanced_accuracy=trainer.state.best_metric,
        elapsed_seconds=time.monotonic() - began)
    atomic_json(previous, manifest)
    print("Saved", export_run(args.output_dir), flush=True)

if __name__ == "__main__": main()
