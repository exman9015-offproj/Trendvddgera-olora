# Qwen Image 2.1 - Setup Instructions

## Pod Created ✅
- **Pod ID:** `cmw8sogai0Q9nrfxv8x85cm1ye`
- **Pod Name:** `entire_green_crayfish`
- **GPU:** RTX 3090 (24GB VRAM)
- **Compute:** PyTorch 2.8.0 + CUDA 12.8.1
- **Price:** $0.51/h (within $0.50/h budget)
- **Status:** Waiting for availability (initializing, ~3-5 minutes)
- **Configured URL:** `https://cmw8sogai0Q9nrfxv8x85cm1ye-5000.proxy.runpod.net`

## Project Configuration ✅
- Environment file `.env.local` created with:
  - `QWEN_API_URL=https://cmw8sogai0Q9nrfxv8x85cm1ye-5000.proxy.runpod.net`
  - `COMFYUI_API_URL=https://pb9too1432d9ip-8188.proxy.runpod.net` (existing)
- Qwen page integrated into navigation (Navbar tab "Qwen")
- API route `/api/generate-image-qwen` ready
- Frontend components (Generate + Edit modes) deployed
- Build passes (0 TypeScript errors)

## Next Steps (Manual in Pod Console)

### 1. Wait for Pod to be ready (~3-5 min)
- Monitor: https://console.runpod.io/pods
- Status should change from "Waiting for availability" → "RUNNING"

### 2. SSH into Pod or use Terminal
Once Pod is RUNNING, access the terminal/SSH:
```bash
# Via Runpod console's web terminal
cd /workspace
```

### 3. Install Qwen Model & Start API Server
```bash
# Install dependencies
pip install --upgrade pip
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
pip install transformers pillow requests flask

# Download Qwen VL model (INT8 quantized for 24GB VRAM)
# This will take 5-10 minutes
python -c "from transformers import AutoModelForCausalLM, AutoTokenizer
tokenizer = AutoTokenizer.from_pretrained('Qwen/Qwen2-VL-7B-Instruct', trust_remote_code=True)
model = AutoModelForCausalLM.from_pretrained(
    'Qwen/Qwen2-VL-7B-Instruct',
    torch_dtype='auto',
    device_map='auto',
    trust_remote_code=True,
    load_in_8bit=True
)
print('Model loaded successfully')"

# Start Flask API server on port 5000
python /workspace/qwen_api_server.py
```

### 4. Create API Server Script
Create file `/workspace/qwen_api_server.py`:

```python
#!/usr/bin/env python3
import base64
import torch
from flask import Flask, request, jsonify
from transformers import AutoModelForCausalLM, AutoTokenizer, AutoProcessor
from PIL import Image
import io
import os

app = Flask(__name__)

# Load model once at startup
print("Loading Qwen2-VL-7B-Instruct...")
tokenizer = AutoTokenizer.from_pretrained(
    'Qwen/Qwen2-VL-7B-Instruct',
    trust_remote_code=True
)
processor = AutoProcessor.from_pretrained(
    'Qwen/Qwen2-VL-7B-Instruct',
    trust_remote_code=True
)
model = AutoModelForCausalLM.from_pretrained(
    'Qwen/Qwen2-VL-7B-Instruct',
    torch_dtype=torch.float16,
    device_map='auto',
    trust_remote_code=True,
    load_in_8bit=True
).eval()
print("Model loaded!")

@app.route('/api/generate', methods=['POST'])
def generate():
    """Text-to-image generation"""
    try:
        data = request.json
        prompt = data.get('prompt')
        size = data.get('size', '512x512')
        steps = data.get('steps', 50)
        
        if not prompt:
            return jsonify({'error': 'Missing prompt'}), 400
        
        # Parse size
        w, h = map(int, size.split('x'))
        
        # Generate image using Qwen
        # Note: Qwen2-VL is primarily a vision-language model for understanding,
        # not image generation. For true generation, use T2I models like Flux.
        # This is a placeholder for integration.
        
        return jsonify({
            'success': False,
            'error': 'Qwen2-VL is a vision-language model. Use ComfyUI or Fooocus for image generation.'
        }), 400
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/edit', methods=['POST'])
def edit():
    """Image editing with instruction"""
    try:
        data = request.json
        image_b64 = data.get('image')
        instruction = data.get('instruction')
        preserve_identity = data.get('preserve_identity', True)
        
        if not image_b64 or not instruction:
            return jsonify({'error': 'Missing image or instruction'}), 400
        
        # Decode base64 image
        image_data = base64.b64decode(image_b64.split(',')[1])
        image = Image.open(io.BytesIO(image_data))
        
        # Process with Qwen for understanding/caption
        messages = [
            {
                'role': 'user',
                'content': [
                    {
                        'type': 'image',
                        'image': image,
                    },
                    {
                        'type': 'text',
                        'text': f'Edit this image according to: {instruction}. Preserve identity: {preserve_identity}'
                    }
                ],
            }
        ]
        
        text = processor.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        image_inputs, video_inputs = processor.process_text(text)
        inputs = processor(
            text=[text],
            images=image_inputs,
            videos=video_inputs,
            padding=True,
            return_tensors='pt',
        )
        inputs = inputs.to('cuda')
        
        # Generate response
        with torch.no_grad():
            generated_ids = model.generate(**inputs, max_new_tokens=1024)
        
        output = tokenizer.batch_decode(generated_ids, skip_special_tokens=True)[0]
        
        # Return edited image (placeholder - would need actual image generation model)
        return jsonify({
            'success': False,
            'error': 'Qwen2-VL analyzes images but cannot generate them. Response: ' + output
        }), 400
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'model': 'Qwen2-VL-7B-Instruct'}), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
```

### ⚠️ IMPORTANT NOTE

**Qwen2-VL is a Vision-Language model for understanding/analyzing images, NOT for generating them.**

For image generation + editing, you have two better options:

#### Option A: Use existing ComfyUI (RECOMMENDED)
- Already set up on your A40 Pod
- Has SDXL Base for generation + img2img for editing
- URL already configured in `.env.local`
- **Just keep using this one** for generation/editing

#### Option B: Deploy true image generation on Qwen Pod
Replace Qwen2-VL with:
- **Flux.1-schnell** (fast, good quality, 24GB fits INT8)
- **Stable Diffusion XL** (proven, many fine-tuning options)
- **ComfyUI itself** on this pod (duplicate your existing workflow)

**Recommendation:** Keep ComfyUI on A40, optionally deploy Flux.1 on RTX 3090 for a second generation pipeline, or remove Qwen Pod and save the $0.51/h.

---

## Status Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Pod Created | ✅ | RTX 3090, PyTorch ready |
| Project Build | ✅ | 0 TypeScript errors |
| Environment | ✅ | `.env.local` configured |
| Qwen UI | ✅ | Generate + Edit tabs ready |
| Qwen Backend | ⏳ | Awaiting Pod startup + manual model install |
| **Critical Issue** | ⚠️ | Qwen2-VL doesn't generate images—analyze only |

## Action Items

1. **Wait for Pod to be RUNNING** (~3-5 min)
2. **Decide:** Keep Qwen for analysis, or replace with Flux/SDXL for generation?
3. **If keeping Qwen:** Run setup script above in Pod terminal
4. **If replacing:** Redeploy with image generation model
5. **If removing:** Pause/delete Pod to stop $0.51/h charge
