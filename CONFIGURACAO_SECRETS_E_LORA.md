# Configuração do projeto: variáveis/secrets e LoRA do Qwen

> Este arquivo lista **apenas nomes** de variáveis. Nunca coloque valores reais aqui nem commite `web/.env.local`
> (está no `.gitignore`). Guarde os valores num gerenciador de senhas.

## 1. Variáveis de ambiente (front-end Next.js, `web/.env.local`)

| Variável | Obrigatória | Para que serve |
|---|---|---|
| `QWEN_API_URL` | Sim (página Qwen) | URL do servidor Qwen no pod. Formato: `https://<POD_ID>-5000.proxy.runpod.net` (a URL do proxy não muda entre reinícios do pod; o POD_ID muda se criar outro pod). |
| `COMFYUI_API_URL` | Só se usar ComfyUI | URL do pod ComfyUI. |
| `COMFYUI_API_KEY` | Opcional | Chave do ComfyUI, se o servidor exigir. |
| `COMFYUI_WORKFLOW_JSON` / `COMFYUI_WORKFLOW_FILE` | Opcional | Workflow em JSON ou caminho (padrão `config/comfyui-workflow-api.json`). |
| `FOOOCUS_API_URL` / `FOOOCUS_API_KEY` | Só se usar Fooocus | URL e chave da API Fooocus. |
| `IMAGE_GENERATION_BACKEND` | Opcional | `comfyui` (padrão) ou `fooocus`, usado por `/api/generate-image`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Recomendado | URL do projeto Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Recomendado | Chave anon (pública por design) do Supabase. |
| `VERCEL_OIDC_TOKEN` | Não editar | Gerado pelo Vercel CLI (`vercel env pull`); expira, não é usado pelo código. |

Observação: [web/lib/supabase.ts](web/lib/supabase.ts) tem um valor de fallback embutido para a URL/chave do Supabase.
Defina as variáveis acima para não depender do fallback e remova-o do código se o projeto for público.

Depois de alterar `.env.local`, reinicie o Next (`npm run build` + `npm start`, ou `npm run dev`).

## 2. Variáveis no pod Runpod (servidor Qwen)

| Variável | Padrão | Para que serve |
|---|---|---|
| `PORT` | `5000` | Porta do FastAPI (exposta como `<POD_ID>-5000.proxy.runpod.net`). |
| `QWEN_IMAGE_MODEL` | `Qwen/Qwen-Image-2.1` | Modelo base. |
| `QWEN_CPU_OFFLOAD` | `1` | `enable_model_cpu_offload()` para caber na RTX 3090 de 24 GB. Mais lento, usa menos VRAM. |
| `PUBLIC_KEY` | (definir no pod) | Chave pública SSH injetada no pod. |
| `PIP_BREAK_SYSTEM_PACKAGES` | `1` (só na sessão) | Necessário para `pip install` no Python do pod. |

Não há mais `QWEN_LORA_REPO` / `QWEN_LORA_WEIGHT`: a LoRA agora é escolhida por requisição (seção 4).
Os repositórios LoRA são públicos e não exigem token do Hugging Face.

## 3. Credenciais fora do código

- **Runpod:** chave de API da conta (usada pelas ferramentas/MCP do Runpod, não pelo app).
- **SSH:** par `~/.ssh/runpod_ed25519` (privada fica só na sua máquina; a pública está registrada na conta Runpod e em `PUBLIC_KEY`).
  Acesso: `ssh -i ~/.ssh/runpod_ed25519 -p <PORTA> root@<IP>`. **A porta e o IP mudam a cada reinício do pod**
  (ver `get-pod` → `ssh.direct`).
- **Supabase/Vercel:** gerenciados nos respectivos painéis.

## 4. Como a LoRA funciona

Ids aceitos (a UI e o servidor só aceitam estes; qualquer outro valor retorna erro 400):

| id | Rótulo | Repositório | Arquivo |
|---|---|---|---|
| `none` | Sem LoRA | n/a | n/a |
| `chatrlabs` | ChatR Labs Omni LoRA v0.1 | `chatrlabs/Qwen-Image-2.1-Uncensored-Omni-LoRA-v0.1` | `chatrlabs-omni-lora-v0.1-bf16.safetensors` |
| `f23gg` | f23gg NSFW LoRA | `f23gg/NSFW-LORA-Qwen-Image-2.1` | `NSFW Qwen Lora.safetensors` |

Fluxo:
1. Na página Qwen há um seletor de LoRA nos modos **Gerar** e **Editar** ([web/components/QwenView.tsx](web/components/QwenView.tsx)).
2. A rota [web/app/api/generate-image-qwen/route.ts](web/app/api/generate-image-qwen/route.ts) valida o id contra
   `QWEN_LORA_OPTIONS` ([web/config/qwen-api-config.ts](web/config/qwen-api-config.ts)) e repassa `lora` ao pod.
3. O servidor [qwen-pod-server.py](qwen-pod-server.py) mapeia o id para repo/arquivo fixos (`LORA_OPTIONS`),
   baixa e carrega o adapter **sob demanda** no primeiro uso (`load_lora_weights(..., adapter_name=<id>)`) e ativa com `set_adapters`.
   Com `none`, chama `disable_lora()`, então a LoRA da requisição anterior não vaza.
4. Um `threading.Lock` serializa as requisições, porque o pipeline é compartilhado.
5. Falha ao carregar uma LoRA devolve erro claro só para aquela opção; o servidor e as outras opções seguem funcionando.
6. `GET /health` mostra `active_lora` e, por adapter, `repo`, `weight` e `status` (`loaded`, `not loaded` ou `error: ...`). Não expõe credenciais.

Requisitos: `peft` instalado (está em [qwen-requirements.txt](qwen-requirements.txt)) e **servidor reiniciado depois de instalar**,
senão o Diffusers não detecta o PEFT e dá "PEFT backend is required for load_lora_weights()".

Resultados validados no pod (RTX 3090, 512x512, 8 steps, seed 7): Gerar e Editar funcionaram com `none`, `chatrlabs` e `f23gg`
(~32-54 s cada, mais o download na primeira vez). Depois de usar as LoRAs, `none` reproduziu exatamente a imagem base.

Limitações conhecidas:
- A ChatR recomenda cfg 5.0 e VAE tiling desligado; o servidor usa `true_cfg_scale=2.0` e tiling ligado, então a qualidade pode ficar abaixo do ideal.
- `f23gg` é de texto para imagem, então pode seguir mal instruções no modo Editar.
- Qualidade visual não foi avaliada, só que carrega e gera.

## 5. Subir tudo do zero

1. Pod com PyTorch (RTX 3090 ou melhor), porta HTTP 5000 exposta, `PUBLIC_KEY` definida.
2. Copiar `qwen-pod-server.py`, `qwen-requirements.txt` e `qwen-pod-setup.sh` para `/workspace` e rodar o setup
   (com `PIP_BREAK_SYSTEM_PACKAGES=1`).
3. Iniciar: `cd /workspace && setsid nohup python qwen-pod-server.py > server.log 2>&1 < /dev/null & disown`
4. Conferir: `curl https://<POD_ID>-5000.proxy.runpod.net/health`
5. Colocar a URL em `QWEN_API_URL` no `web/.env.local`, depois `cd web; npm run build; npm start`.

Cuidados:
- O disco do pod é **temporário**: reiniciar ou parar apaga `/workspace` e os pacotes pip; refaça o passo 2.
- Não use `pkill -f qwen-pod-server.py` dentro do mesmo comando ssh que contém esse texto (mata o próprio shell). Faça em chamadas separadas.
- O pod cobra enquanto estiver rodando; pare-o quando não estiver usando.

Mais detalhes operacionais em [QWEN_RUNPOD_NOTAS.md](QWEN_RUNPOD_NOTAS.md).
