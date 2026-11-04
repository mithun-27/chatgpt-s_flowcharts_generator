import type { AiProvider, ChatRequest } from '../types/hf';
import { HF_ROUTER_BASE_URL } from '../types/hf';

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

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

function endpointFor(provider: AiProvider, baseUrl?: string): string {
  const trimmed = (baseUrl ?? '').trim();
  const root =
    provider === 'huggingface'
      ? trimmed || HF_ROUTER_BASE_URL
      : trimmed || 'https://api.openai.com/v1';
  if (/\/chat\/completions\/?$/i.test(root)) return root;
  return `${root.replace(/\/+$/, '')}/chat/completions`;
}

function providerName(provider: AiProvider): string {
  return provider === 'huggingface' ? 'Hugging Face' : 'the configured AI provider';
}

function messageForStatus(status: number, provider: AiProvider, serverMessage?: string): string {
  const name = providerName(provider);
  if (status === 401) {
    return `${name} rejected the token. Check the API key in AI settings.`;
  }
  if (status === 402 || status === 403) {
    return `${name} denied this request. Check the account credits or token permissions, or switch to local mode.`;
  }
  if (status === 404) {
    return `The selected model or endpoint was not found on ${name}. Check the model id and base URL in AI settings.`;
  }
  if (status === 429) {
    return `${name} is rate-limiting this model. Wait a moment or choose another model.`;
  }
  if (status >= 500) {
    return `${name} is temporarily unavailable. The request was retried; try again shortly.`;
  }
  return serverMessage || `${name} request failed (${status}).`;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function readMessageContent(content: unknown): string {
  if (typeof content === 'string' && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => {
        if (!part || typeof part !== 'object') return '';
        const value = (part as { text?: unknown }).text;
        return typeof value === 'string' ? value : '';
      })
      .join('\n')
      .trim();
    if (joined) return joined;
  }
  return '';
}

export async function chatCompletion(request: ChatRequest): Promise<string> {
  const provider = request.provider ?? 'huggingface';
  if (!request.token.trim()) {
    throw new HfApiError(`Add an access token in AI settings first, or use local mode.`, 401);
  }

  const endpoint = endpointFor(provider, request.baseUrl);
  let lastError: HfApiError | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 120_000);
    const abortFromCaller = () => controller.abort();
    request.signal?.addEventListener('abort', abortFromCaller);

    try {
      const response = await fetch(endpoint, {
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
        const message = messageForStatus(response.status, provider, serverMessage);
        lastError = new HfApiError(message, response.status);
        if (RETRYABLE.has(response.status) && attempt < MAX_ATTEMPTS - 1) {
          await sleep(600 * 2 ** attempt);
          continue;
        }
        throw lastError;
      }

      const data = payload as {
        choices?: Array<{ message?: { content?: unknown } }>;
      } | null;
      const content = readMessageContent(data?.choices?.[0]?.message?.content);
      if (content) return content;

      throw new HfApiError('The model returned an empty response. Try again or use local mode.');
    } catch (error) {
      if (error instanceof HfApiError) {
        if (RETRYABLE.has(error.status) && attempt < MAX_ATTEMPTS - 1) {
          lastError = error;
          await sleep(600 * 2 ** attempt);
          continue;
        }
        throw error;
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        if (request.signal?.aborted) {
          throw new HfApiError('The AI request was cancelled.');
        }
        throw new HfApiError('The AI request timed out. Try a smaller image or another model.');
      }
      if (error instanceof TypeError) {
        lastError = new HfApiError(
          `Could not reach ${providerName(provider)}. Check your internet connection and base URL, or use local mode.`,
        );
        if (attempt < MAX_ATTEMPTS - 1) {
          await sleep(600 * 2 ** attempt);
          continue;
        }
        throw lastError;
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
      request.signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  throw lastError ?? new HfApiError('The AI request failed.');
}
