#!/bin/bash
# ============================================================================
# QWEN AUTO-SETUP v1 - COPIE E COLE NO JUPYTER LAB TERMINAL
# ============================================================================
# Este script cria TODOS os arquivos e faz setup automaticamente
# Tempo estimado: 25-30 minutos
# ============================================================================

set -e
cd /workspace

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║       QWEN IMAGE 2.1 - AUTO SETUP & DEPLOY                   ║"
echo "║  Rodando setup... (25-30 min)                                 ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# STEP 1: Atualizar pip
echo "📦 Step 1/5: Atualizando pip..."
pip install --upgrade pip setuptools wheel -q

# STEP 2: Instalar PyTorch
echo "🔥 Step 2/5: Instalando PyTorch + CUDA..."
pip install --upgrade torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118 -q

# STEP 3: Instalar dependências
echo "📚 Step 3/5: Instalando dependências..."
pip install -q fastapi==0.104.1 uvicorn[standard]==0.24.0 pydantic==2.5.0 pillow==10.1.0 diffusers[torch]==0.25.1 transformers==4.36.0 safetensors==0.4.1 accelerate==0.25.0

# STEP 4: Verificar CUDA
echo ""
echo "🔍 Step 4/5: Verificando CUDA..."
python << 'CHECKPYTHON'
import torch
print(f"✅ PyTorch: {torch.__version__}")
print(f"✅ CUDA available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"✅ GPU: {torch.cuda.get_device_name(0)}")
    vram = torch.cuda.get_device_properties(0).total_memory / 1e9
    print(f"✅ VRAM: {vram:.1f} GB")
CHECKPYTHON

# STEP 5: Baixar modelos
echo ""
echo "📥 Step 5/5: Baixando Qwen + LoRA (15-20 min)..."
echo "   - Modelo: Qwen/Qwen-Image-2.1 (~21GB)"
echo "   - LoRA: abenzerps/Qwen-Image-2.1-Uncensored-GGUF (~100MB)"
echo ""

python << 'MODELPYTHON'
import os
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

import torch
from diffusers import QwenImage21Pipeline

print("📥 Baixando modelo base (21GB)...")
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
print("✅ Modelos prontos!")

pipe.to("cpu")
torch.cuda.empty_cache()
MODELPYTHON

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                   ✅ SETUP COMPLETO!                          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 PRÓXIMOS PASSOS:"
echo ""
echo "1️⃣  Execute o servidor Qwen:"
echo "    python qwen-pod-server.py"
echo ""
echo "2️⃣  Você verá:"
echo "    INFO:     Uvicorn running on http://0.0.0.0:5000"
echo ""
echo "3️⃣  No seu PC, execute:"
echo "    cd c:\\Users\\Millerium\\Videos\\social123-maingh24\\trendnavdd"
echo "    npm run dev"
echo ""
echo "4️⃣  Abra o browser:"
echo "    http://localhost:3000 → Aba Qwen (✨)"
echo ""
echo "5️⃣  Teste Generate ou Edit!"
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  Pronto! Primeira geração leva ~2-3 min (CUDA compile)       ║"
echo "║  Próximas levam ~1-1.5 min                                    ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
