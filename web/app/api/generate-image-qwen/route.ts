import { NextRequest, NextResponse } from 'next/server';
import { getQwenConfig, QWEN_LORA_OPTIONS, type QwenLoraId } from '../../../config/qwen-api-config';

export const maxDuration = 300;

const MAX_REQUEST_TIMEOUT = 300000; // 5 minutes (CPU offload makes edits slow)

interface QwenGenerateRequest {
  prompt: string;
  size: string; // "512x512" or similar
  steps: number;
  guidance_scale?: number;
  lora: QwenLoraId;
  seed?: number;
  negative_prompt?: string;
}

interface QwenEditRequest {
  image: string; // base64 or file upload
  instruction: string;
  steps: number;
  preserve_identity?: boolean;
  lora: QwenLoraId;
  seed?: number;
  negative_prompt?: string;
}

interface QwenResponse {
  success: boolean;
  image?: string; // base64
  seed?: number;
  error?: string;
  execution_time?: number;
}

const MAX_SEED = 2 ** 32 - 1;
const MAX_NEGATIVE_PROMPT_LENGTH = 2000;

function seedFields(seed?: number): { seed?: number; randomize_seed: boolean } {
  return seed === undefined ? { randomize_seed: true } : { seed, randomize_seed: false };
}

function toDataUrl(b64: string): string {
  return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
}

async function generateImage(body: QwenGenerateRequest): Promise<QwenResponse> {
  const config = getQwenConfig();
  const startTime = Date.now();

  try {
    const response = await Promise.race([
      fetch(`${config.apiUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: body.prompt,
          size: body.size,
          steps: body.steps,
          guidance_scale: body.guidance_scale ?? 7.5,
          lora: body.lora,
          negative_prompt: body.negative_prompt,
          ...seedFields(body.seed),
        }),
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Generation timeout')), config.timeout)
      ),
    ]) as Response;

    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        error: `Qwen API error (${response.status}): ${error}`,
      };
    }

    const result = await response.json();
    if (!result.success || !result.image) {
      return { success: false, error: result.error || 'Qwen API returned no image' };
    }
    return {
      success: true,
      image: toDataUrl(result.image),
      seed: result.seed,
      execution_time: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function editImage(body: QwenEditRequest): Promise<QwenResponse> {
  const config = getQwenConfig();
  const startTime = Date.now();

  try {
    const response = await Promise.race([
      fetch(`${config.apiUrl}/api/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: body.image,
          instruction: body.instruction,
          steps: body.steps,
          preserve_identity: body.preserve_identity ?? true,
          lora: body.lora,
          negative_prompt: body.negative_prompt,
          ...seedFields(body.seed),
        }),
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Edit timeout')), config.timeout)
      ),
    ]) as Response;

    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        error: `Qwen API error (${response.status}): ${error}`,
      };
    }

    const result = await response.json();
    if (!result.success || !result.image) {
      return { success: false, error: result.error || 'Qwen API returned no image' };
    }
    return {
      success: true,
      image: toDataUrl(result.image),
      seed: result.seed,
      execution_time: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { mode } = body;

    if (!mode || !['generate', 'edit'].includes(mode)) {
      return NextResponse.json(
        { error: 'Invalid mode. Use "generate" or "edit".' },
        { status: 400 }
      );
    }

    const lora = body.lora ?? 'none';
    if (!QWEN_LORA_OPTIONS.some((option) => option.id === lora)) {
      return NextResponse.json(
        { error: `Invalid lora. Use one of: ${QWEN_LORA_OPTIONS.map((o) => o.id).join(', ')}.` },
        { status: 400 }
      );
    }

    let result: QwenResponse;

    const seed = body.seed === undefined || body.seed === null || body.seed === '' ? undefined : Number(body.seed);
    if (seed !== undefined && (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED)) {
      return NextResponse.json(
        { error: `Invalid seed. Use an integer between 0 and ${MAX_SEED}.` },
        { status: 400 }
      );
    }

    const negativePrompt =
      typeof body.negative_prompt === 'string' ? body.negative_prompt.trim() : '';
    if (negativePrompt.length > MAX_NEGATIVE_PROMPT_LENGTH) {
      return NextResponse.json(
        { error: `Negative prompt too long (max ${MAX_NEGATIVE_PROMPT_LENGTH} characters).` },
        { status: 400 }
      );
    }
    const extra = { lora, seed, negative_prompt: negativePrompt || undefined };

    if (mode === 'generate') {
      if (!body.prompt || !body.size || !body.steps) {
        return NextResponse.json(
          { error: 'Missing required fields: prompt, size, steps' },
          { status: 400 }
        );
      }
      result = await generateImage({ ...body, ...extra } as QwenGenerateRequest);
    } else {
      if (!body.image || !body.instruction || !body.steps) {
        return NextResponse.json(
          { error: 'Missing required fields: image, instruction, steps' },
          { status: 400 }
        );
      }
      result = await editImage({ ...body, ...extra } as QwenEditRequest);
    }

    // Check for timeout
    if (Date.now() - startTime > MAX_REQUEST_TIMEOUT) {
      return NextResponse.json(
        { error: 'Request timeout exceeded 5 minutes' },
        { status: 408 }
      );
    }

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      image: result.image,
      seed: result.seed,
      execution_time: result.execution_time,
    });
  } catch (error) {
    console.error('[Qwen API Error]', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
