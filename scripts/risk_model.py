"""Memory-bounded binary classification using the final-position A/B logits."""
import os
from risk_core import metrics

def gpu_check():
    import torch
    if not torch.cuda.is_available() or torch.cuda.device_count() != 1:
        raise RuntimeError("Launch a fresh subprocess with CUDA_VISIBLE_DEVICES=0 on a Kaggle GPU")
    device = torch.cuda.get_device_properties(0)
    if device.total_memory < 14 * 1024**3:
        raise RuntimeError("At least 14 GiB on one GPU is required")
    return device

def load_base(model_id, revision):
    import torch
    from transformers import AutoModelForCausalLM, BitsAndBytesConfig
    gpu_check()
    dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    quant = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=dtype)
    return AutoModelForCausalLM.from_pretrained(model_id, revision=revision,
        quantization_config=quant, device_map={"": 0}, dtype=dtype,
        attn_implementation="sdpa", token=os.environ.get("HF_TOKEN"))

class RiskCollator:
    def __init__(self, pad_id): self.pad_id = pad_id
    def __call__(self, rows):
        import torch
        length = max(len(row["input_ids"]) for row in rows)
        # Left padding ensures the final position is a real token in every row.
        return {"input_ids": torch.tensor([[self.pad_id] * (length - len(r["input_ids"])) + r["input_ids"] for r in rows]),
            "attention_mask": torch.tensor([[0] * (length - len(r["input_ids"])) + [1] * len(r["input_ids"]) for r in rows]),
            "labels": torch.tensor([r["labels"] for r in rows])}

def binary_loss(model, inputs, answer_ids):
    import torch
    labels = inputs["labels"]
    features = {key: value for key, value in inputs.items() if key != "labels"}
    output = model(**features, use_cache=False, logits_to_keep=1)
    logits = output.logits[:, -1, answer_ids].float()
    loss = torch.nn.functional.cross_entropy(logits, labels)
    return loss, {"logits": logits}

def trainer_class():
    from transformers import Trainer
    class BinaryTrainer(Trainer):
        def __init__(self, *args, answer_ids, **kwargs):
            super().__init__(*args, **kwargs)
            self.answer_ids = answer_ids
            self.model_accepts_loss_kwargs = False
        def compute_loss(self, model, inputs, return_outputs=False, num_items_in_batch=None):
            loss, outputs = binary_loss(model, inputs, self.answer_ids)
            return (loss, outputs) if return_outputs else loss
    return BinaryTrainer

def trainer_metrics(prediction):
    import numpy as np
    logits = prediction.predictions
    probabilities = np.exp(logits - logits.max(axis=1, keepdims=True))
    probabilities /= probabilities.sum(axis=1, keepdims=True)
    return metrics(prediction.label_ids.tolist(), probabilities[:, 1].tolist())

def score(model, input_ids, answer_ids):
    import torch
    inputs = torch.tensor([input_ids], device=model.device)
    with torch.inference_mode():
        output = model(input_ids=inputs, attention_mask=torch.ones_like(inputs),
            use_cache=False, logits_to_keep=1)
        return torch.softmax(output.logits[0, -1, answer_ids].float(), dim=-1)[1].item()
