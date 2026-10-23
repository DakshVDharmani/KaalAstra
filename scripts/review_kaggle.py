"""Review one code file with a saved KAALASTRA Nemotron adapter on a GPU."""
import argparse
import json
import pathlib

SYSTEM = (
    "/no_think\nYou are KAALASTRA, a security-only code reviewer. "
    "Return one JSON object with status, findings, and uncertainty. "
    "Use only the supplied code. Do not invent a vulnerable line, exploit path, severity, or patch. "
    "For benign-labeled examples, say no confirmed finding; never claim the code is secure."
)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-dir", type=pathlib.Path, required=True)
    parser.add_argument("--code-file", type=pathlib.Path, required=True)
    parser.add_argument("--language", required=True)
    args = parser.parse_args()
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
    from peft import PeftModel
    if not torch.cuda.is_available():
        raise RuntimeError("A CUDA GPU is required for this 4-bit inference recipe")
    code = args.code_file.read_text(encoding="utf-8")
    if not code.strip() or len(code) > 50000:
        raise ValueError("Code file must contain 1 to 50,000 characters")
    manifest = json.loads((args.run_dir / "run_manifest.json").read_text(encoding="utf-8"))
    model_id, revision = manifest["model"], manifest["model_revision"]
    trust = "NVIDIA-Nemotron-Nano-9B-v2" in model_id
    dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    quant = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=dtype)
    tokenizer = AutoTokenizer.from_pretrained(args.run_dir / "adapter", trust_remote_code=trust)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    base = AutoModelForCausalLM.from_pretrained(model_id, revision=revision,
        quantization_config=quant, device_map={"": 0}, torch_dtype=dtype, trust_remote_code=trust)
    model = PeftModel.from_pretrained(base, args.run_dir / "adapter")
    model.eval()
    prompt = [{"role": "system", "content": SYSTEM},
        {"role": "user", "content": "Perform a security assessment of this " + args.language +
            " code.\n```" + args.language + "\n" + code + "\n```"}]
    inputs = tokenizer.apply_chat_template(prompt, tokenize=True,
        add_generation_prompt=True, return_tensors="pt").to("cuda:0")
    with torch.inference_mode():
        output = model.generate(input_ids=inputs, max_new_tokens=256,
            do_sample=False, pad_token_id=tokenizer.pad_token_id)
    print(tokenizer.decode(output[0][inputs.shape[-1]:], skip_special_tokens=True))

if __name__ == "__main__":
    main()
