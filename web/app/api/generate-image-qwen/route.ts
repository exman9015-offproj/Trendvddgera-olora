import { NextRequest, NextResponse } from 'next/server';
import { getQwenConfig } from '../../../config/qwen-api-config';

export const maxDuration = 300;

const MAX_REQUEST_TIMEOUT = 300000; // 5 minutes (CPU offload makes edits slow)

interface QwenGenerateRequest {
  prompt: string;
  size: string; // "512x512" or similar
  steps: number;
  guidance_scale?: number;
}

interface QwenEditRequest {
  image: string; // base64 or file upload
  instruction: string;
  steps: number;
  preserve_identity?: boolean;
}

interface QwenResponse {
  success: boolean;
  image?: string; // base64
  error?: string;
  execution_time?: number;
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

    let result: QwenResponse;

    if (mode === 'generate') {
      if (!body.prompt || !body.size || !body.steps) {
        return NextResponse.json(
          { error: 'Missing required fields: prompt, size, steps' },
          { status: 400 }
        );
      }
      result = await generateImage(body as QwenGenerateRequest);
    } else {
      if (!body.image || !body.instruction || !body.steps) {
        return NextResponse.json(
          { error: 'Missing required fields: image, instruction, steps' },
          { status: 400 }
        );
      }
      result = await editImage(body as QwenEditRequest);
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
