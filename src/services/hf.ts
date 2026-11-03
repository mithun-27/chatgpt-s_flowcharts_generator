import type { ChatRequest } from '../types/hf';

const ROUTER_URL = 'https://router.huggingface.co/v1/chat/completions';

export class HfApiError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'HfApiError';
    this.status = status;
  }
}

interface RouterError {
  error?: string | { message?: string };
  message?: string;
}

function messageForStatus(status: number, serverMessage?: string): string {
  if (status === 401) {
    return 'Hugging Face rejected that token. Create a fine-grained token with permission to make Inference Provider calls.';
  }
  if (status === 402 || status === 403) {
    return 'This token does not have inference credits or permission. Check your Hugging Face billing/settings, or switch to demo mode.';
  }
  if (status === 404) {
    return 'The selected model is not available through Hugging Face Inference Providers. Try another model in AI settings.';
  }
  if (status === 429) {
    return 'Hugging Face is rate-limiting this model. Wait a moment or choose another model.';
  }
  if (status >= 500) {
    return 'The model provider is temporarily unavailable. Please retry in a moment.';
  }
  return serverMessage || `Hugging Face request failed (${status}).`;
}

export async function chatCompletion(request: ChatRequest): Promise<string> {
  if (!request.token.trim()) {
    throw new HfApiError('Add a Hugging Face access token in AI settings first.', 401);
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 120_000);
  const abortFromCaller = () => controller.abort();
  request.signal?.addEventListener('abort', abortFromCaller);

  try {
    const response = await fetch(ROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${request.token.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        max_tokens: request.maxTokens ?? 3000,
        temperature: request.temperature ?? 0.1,
        stream: false,
      }),
      signal: controller.signal,
    });

    const raw = await response.text();
    let payload: unknown = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const errorPayload = (payload ?? {}) as RouterError;
      const serverMessage =
        typeof errorPayload.error === 'string'
          ? errorPayload.error
          : errorPayload.error?.message ?? errorPayload.message;
      throw new HfApiError(messageForStatus(response.status, serverMessage), response.status);
    }

    const data = payload as {
      choices?: Array<{
        message?: { content?: string | Array<{ type?: string; text?: string }> };
      }>;
    } | null;

    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string' && content.trim()) {
      return content.trim();
    }
    if (Array.isArray(content)) {
      const joined = content
        .map((part) => (typeof part.text === 'string' ? part.text : ''))
        .join('\n')
        .trim();
      if (joined) return joined;
    }

    throw new HfApiError('The model returned an empty response. Try again or use demo mode.');
  } catch (error) {
    if (error instanceof HfApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new HfApiError('The AI request timed out. Try a smaller image or another model.');
    }
    if (error instanceof TypeError) {
      throw new HfApiError(
        'Could not reach Hugging Face. Check your internet connection, or use demo mode.',
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    request.signal?.removeEventListener('abort', abortFromCaller);
  }
}
