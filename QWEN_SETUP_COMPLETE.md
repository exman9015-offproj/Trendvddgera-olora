# Qwen Image 2.1 Pod Setup - Complete Guide

## Overview

Este guia vai configurar o **Qwen Image 2.1** (modelo de geração + edição de imagens) no seu Pod Runpod RTX 3090.

- **Base model:** Qwen/Qwen-Image-2.1 (~21GB)
- **LoRA:** abenzerps/Qwen-Image-2.1-Uncensored-GGUF (~100MB)
- **Server:** FastAPI + Uvicorn (porta 5000)
- **Frontend:** Integrado no app web (abas Generate + Edit)

---

## Prerequisites

- Pod Runpod `entire_green_crayfish` (RTX 3090) em status **RUNNING**
- SSH access ou terminal web do Runpod console
- 2-3 horas para download + primeira inicialização

---

## Step 1: SSH into the Pod

### Via Runpod Console (Web Terminal)
1. Abra https://console.runpod.io/pods
2. Clique no Pod `entire_green_crayfish`
3. Clique em **"Connect"** → **"Web Terminal"**
4. Terminal abre em `/workspace`

### Via SSH (local terminal)
```bash
# Localizar SSH URL no Runpod console
ssh user@<pod-id>-<port>.proxy.runpod.net
cd /workspace
```

---

## Step 2: Copy Server Script to Pod

### Opção A: Via SCP (se SSH está disponível)
```bash
# Do seu computador local
scp qwen-pod-server.py user@<pod-id>-22.proxy.runpod.net:/workspace/
```

### Opção B: Via Runpod File Upload
1. Console → Pod → Files
2. Upload `qwen-pod-server.py` para `/workspace`

### Opção C: Criar diretamente no Pod (Web Terminal)
```bash
# Cole o conteúdo de qwen-pod-server.py em um arquivo
cat > /workspace/qwen-pod-server.py << 'EOF'
# [PASTE THE FULL CONTENT OF qwen-pod-server.py HERE]
EOF
```

---

## Step 3: Run Setup Script (no Pod Terminal)

```bash
cd /workspace

# Copie e execute o setup
bash << 'EOF'
set -e

echo "Updating pip..."
pip install --upgrade pip setuptools wheel

echo "Installing PyTorch..."
pip install --upgrade torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

echo "Installing dependencies..."
pip install \
    fastapi==0.104.1 \
    uvicorn[standard]==0.24.0 \
    pydantic==2.5.0 \
    pillow==10.1.0 \
    diffusers[torch]==0.25.1 \
    transformers==4.36.0 \
    safetensors==0.4.1 \
    accelerate==0.25.0

echo "Verifying CUDA..."
python -c "import torch; print(f'✅ CUDA: {torch.cuda.is_available()}'); print(f'GPU: {torch.cuda.get_device_name(0)}')"

echo "Pre-downloading models (10-15 min)..."
python << 'PYEOF'
import os
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
import torch
from diffusers import QwenImage21Pipeline

print("Downloading Qwen Image 2.1...")
pipe = QwenImage21Pipeline.from_pretrained("Qwen/Qwen-Image-2.1", torch_dtype=torch.bfloat16)
print("Loading LoRA...")
pipe.load_lora_weights("abenzerps/Qwen-Image-2.1-Uncensored-GGUF", weight_name="qwen-image-2.1-uncensored-lora.safetensors")
pipe.to("cuda")
print("✅ Models ready!")
pipe.to("cpu")
torch.cuda.empty_cache()
PYEOF

echo "✅ Setup complete!"
EOF
```

**Isto vai levar ~15-20 minutos.** Você verá:
- Downloads de modelo Hugging Face
- Compilação de kernels CUDA
- Teste de GPU

---

## Step 4: Start the Server

Ainda no Pod terminal:

```bash
cd /workspace
python qwen-pod-server.py
```

Você verá:
```
INFO:     Uvicorn running on http://0.0.0.0:5000
INFO:     Loading Qwen/Qwen-Image-2.1...
INFO:     Loading LoRA from abenzerps/Qwen-Image-2.1-Uncensored-GGUF...
INFO:     ✅ Pipeline ready
```

**NÃO feche este terminal.** O servidor está rodando. Abra outra aba/terminal para testar.

---

## Step 5: Test the API (Optional, but recommended)

### Teste 1: Health Check
```bash
curl http://localhost:5000/health
```

Resposta esperada:
```json
{
  "status": "ok",
  "model": "Qwen/Qwen-Image-2.1",
  "lora": "abenzerps/Qwen-Image-2.1-Uncensored-GGUF/qwen-image-2.1-uncensored-lora.safetensors"
}
```

### Teste 2: Simple Generation
```bash
curl -X POST http://localhost:5000/api/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "A red fox in snow",
    "size": "512x512",
    "steps": 20,
    "randomize_seed": true
  }'
```

**Primeira geração vai levar ~2-3 min.** Respostas seguintes serão mais rápidas.

---

## Step 6: Update .env.local in Your Project

No seu **computador local**, edite `.env.local`:

```bash
cd /path/to/social123-maingh24/trendnavdd

# Edite .env.local:
QWEN_API_URL=https://cmw8sogai0Q9nrfxv8x85cm1ye-5000.proxy.runpod.net
COMFYUI_API_URL=https://pb9too1432d9ip-8188.proxy.runpod.net
```

---

## Step 7: Test via Web App

Na sua máquina local:

```bash
npm run start
# ou npm run dev
```

Navegue para http://localhost:3000 (ou porta configurada) e:

1. Clique na aba **"Qwen"** (ícone ✨)
2. Na aba **"Generate":**
   - Prompt: "A red fox in snow"
   - Size: 1024x1024
   - Steps: 28
   - Clique **"Generate"**
3. Aguarde ~2-3 min (primeira vez)
4. Imagem aparece e pode fazer download

---

## Troubleshooting

### "Connection refused" / "Cannot reach Pod"
```
❌ QWEN_API_URL não está acessível
```
**Soluções:**
1. Verifique Pod status: https://console.runpod.io/pods (deve estar RUNNING)
2. Verifique servidor rodando no Pod: `curl http://localhost:5000/health`
3. Aguarde setup: Downloads podem levar 15-20 min
4. Proxy URL correta? Copie de https://console.runpod.io/pods → Connect

### "CUDA out of memory"
```
RuntimeError: CUDA out of memory. Tried to allocate 2.23 GiB
```
**Soluções:**
- Reduzir tamanho: `size: "512x512"` em vez de `1024x1024`
- Reduzir steps: `steps: 20` em vez de 28
- Reiniciar servidor: `Ctrl+C` → `python qwen-pod-server.py`

### "Model not found" / Download errors
```
FileNotFoundError: Qwen/Qwen-Image-2.1 not found
```
**Soluções:**
1. Verificar internet: `curl https://huggingface.co` no Pod
2. Se usar HF token (privado), adicione a `.env`:
   ```bash
   export HUGGINGFACE_TOKEN=hf_xxxx
   # antes de rodar setup
   ```
3. Reexecute setup: `python qwen-pod-server.py` (retry automático)

### "Timeout" no app web
```
Error: Request timeout after 120s
```
**Porque:** Primeira geração é sempre lenta (compilação GPU)
**Solução:**
- Aumentar timeout em `web/config/qwen-api-config.ts`:
  ```typescript
  export const QWEN_TIMEOUT = 180000; // 3 min
  ```

---

## Performance Tips

| Tamanho | Steps | GPU Memory | Tempo Est. |
|---------|-------|-----------|-----------|
| 512x512 | 20    | 8GB       | 30-45s    |
| 768x768 | 24    | 12GB      | 1-1.5m    |
| 1024x1024 | 28  | 16GB      | 1.5-2m    |
| 1344x768 | 28   | 18GB      | 2-2.5m    |

**Recomendado para RTX 3090:**
- Size: 768x768 ou 1024x1024
- Steps: 24-28
- LoRA scale: 1.0 (default)

---

## Stopping the Server

No Pod terminal onde o servidor está rodando:
```bash
Ctrl+C
```

Para **pausar o Pod** (economizar $):
```
https://console.runpod.io/pods → [Pod] → Pause
```

Paused = $0.00/h (disco custa $0.007/h)

---

## Next Steps

1. ✅ Setup completo → Server rodando
2. ✅ App web acessando /api/generate e /api/edit
3. ✅ Testar Generate e Edit flows
4. 📊 Monitor custo no console Runpod

---

## Links Úteis

- **Qwen GitHub:** https://github.com/QwenLM/Qwen-Vision
- **Diffusers Docs:** https://huggingface.co/docs/diffusers
- **Runpod Console:** https://console.runpod.io/pods
- **LoRA Source:** https://huggingface.co/abenzerps/Qwen-Image-2.1-Uncensored-GGUF

---

## Questões Frequentes

**P: Posso usar Qwen e ComfyUI simultaneamente?**
A: Sim. Ambos os backends estão disponíveis no app (abas separadas). Pode gerar em um e editar no outro.

**P: Quanto de espaço em disco é necessário?**
A: ~25GB (21GB modelo + 100MB LoRA + overhead). Seu Pod tem 150GB, então está ok.

**P: Posso customizar a LoRA?**
A: Sim. No `qwen-pod-server.py`, altere:
```python
LORA_WEIGHT = "seu-arquivo-lora.safetensors"
```

**P: Posso usar Qwen em uma GPU menor (RTX 3060)?**
A: Possivelmente, mas com restrições:
- Size max: 512x512
- Steps max: 20
- LoRA scale: 0.5-0.8
- Pode dar out-of-memory

**P: Qual é a qualidade vs ComfyUI/Fooocus?**
A: Depende do modelo. Qwen 2.1 é recente e promissor, mas:
- ComfyUI (SDXL): Mais modelos customizáveis
- Fooocus: Otimizado para fotos de pessoas
- Qwen 2.1: Bom balance, uncensored, rápido

---

## Suporte

Se tiver problemas:
1. Confira os logs do Pod: `pod terminal → scroll up`
2. Verifique `.env.local` no projeto local
3. Teste API diretamente: `curl http://localhost:5000/health`
4. Reinicie servidor + Pod se necessário
