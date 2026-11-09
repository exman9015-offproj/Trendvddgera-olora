/**
 * Qwen Image 2.1 API Configuration
 * Server-side only (never exposed to frontend)
 */

export interface QwenConfig {
  apiUrl: string;
  timeout: number;
  maxImageSize: number;
}

export function getQwenConfig(): QwenConfig {
  const apiUrl = process.env.QWEN_API_URL;
  
  if (!apiUrl) {
    throw new Error(
      'QWEN_API_URL not configured. Set it in .env.local with the running Pod URL (e.g., https://xxx.runpod.io:5000)'
    );
  }

  return {
    apiUrl,
    timeout: 280000, // under the 5 min route limit
    maxImageSize: 10 * 1024 * 1024, // 10 MB
  };
}

export const QWEN_MODELS = {
  GENERATE: 'qwen-generate',
  EDIT: 'qwen-edit',
} as const;

export const QWEN_IMAGE_SIZES = [
  { width: 512, height: 512, label: '1:1 (512×512)' },
  { width: 768, height: 512, label: '3:2 (768×512)' },
  { width: 512, height: 768, label: '2:3 (512×768)' },
  { width: 1024, height: 1024, label: '1:1 (1024×1024)' },
] as const;

// Ids are the only LoRA value sent to the pod; it maps them to repos/files.
export const QWEN_LORA_OPTIONS = [
  { id: 'none', label: 'Sem LoRA (modelo base)' },
  { id: 'chatrlabs', label: 'ChatR Labs Omni LoRA v0.1' },
  { id: 'f23gg', label: 'f23gg NSFW LoRA' },
] as const;

export type QwenLoraId = (typeof QWEN_LORA_OPTIONS)[number]['id'];

export const QWEN_STEP_RANGE = { min: 20, max: 100, default: 50 } as const;
