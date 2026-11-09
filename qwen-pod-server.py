#!/usr/bin/env python3
"""
Qwen Image 2.1 FastAPI Server for Runpod

Loads Qwen-Image-2.1 (optional LoRA) and exposes:
  POST /api/generate - Text-to-image generation
  POST /api/edit     - Image editing with instruction
  GET  /health       - Health check

Usage:
  python qwen-pod-server.py

Environment variables:
  PORT (default 5000)
  QWEN_IMAGE_MODEL (default "Qwen/Qwen-Image-2.1")
  QWEN_LORA_REPO / QWEN_LORA_WEIGHT (optional, no LoRA loaded when empty)
  QWEN_CPU_OFFLOAD (default "1", set "0" to keep the whole pipeline on GPU)
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
LORA_REPO = os.environ.get("QWEN_LORA_REPO", "")
LORA_WEIGHT = os.environ.get("QWEN_LORA_WEIGHT", "")
CPU_OFFLOAD = os.environ.get("QWEN_CPU_OFFLOAD", "1") == "1"
lora_loaded = False

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
    global pipe, lora_loaded
    logger.info(f"Loading {MODEL_ID}...")
    try:
        pipe = QwenImage21Pipeline.from_pretrained(
            MODEL_ID, 
            torch_dtype=torch.bfloat16
        )
        if LORA_REPO and LORA_WEIGHT:
            logger.info(f"Loading LoRA from {LORA_REPO}/{LORA_WEIGHT}...")
            pipe.load_lora_weights(LORA_REPO, weight_name=LORA_WEIGHT, adapter_name="default")
            lora_loaded = True
        if CPU_OFFLOAD:
            pipe.enable_model_cpu_offload()
        else:
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
        if not CPU_OFFLOAD:
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
    if not lora_loaded:
        return
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
        "lora": f"{LORA_REPO}/{LORA_WEIGHT}" if lora_loaded else None,
        "cpu_offload": CPU_OFFLOAD
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
