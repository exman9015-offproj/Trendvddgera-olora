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

export const QWEN_STEP_RANGE = { min: 20, max: 100, default: 50 } as const;
