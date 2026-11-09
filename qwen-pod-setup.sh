#!/bin/bash
# Qwen Image 2.1 Pod Setup - run in the Runpod pod terminal (from /workspace)
set -e

# Tolerate Windows line endings in uploaded files
sed -i 's/\r$//' qwen-pod-server.py qwen-requirements.txt 2>/dev/null || true

echo "Step 1: Installing dependencies (diffusers from git, needed for QwenImage21Pipeline)..."
pip install --upgrade pip
pip install -U -r qwen-requirements.txt

echo "Step 2: Verifying CUDA..."
python -c "import torch; print('PyTorch', torch.__version__, '| CUDA', torch.cuda.is_available(), '|', torch.cuda.get_device_name(0))"

echo "Step 3: Verifying QwenImage21Pipeline..."
python -c "from diffusers import QwenImage21Pipeline; import diffusers; print('diffusers', diffusers.__version__, 'OK')"

echo "Step 4: Pre-downloading Qwen/Qwen-Image-2.1 (~21GB, takes a while)..."
python -c "from huggingface_hub import snapshot_download; snapshot_download('Qwen/Qwen-Image-2.1')"

echo ""
echo "Setup complete. Start the server with:"
echo "  cd /workspace && python qwen-pod-server.py"
echo "Then test: curl http://localhost:5000/health"
