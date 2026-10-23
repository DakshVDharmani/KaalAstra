"""Kaggle single-GPU QLoRA pilot for KAALASTRA's source-labeled SFT data.

Run only in a GPU notebook. The script fails early if the requested model or
training stack is unsupported; it never silently switches models.
"""
import argparse
import hashlib
import inspect
import json
import os
import pathlib
import random
import sys

def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=pathlib.Path, required=True)
    parser.add_argument("--output-dir", type=pathlib.Path, required=True)
    parser.add_argument("--model", default="nvidia/NVIDIA-Nemotron-Nano-9B-v2")
    parser.add_argument("--pilot", action="store_true")
    parser.add_argument("--max-steps", type=int, default=60)
    parser.add_argument("--max-length", type=int, default=1024)
    parser.add_argument("--seed", type=int, default=20261024)
    parser.add_argument("--resume", action="store_true")
    return parser.parse_args()

def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()

def load_rows(path):
    with path.open(encoding="utf-8") as stream:
        return [json.loads(line) for line in stream]

class TokenizedRows:
    def __init__(self, rows, tokenizer, max_length):
        self.data = []
        self.skipped = 0
        for row in rows:
            prompt = row["prompt"]
            completion = row["completion"]
            prefix = tokenizer.apply_chat_template(prompt, tokenize=True, add_generation_prompt=True)
            full = tokenizer.apply_chat_template(prompt + completion, tokenize=True, add_generation_prompt=False)
            common = 0
            for left, right in zip(prefix, full):
                if left != right:
                    break
                common += 1
            if common < len(prefix) - 8:
                raise ValueError("Chat template differs before the assistant response; inspect tokenizer/template.")
            if common >= max_length - 8:
                self.skipped += 1
                continue
            full = full[:max_length]
            labels = [-100] * common + full[common:]
            if all(value == -100 for value in labels):
                self.skipped += 1
                continue
            self.data.append({"input_ids": full, "labels": labels})
    def __len__(self):
        return len(self.data)
    def __getitem__(self, index):
        return self.data[index]

class CompletionCollator:
    def __init__(self, pad_id):
        self.pad_id = pad_id
    def __call__(self, examples):
        import torch
        length = max(len(x["input_ids"]) for x in examples)
        ids, masks, labels = [], [], []
        for row in examples:
            n = length - len(row["input_ids"])
            ids.append(row["input_ids"] + [self.pad_id] * n)
            masks.append([1] * len(row["input_ids"]) + [0] * n)
            labels.append(row["labels"] + [-100] * n)
        return {"input_ids": torch.tensor(ids), "attention_mask": torch.tensor(masks), "labels": torch.tensor(labels)}

def main():
    args = parse_args()
    if args.max_steps < 1 or args.max_length < 256:
        raise ValueError("max-steps must be positive and max-length at least 256")
    import torch
    import transformers
    import peft
    import bitsandbytes
    from huggingface_hub import HfApi
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, Trainer, TrainingArguments, TrainerCallback
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

    if not torch.cuda.is_available():
        raise RuntimeError("No CUDA GPU. In Kaggle Settings, set Accelerator to GPU and restart the session.")
    gpu = torch.cuda.get_device_properties(0)
    if gpu.total_memory < 14 * 1024**3:
        raise RuntimeError("This recipe expects at least 14 GiB on one GPU; current GPU has %.1f GiB" % (gpu.total_memory / 1024**3))
    print("GPU:", gpu.name, "VRAM GiB:", round(gpu.total_memory / 1024**3, 1), "CUDA:", torch.version.cuda)
    if torch.cuda.device_count() > 1:
        raise RuntimeError("Multiple GPUs are visible. Set CUDA_VISIBLE_DEVICES=0 before launching this script; Trainer would otherwise wrap the 4-bit model in DataParallel.")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    random.seed(args.seed)
    torch.manual_seed(args.seed)
    model_revision = HfApi().model_info(args.model, token=os.environ.get("HF_TOKEN")).sha
    bf16 = torch.cuda.is_bf16_supported()
    dtype = torch.bfloat16 if bf16 else torch.float16
    trust_remote_code = "NVIDIA-Nemotron-Nano-9B-v2" in args.model
    tokenizer = AutoTokenizer.from_pretrained(args.model, revision=model_revision, trust_remote_code=trust_remote_code, token=os.environ.get("HF_TOKEN"))
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    train_rows = load_rows(args.data_dir / "train.jsonl")
    validation_rows = load_rows(args.data_dir / "validation.jsonl")
    rng = random.Random(args.seed)
    rng.shuffle(train_rows)
    rng.shuffle(validation_rows)
    if args.pilot:
        train_rows = train_rows[:512]
        validation_rows = validation_rows[:64]
    else:
        validation_rows = validation_rows[:256]
    train_data = TokenizedRows(train_rows, tokenizer, args.max_length)
    eval_data = TokenizedRows(validation_rows, tokenizer, args.max_length)
    if len(train_data) < 50 or len(eval_data) < 10:
        raise RuntimeError("Too few tokenized examples; inspect max-length and source data.")
    print("Tokenized training:", len(train_data), "skipped:", train_data.skipped,
          "validation:", len(eval_data), "skipped:", eval_data.skipped)

    quant = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=dtype)
    print("Loading", args.model, "at revision", model_revision)
    model = AutoModelForCausalLM.from_pretrained(args.model, revision=model_revision,
        quantization_config=quant, device_map={"": 0}, torch_dtype=dtype,
        trust_remote_code=trust_remote_code, token=os.environ.get("HF_TOKEN"))
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
    adapter = LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05, bias="none",
        task_type="CAUSAL_LM", target_modules="all-linear")
    model = get_peft_model(model, adapter)
    model.print_trainable_parameters()

    # A single backward pass exposes unsupported Mamba/QLoRA combinations before a long run.
    collator = CompletionCollator(tokenizer.pad_token_id)
    batch = {k: v.to("cuda:0") for k, v in collator([train_data[0]]).items()}
    model.train()
    try:
        loss = model(**batch).loss
        if not torch.isfinite(loss):
            raise RuntimeError("non-finite preflight loss")
        loss.backward()
        model.zero_grad(set_to_none=True)
        torch.cuda.empty_cache()
        print("Forward/backward preflight passed; loss:", float(loss.detach().cpu()))
    except Exception as exc:
        raise RuntimeError("Nemotron QLoRA preflight failed on this Kaggle GPU/stack. See README fallback instructions.") from exc

    config = dict(output_dir=str(args.output_dir / "checkpoints"), per_device_train_batch_size=1,
        per_device_eval_batch_size=1, gradient_accumulation_steps=8, max_steps=args.max_steps,
        learning_rate=1e-4, lr_scheduler_type="cosine", warmup_ratio=0.03,
        logging_steps=10, eval_steps=30, save_steps=30, save_total_limit=2,
        bf16=bf16, fp16=not bf16, optim="adamw_torch", report_to="none",
        remove_unused_columns=False, seed=args.seed, data_seed=args.seed,
        dataloader_num_workers=0)
    strategy = "eval_strategy" if "eval_strategy" in inspect.signature(TrainingArguments).parameters else "evaluation_strategy"
    config[strategy] = "steps"
    training_args = TrainingArguments(**config)
    class MetricsCallback(TrainerCallback):
        def on_log(self, args_, state, control, logs=None, **kwargs):
            with (args.output_dir / "metrics.jsonl").open("a", encoding="utf-8") as out:
                out.write(json.dumps({"step": state.global_step, **(logs or {})}) + "\n")
    trainer = Trainer(model=model, args=training_args, train_dataset=train_data,
        eval_dataset=eval_data, data_collator=collator, callbacks=[MetricsCallback()])
    manifest = {"model": args.model, "model_revision": model_revision, "gpu": gpu.name,
        "gpu_vram_gib": round(gpu.total_memory / 1024**3, 2), "torch": torch.__version__,
        "transformers": transformers.__version__, "peft": peft.__version__,
        "bitsandbytes": bitsandbytes.__version__, "seed": args.seed,
        "max_length": args.max_length, "max_steps": args.max_steps, "pilot": args.pilot,
        "train_count": len(train_data), "validation_count": len(eval_data),
        "train_sha256": sha256(args.data_dir / "train.jsonl"),
        "validation_sha256": sha256(args.data_dir / "validation.jsonl")}
    (args.output_dir / "run_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    checkpoint = None
    if args.resume:
        from transformers.trainer_utils import get_last_checkpoint
        checkpoint = get_last_checkpoint(str(args.output_dir / "checkpoints"))
        if checkpoint is None:
            raise RuntimeError("--resume requested but no checkpoint was found")
    trainer.train(resume_from_checkpoint=checkpoint)
    metrics = trainer.evaluate()
    adapter_dir = args.output_dir / "adapter"
    adapter_dir.mkdir(exist_ok=True)
    trainer.model.save_pretrained(adapter_dir, safe_serialization=True)
    tokenizer.save_pretrained(adapter_dir)
    (args.output_dir / "validation_metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print("Adapter saved to", adapter_dir)
    print("Validation loss:", metrics.get("eval_loss"))

if __name__ == "__main__":
    main()
