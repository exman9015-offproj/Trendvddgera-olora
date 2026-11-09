# Qwen no Runpod: notas operacionais

Pod: `msgmjaixfmbwlm` (RTX 3090, imagem `runpod/pytorch:1.5.0-cu1281-torch280-ubuntu2404`).
Proxy HTTP (estável): `https://msgmjaixfmbwlm-5000.proxy.runpod.net` (configurado em `.env.local` como `QWEN_API_URL`).

## Acesso SSH
- Chave local: `~/.ssh/runpod_ed25519`, registrada na conta Runpod; `PUBLIC_KEY` definida no pod.
- **A porta SSH muda a cada reinício do pod.** Consulte a atual com `get-pod` (campo `ssh.direct`) e conecte com:
  `ssh -i ~/.ssh/runpod_ed25519 -p <PORTA> root@213.192.2.115`
- Última porta conhecida: 40029.

## Pip
O pip do pod bloqueia instalação global (PEP 668) em sessões SSH. Rode o setup com:
```bash
export PIP_BREAK_SYSTEM_PACKAGES=1
```
O script `qwen-pod-setup.sh` não define isso.

## Persistência
O disco do pod é temporário (sem volume). Após qualquer reinício, `/workspace` e os pacotes instalados somem. Refaça:
```bash
# do PC, trocando <PORTA>
scp -i ~/.ssh/runpod_ed25519 -P <PORTA> qwen-pod-setup.sh qwen-pod-server.py qwen-requirements.txt root@213.192.2.115:/workspace/
ssh -i ~/.ssh/runpod_ed25519 -p <PORTA> root@213.192.2.115
# no pod
cd /workspace
export PIP_BREAK_SYSTEM_PACKAGES=1
bash qwen-pod-setup.sh                      # ~2 min; instala diffusers (git) e baixa o modelo (~21GB)
nohup python qwen-pod-server.py > server.log 2>&1 &
curl localhost:5000/health
```
Para não perder o modelo a cada reinício, use um network volume montado em `/workspace`.

## Servidor
- `QWEN_CPU_OFFLOAD` (padrão `1`): offload de CPU para caber na GPU de 24GB. Use `0` para manter tudo na GPU.
- LoRA: escolhida por requisição (`lora`: `none`, `chatrlabs` ou `f23gg`) na página Qwen, em Gerar e Editar. O servidor mapeia o id para repo/arquivo fixos e carrega sob demanda (precisa de `peft`; reinicie o servidor após instalar). `/health` mostra o status de cada adapter.
- Reinício: não use `pkill -f qwen-pod-server.py` no mesmo comando ssh que contém esse texto (mata o próprio shell).
- Endpoints: `GET /health`, `POST /api/generate`, `POST /api/edit`.
- Os arquivos devem ter finais de linha LF (CRLF quebra o `.sh`).
