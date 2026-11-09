#!/usr/bin/env python3
"""
QWEN AUTO SETUP - Run this in Jupyter Lab Terminal
Este script faz TODO o setup automaticamente no Pod
"""

import os
import subprocess
import sys
import time

def run_cmd(cmd, description=""):
    """Execute command and return result."""
    if description:
        print(f"\n{'='*70}")
        print(f"📌 {description}")
        print('='*70)
    print(f"$ {cmd}\n")
    
    result = subprocess.run(cmd, shell=True, capture_output=False, text=True)
    return result.returncode == 0

def main():
    os.chdir("/workspace")
    
    print("\n" + "="*70)
    print("🚀 QWEN IMAGE 2.1 - AUTO SETUP")
    print("="*70)
    print("\nEste script vai:")
    print("  1. ✅ Atualizar pip")
    print("  2. ✅ Instalar PyTorch + CUDA")
    print("  3. ✅ Instalar dependências (FastAPI, Diffusers, etc)")
    print("  4. ✅ Verificar CUDA")
    print("  5. ✅ Baixar modelos Qwen (21GB + LoRA 100MB) - ~15-20 min")
    print("\nTempo total: ~25-30 minutos")
    print("="*70 + "\n")
    
    # STEP 1: Update pip
    if not run_cmd(
        "pip install --upgrade pip setuptools wheel",
        "Step 1: Atualizando pip..."
    ):
        print("❌ Falha ao atualizar pip")
        return False
    
    # STEP 2: Install PyTorch
    if not run_cmd(
        "pip install --upgrade torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118",
        "Step 2: Instalando PyTorch + CUDA..."
    ):
        print("❌ Falha ao instalar PyTorch")
        return False
    
    # STEP 3: Install dependencies
    deps = [
        "fastapi==0.104.1",
        "uvicorn[standard]==0.24.0",
        "pydantic==2.5.0",
        "pillow==10.1.0",
        "diffusers[torch]==0.25.1",
        "transformers==4.36.0",
        "safetensors==0.4.1",
        "accelerate==0.25.0"
    ]
    
    if not run_cmd(
        f"pip install {' '.join(deps)}",
        "Step 3: Instalando dependências..."
    ):
        print("❌ Falha ao instalar dependências")
        return False
    
    # STEP 4: Verify CUDA
    run_cmd(
        "python -c \"import torch; print(f'✅ PyTorch {torch.__version__}'); print(f'✅ CUDA disponível: {torch.cuda.is_available()}'); print(f'✅ GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \\\"N/A\\\"}')\"",
        "Step 4: Verificando CUDA..."
    )
    
    # STEP 5: Download models
    print("\n" + "="*70)
    print("Step 5: Baixando Modelos Qwen + LoRA (15-20 min)")
    print("="*70)
    print("  Modelo:  Qwen/Qwen-Image-2.1 (~21GB)")
    print("  LoRA:    abenzerps/Qwen-Image-2.1-Uncensored-GGUF (~100MB)")
    print("="*70 + "\n")
    
    download_script = """
import os
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

import torch
from diffusers import QwenImage21Pipeline

print("📥 Baixando modelo base...")
pipe = QwenImage21Pipeline.from_pretrained(
    "Qwen/Qwen-Image-2.1",
    torch_dtype=torch.bfloat16
)

print("📥 Baixando + carregando LoRA...")
pipe.load_lora_weights(
    "abenzerps/Qwen-Image-2.1-Uncensored-GGUF",
    weight_name="qwen-image-2.1-uncensored-lora.safetensors"
)

print("🚀 Movendo para GPU...")
pipe.to("cuda")
print("✅ Modelos prontos!")

# Cleanup
pipe.to("cpu")
torch.cuda.empty_cache()
"""
    
    with open("/tmp/download_models.py", "w") as f:
        f.write(download_script)
    
    if not run_cmd(
        "python /tmp/download_models.py",
        "Step 5: Baixando modelos..."
    ):
        print("❌ Falha ao baixar modelos")
        return False
    
    # SUCCESS
    print("\n" + "="*70)
    print("✅ SETUP COMPLETO!")
    print("="*70)
    print("\n📋 Próximos passos:\n")
    print("1. Copie qwen-pod-server.py para /workspace:")
    print("   (arquivo já deve estar em /workspace)")
    print("")
    print("2. Inicie o servidor:")
    print("   python qwen-pod-server.py")
    print("")
    print("3. Você verá:")
    print("   INFO:     Uvicorn running on http://0.0.0.0:5000")
    print("")
    print("4. No seu PC, rode:")
    print("   npm run dev")
    print("")
    print("5. Acesse http://localhost:3000 → Aba Qwen (✨)")
    print("")
    print("="*70 + "\n")
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
