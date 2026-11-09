# QWEN IMAGE 2.1 - QUICK DEPLOYMENT CHECKLIST

## ✅ PROJETO WEB (Já Completo)

- [x] Frontend: QwenView.tsx com Generate + Edit tabs
- [x] Backend route: /api/generate-image-qwen
- [x] Navigation: Aba "Qwen" (✨) integrada
- [x] Env file: .env.local com QWEN_API_URL
- [x] Build: npm run build - 0 errors
- [x] TypeScript: 0 errors

## ⏳ POD RUNPOD

### Status Atual
- [ ] Pod `entire_green_crayfish` em status **RUNNING**
  - Check: https://console.runpod.io/pods
  - GPU: RTX 3090
  - ID: cmw8sogai0Q9nrfxv8x85cm1ye
  - Price: $0.51/h

### Setup Checklist (no Pod)

#### Step 1: Acesso
- [ ] SSH ou Web Terminal aberto
- [ ] Diretório: `/workspace`

#### Step 2: Copiar Server Script
```bash
# Escolha uma das opções:
# A) SCP from local:
scp qwen-pod-server.py user@<pod>-22.proxy.runpod.net:/workspace/

# B) Create via terminal (copy-paste o qwen-pod-server.py inteiro):
cat > /workspace/qwen-pod-server.py << 'EOF'
# [paste full content]
EOF

# C) Upload via Runpod console Files
```
- [ ] Arquivo copiado: `/workspace/qwen-pod-server.py`
- [ ] Verificar: `ls -lh /workspace/qwen-pod-server.py`

#### Step 3: Instalar Dependências (15-20 min)
```bash
cd /workspace

# Copie este bash block inteiro:
bash << 'SETUP_EOF'
set -e
echo "Installing dependencies..."
pip install --upgrade pip setuptools wheel
pip install --upgrade torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
pip install fastapi==0.104.1 uvicorn[standard]==0.24.0 pydantic==2.5.0 pillow==10.1.0 diffusers[torch]==0.25.1 transformers==4.36.0 safetensors==0.4.1 accelerate==0.25.0

echo "Verifying CUDA..."
python -c "import torch; print(f'✅ CUDA: {torch.cuda.is_available()}'); print(f'GPU: {torch.cuda.get_device_name(0)}')"

echo "Downloading models (10-15 min)..."
python << 'PYEOF'
import os
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
import torch
from diffusers import QwenImage21Pipeline
pipe = QwenImage21Pipeline.from_pretrained("Qwen/Qwen-Image-2.1", torch_dtype=torch.bfloat16)
pipe.load_lora_weights("abenzerps/Qwen-Image-2.1-Uncensored-GGUF", weight_name="qwen-image-2.1-uncensored-lora.safetensors")
pipe.to("cuda")
print("✅ Models ready!")
pipe.to("cpu")
torch.cuda.empty_cache()
PYEOF

echo "✅ Setup complete!"
SETUP_EOF
```
- [ ] Dependências instaladas (pip list mostra fastapi, diffusers, etc.)
- [ ] CUDA disponível (torch.cuda.is_available() = True)
- [ ] Modelos baixados (~21GB + 100MB LoRA)

#### Step 4: Inicia Servidor
```bash
cd /workspace
python qwen-pod-server.py
```
- [ ] Servidor iniciando
- [ ] Output: "Loading Qwen/Qwen-Image-2.1..."
- [ ] Output: "Loading LoRA..."
- [ ] Output: "✅ Pipeline ready"
- [ ] Output: "Uvicorn running on http://0.0.0.0:5000"

#### Step 5: Teste Rápido (outra aba/terminal)
```bash
curl http://localhost:5000/health
```
- [ ] Resposta: `{"status":"ok","model":"Qwen/Qwen-Image-2.1",...}`

#### Step 6: Teste Geração (opcional, ~2-3 min)
```bash
curl -X POST http://localhost:5000/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"A red fox","size":"512x512","steps":20}'
```
- [ ] Resposta com base64 image (muito longo, isso é normal)
- [ ] JSON tem `"success":true`

---

## 💻 APP WEB LOCAL

### Setup
- [ ] .env.local verificado:
  ```
  QWEN_API_URL=https://cmw8sogai0Q9nrfxv8x85cm1ye-5000.proxy.runpod.net
  COMFYUI_API_URL=https://pb9too1432d9ip-8188.proxy.runpod.net
  ```
- [ ] Pod status: RUNNING
- [ ] Servidor Qwen respondendo: `curl http://localhost:5000/health` ✅

### Start App
```bash
npm run start
# ou para dev mode:
npm run dev
```
- [ ] Build sucesso
- [ ] App rodando em http://localhost:3000 (ou configurado)
- [ ] Sem TypeScript errors

### Teste Generate
1. [ ] Navegue para aba "Qwen" (✨)
2. [ ] Clique em aba "Generate"
3. [ ] Prompt: "A red fox in snow"
4. [ ] Size: 1024x1024
5. [ ] Steps: 28
6. [ ] Clique "Generate"
7. [ ] Aguarde ~2-3 min (primeira vez) ou ~1 min (cached)
8. [ ] Imagem aparece
9. [ ] Download funciona (botão)

### Teste Edit
1. [ ] Clique em aba "Edit"
2. [ ] Upload uma foto (exemplo: foto de pessoa ou paisagem)
3. [ ] Instruction: "Change background to sunset"
4. [ ] Preserve identity: toggle conforme necessário
5. [ ] Clique "Edit"
6. [ ] Aguarde ~2-3 min
7. [ ] Imagem editada aparece
8. [ ] Download funciona

---

## 🔍 TROUBLESHOOTING

### Pod Issues
- [ ] Pod status não é RUNNING
  - **Fix:** https://console.runpod.io/pods → Click Pod → Start
  - Aguarde 5-10 min

- [ ] Servidor não inicia
  ```bash
  python -c "import torch; print(torch.cuda.is_available())"
  ```
  - Se `False`: GPU não está disponível
  - **Fix:** Restart pod, check CUDA drivers
  
  ```bash
  nvidia-smi
  ```
  - **Fix:** Reinstall NVIDIA drivers (avançado)

### App Web Issues
- [ ] "Connection refused" no app
  - [ ] Verificar .env.local tem QWEN_API_URL correta
  - [ ] Verificar Pod em RUNNING
  - [ ] Verificar servidor respondendo: `curl http://localhost:5000/health`
  
- [ ] Timeout 120 segundos
  - [ ] Aumentar timeout em `web/config/qwen-api-config.ts`
  - [ ] Reduzir steps ou size para testes rápidos
  
- [ ] CUDA out of memory
  - [ ] Use size 512x512 (em vez de 1024x1024)
  - [ ] Reduzir steps para 20
  - [ ] Restart servidor: Ctrl+C, depois `python qwen-pod-server.py`

### API Issues
- [ ] POST /api/generate retorna error
  - Verificar logs no Pod terminal
  - Tentar prompt diferente
  
- [ ] LoRA não carrega
  - Verificar internet no Pod (download interrompido?)
  - Reexecute setup

---

## 📊 MONITORING

### Custo
- Pod por hora: **$0.51/h**
- Setup + 5 testes: ~2h = **~$1.00 USD**
- Pause quando não usar: **$0.00/h** (disco: $0.007/h)

### Performance
| Task | Time | VRAM |
|------|------|------|
| 512x512, 20 steps | 30-45s | 8GB |
| 1024x1024, 28 steps | 1.5-2m | 16GB |
| First load | +30s | N/A |

### Logs
- **Pod server logs:** Terminal onde `python qwen-pod-server.py` está rodando
- **App logs:** `npm run start` terminal + browser console
- **Error details:** Copiar stack trace completo para debug

---

## ✨ FUNCIONALIDADES

### Generate (Text-to-Image)
- **Input:** Prompt (string)
- **Output:** PNG image (base64)
- **Sizes:** 512x512, 768x512, 512x768, 1024x1024, 1344x768, 768x1344, 1184x864, 864x1184
- **Steps:** 8-50 (default 28)
- **LoRA scale:** 0.0-1.5 (force uncensored)

### Edit (Image-to-Image)
- **Input:** Image (base64) + Instruction (string)
- **Output:** Edited PNG (base64)
- **Preserve identity:** Toggle para manter/mudar rosto/pessoa
- **Max refs:** 10 imagens de referência

---

## 🎯 PRÓXIMOS PASSOS

Depois de tudo funcionar:

- [ ] Explorar diferentes prompts/estilos
- [ ] Testar Edit com diferentes imagens
- [ ] Comparar com ComfyUI/Fooocus
- [ ] Documentar melhores parâmetros
- [ ] Pause Pod quando não usar (economizar $)
- [ ] Considerar redeployment em outra GPU se A40 ficar disponível

---

## 📞 SUPORTE RÁPIDO

| Problema | Comando de Debug |
|----------|------------------|
| Servidor não inicia | `python -c "import diffusers; print('ok')"` |
| Sem GPU | `nvidia-smi` |
| Modelo não carrega | `curl https://huggingface.co -I` |
| App web não vê Pod | `curl $QWEN_API_URL/health` |
| Imagem distorcida | Reduzir LoRA scale ou steps |
| Timeout | Aumentar `QWEN_TIMEOUT` em config |

---

## ✅ CONCLUSÃO

Quando todos os checkboxes estiverem marcados:

✨ **Qwen Image 2.1 está funcional no seu app!**

Você tem 3 backends de imagem:
- **Fooocus:** Geração rápida (CPU)
- **ComfyUI:** Edição precisa (SDXL)
- **Qwen:** Balanceado + uncensored (RTX 3090)
