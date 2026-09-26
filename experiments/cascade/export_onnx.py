import sys, os, shutil, torch, json
from transformers import AutoModelForSequenceClassification, AutoTokenizer
from onnxruntime.quantization import quantize_dynamic, QuantType
src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst + "/onnx", exist_ok=True)
model = AutoModelForSequenceClassification.from_pretrained(src).eval()
tok = AutoTokenizer.from_pretrained(src)
enc = tok(["a message"], ["Question: q Answer: a"], return_tensors="pt")
inputs = (enc["input_ids"], enc["attention_mask"])
torch.onnx.export(model, inputs, dst + "/onnx/model.onnx", input_names=["input_ids", "attention_mask"], output_names=["logits"],
                  dynamic_axes={"input_ids": {0: "b", 1: "s"}, "attention_mask": {0: "b", 1: "s"}, "logits": {0: "b"}}, opset_version=17, dynamo=False)
quantize_dynamic(dst + "/onnx/model.onnx", dst + "/onnx/model_quantized.onnx", weight_type=QuantType.QInt8)
for f in ["config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "spm.model", "added_tokens.json"]:
    if os.path.exists(os.path.join(src, f)): shutil.copy(os.path.join(src, f), dst)
# reference logits for a parity check in Node
with torch.no_grad():
    ref = model(**tok(["There's a massive pothole on Station Road."], ["Question: Which council service should handle this enquiry? Answer: Roads, potholes"], return_tensors="pt")).logits.item()
json.dump({"ref_logit": ref}, open(dst + "/parity.json", "w"))
print("ok", ref, os.path.getsize(dst + "/onnx/model_quantized.onnx") // 1_000_000, "MB int8")
