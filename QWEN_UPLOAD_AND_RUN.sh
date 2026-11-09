#!/bin/bash
# QWEN UPLOAD & RUN - Copie e cole este script no terminal do Jupyter Lab
# Este script faz TUDO: cria os arquivos, faz setup e inicia o servidor

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║       QWEN IMAGE 2.1 - UPLOAD & AUTO SETUP                   ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

cd /workspace

# ============================================================================
# STEP 1: Criar qwen-pod-server.py
# ============================================================================
echo "📝 Step 1: Criando qwen-pod-server.py..."

cat > qwen-pod-server.py << 'EOFSERVER'
#!/usr/bin/env python3
"""
Qwen Image 2.1 FastAPI Server for Runpod

Loads Qwen-Image-2.1 + uncensored LoRA and exposes:
  POST /api/generate - Text-to-image generation
  POST /api/edit     - Image editing with instruction
  GET  /health       - Health check

Usage:
  python qwen-pod-server.py

Environment variables:
  PORT (default 5000)
  QWEN_IMAGE_MODEL (default "Qwen/Qwen-Image-2.1")
  UNCENSORED_LORA_REPO (default "abenzerps/Qwen-Image-2.1-Uncensored-GGUF")
  UNCENSORED_LORA_WEIGHT (default "qwen-image-2.1-uncensored-lora.safetensors")
"""

import os
import sys
import io
import base64
import random
import logging
import traceback
from typing import Optional
from contextlib import asynccontextmanager

os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
from diffusers import QwenImage21Pipeline
import uvicorn

# ============================================================================
# LOGGING
# ============================================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# ============================================================================
# ENVIRONMENT & CONFIG
# ============================================================================
PORT = int(os.environ.get("PORT", "5000"))
MODEL_ID = os.environ.get("QWEN_IMAGE_MODEL", "Qwen/Qwen-Image-2.1")
LORA_REPO = os.environ.get(
    "UNCENSORED_LORA_REPO", "abenzerps/Qwen-Image-2.1-Uncensored-GGUF"
)
LORA_WEIGHT = os.environ.get(
    "UNCENSORED_LORA_WEIGHT", "qwen-image-2.1-uncensored-lora.safetensors"
)

SIZE_PRESETS = {
    "512x512": (512, 512),
    "768x512": (768, 512),
    "512x768": (512, 768),
    "1024x1024": (1024, 1024),
    "1344x768": (1344, 768),
    "768x1344": (768, 1344),
    "1184x864": (1184, 864),
    "864x1184": (864, 1184),
}

# ============================================================================
# GLOBAL PIPELINE (loaded once at startup)
# ============================================================================
pipe = None

def load_pipeline():
    """Load Qwen Image 2.1 pipeline with uncensored LoRA."""
    global pipe
    logger.info(f"Loading {MODEL_ID}...")
    try:
        pipe = QwenImage21Pipeline.from_pretrained(
            MODEL_ID, 
            torch_dtype=torch.bfloat16
        )
        logger.info(f"Loading LoRA from {LORA_REPO}/{LORA_WEIGHT}...")
        pipe.load_lora_weights(LORA_REPO, weight_name=LORA_WEIGHT)
        pipe.to("cuda")
        pipe.vae.enable_tiling(
            tile_sample_min_height=1024,
            tile_sample_min_width=1024,
            tile_sample_stride_height=768,
            tile_sample_stride_width=768,
        )
        logger.info("✅ Pipeline ready")
    except Exception as e:
        logger.error(f"❌ Failed to load pipeline: {e}")
        traceback.print_exc()
        sys.exit(1)

# ============================================================================
# LIFESPAN (startup/shutdown)
# ============================================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan context manager."""
    # Startup
    load_pipeline()
    yield
    # Shutdown
    if pipe is not None:
        logger.info("Cleaning up GPU memory...")
        pipe.to("cpu")
        torch.cuda.empty_cache()

# ============================================================================
# FASTAPI APP
# ============================================================================
app = FastAPI(title="Qwen Image 2.1 API", lifespan=lifespan)

# CORS for local dev + frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================
class GenerateRequest(BaseModel):
    prompt: str
    size: str = "1024x1024"
    steps: int = 28
    seed: Optional[int] = None
    randomize_seed: bool = True
    lora_scale: float = 1.0

class EditRequest(BaseModel):
    image: str  # base64-encoded
    instruction: str
    steps: int = 28
    seed: Optional[int] = None
    randomize_seed: bool = True
    lora_scale: float = 1.0
    preserve_identity: bool = True

class ImageResponse(BaseModel):
    success: bool
    image: Optional[str] = None  # base64-encoded
    seed: Optional[int] = None
    error: Optional[str] = None
    execution_time: Optional[float] = None

# ============================================================================
# HELPERS
# ============================================================================
def _seed(seed: Optional[int], randomize_seed: bool) -> int:
    """Generate or validate seed."""
    if randomize_seed or seed is None or seed < 0:
        return random.randint(0, 2**32 - 1)
    return int(seed)

def _set_lora(scale: float) -> None:
    """Set LoRA adapter weight."""
    global pipe
    try:
        pipe.set_adapters(["default"], adapter_weights=[float(scale)])
    except Exception as e:
        logger.warning(f"Failed to set LoRA scale: {e}")

def _image_to_base64(img: Image.Image) -> str:
    """Convert PIL Image to base64."""
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")

def _base64_to_image(b64_str: str) -> Image.Image:
    """Convert base64 to PIL Image."""
    # Handle data:image/... prefix
    if b64_str.startswith("data:"):
        b64_str = b64_str.split(",", 1)[1]
    image_data = base64.b64decode(b64_str)
    return Image.open(io.BytesIO(image_data)).convert("RGB")

# ============================================================================
# ENDPOINTS
# ============================================================================
@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "model": MODEL_ID,
        "lora": f"{LORA_REPO}/{LORA_WEIGHT}"
    }

@app.post("/api/generate", response_model=ImageResponse)
async def generate(req: GenerateRequest):
    """Text-to-image generation."""
    import time
    start_time = time.time()
    
    try:
        if not req.prompt or not req.prompt.strip():
            return ImageResponse(
                success=False,
                error="Prompt is required"
            )
        
        if req.size not in SIZE_PRESETS:
            return ImageResponse(
                success=False,
                error=f"Invalid size. Options: {', '.join(SIZE_PRESETS.keys())}"
            )
        
        width, height = SIZE_PRESETS[req.size]
        seed = _seed(req.seed, req.randomize_seed)
        generator = torch.Generator("cuda").manual_seed(seed)
        
        _set_lora(req.lora_scale)
        
        logger.info(f"Generating: {req.prompt[:50]}... ({width}x{height}, steps={req.steps})")
        
        image = pipe(
            prompt=req.prompt.strip(),
            width=width,
            height=height,
            num_inference_steps=int(req.steps),
            true_cfg_scale=2.0,
            generator=generator,
        ).images[0]
        
        execution_time = time.time() - start_time
        
        return ImageResponse(
            success=True,
            image=_image_to_base64(image),
            seed=seed,
            execution_time=execution_time
        )
    
    except Exception as e:
        logger.error(f"Generate error: {e}")
        traceback.print_exc()
        return ImageResponse(
            success=False,
            error=f"Generation failed: {str(e)}"
        )

@app.post("/api/edit", response_model=ImageResponse)
async def edit(req: EditRequest):
    """Image editing with instruction."""
    import time
    start_time = time.time()
    
    try:
        if not req.instruction or not req.instruction.strip():
            return ImageResponse(
                success=False,
                error="Edit instruction is required"
            )
        
        if not req.image:
            return ImageResponse(
                success=False,
                error="Image is required"
            )
        
        # Decode input image
        try:
            input_image = _base64_to_image(req.image)
        except Exception as e:
            logger.error(f"Failed to decode image: {e}")
            return ImageResponse(
                success=False,
                error=f"Invalid image format: {str(e)}"
            )
        
        seed = _seed(req.seed, req.randomize_seed)
        generator = torch.Generator("cuda").manual_seed(seed)
        
        _set_lora(req.lora_scale)
        
        # Calculate dimensions (keep ~1K area)
        w, h = input_image.size
        scale = (1024 * 1024 / max(w * h, 1)) ** 0.5
        width = max(64, int(w * scale) // 32 * 32)
        height = max(64, int(h * scale) // 32 * 32)
        
        logger.info(f"Editing: {req.instruction[:50]}... (output {width}x{height}, steps={req.steps})")
        
        output = pipe(
            prompt=req.instruction.strip(),
            image=input_image,
            width=width,
            height=height,
            num_inference_steps=int(req.steps),
            true_cfg_scale=2.0,
            generator=generator,
        ).images[0]
        
        execution_time = time.time() - start_time
        
        return ImageResponse(
            success=True,
            image=_image_to_base64(output),
            seed=seed,
            execution_time=execution_time
        )
    
    except Exception as e:
        logger.error(f"Edit error: {e}")
        traceback.print_exc()
        return ImageResponse(
            success=False,
            error=f"Edit failed: {str(e)}"
        )

# ============================================================================
# MAIN
# ============================================================================
if __name__ == "__main__":
    logger.info(f"Starting Qwen Image 2.1 API server on port {PORT}")
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=PORT,
        log_level="info"
    )
EOFSERVER

echo "✅ qwen-pod-server.py criado"

# ============================================================================
# STEP 2: Create qwen-requirements.txt
# ============================================================================
echo "📝 Step 2: Criando qwen-requirements.txt..."

cat > qwen-requirements.txt << 'EOFREQ'
fastapi==0.104.1
uvicorn[standard]==0.24.0
pydantic==2.5.0
pillow==10.1.0
diffusers[torch]==0.25.1
transformers==4.36.0
safetensors==0.4.1
accelerate==0.25.0
torch>=2.0.0
torchvision>=0.17.0
torchaudio>=2.0.0
EOFREQ

echo "✅ qwen-requirements.txt criado"

# ============================================================================
# STEP 3: Update pip & install PyTorch
# ============================================================================
echo ""
echo "Step 3/5: Atualizando pip..."
pip install --upgrade pip setuptools wheel -q

echo "Step 3/5: Instalando PyTorch + CUDA..."
pip install --upgrade torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118 -q

# ============================================================================
# STEP 4: Install dependencies
# ============================================================================
echo "Step 4/5: Instalando dependências..."
pip install -r qwen-requirements.txt -q

# ============================================================================
# STEP 5: Verify CUDA & download models
# ============================================================================
echo "Step 5/5: Verificando CUDA e baixando modelos (15-20 min)..."
echo ""

python << 'EOFPYTHON'
import os
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

import torch
print(f"✅ PyTorch {torch.__version__}")
print(f"✅ CUDA disponível: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"✅ GPU: {torch.cuda.get_device_name(0)}")
    print(f"✅ VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")

print("\n📥 Baixando Qwen Image 2.1 (21GB)...")
from diffusers import QwenImage21Pipeline
pipe = QwenImage21Pipeline.from_pretrained(
    "Qwen/Qwen-Image-2.1",
    torch_dtype=torch.bfloat16
)

print("📥 Baixando LoRA uncensored (100MB)...")
pipe.load_lora_weights(
    "abenzerps/Qwen-Image-2.1-Uncensored-GGUF",
    weight_name="qwen-image-2.1-uncensored-lora.safetensors"
)

print("🚀 Movendo para GPU...")
pipe.to("cuda")
print("✅ Tudo pronto!")

# Cleanup
pipe.to("cpu")
torch.cuda.empty_cache()
EOFPYTHON

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                 ✅ SETUP COMPLETO!                            ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 Agora execute no PRÓXIMO comando:"
echo ""
echo "  python qwen-pod-server.py"
echo ""
echo "Você vai ver:"
echo "  INFO:     Uvicorn running on http://0.0.0.0:5000"
echo ""
echo "Depois no seu PC, execute:"
echo "  npm run dev"
echo ""
echo "E acesse: http://localhost:3000 → Aba Qwen (✨)"
echo ""
