export type AiProvider = 'huggingface' | 'openai-compatible';

export interface HfSettings {
  provider: AiProvider;
  token: string;
  /**
   * OpenAI-compatible API root, for example https://api.openai.com/v1.
   * Leave empty for Hugging Face Inference Providers.
   */
  baseUrl: string;
  textModel: string;
  visionModel: string;
}

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};

export const DEFAULT_HF_SETTINGS: HfSettings = {
  provider: env.VITE_AI_PROVIDER === 'openai-compatible' ? 'openai-compatible' : 'huggingface',
  token: env.VITE_AI_TOKEN ?? '',
  baseUrl: env.VITE_AI_BASE_URL ?? '',
  textModel: env.VITE_TEXT_MODEL ?? 'openai/gpt-oss-20b',
  visionModel: env.VITE_VISION_MODEL ?? 'Qwen/Qwen3-VL-30B-A3B-Instruct',
};

export const HF_ROUTER_BASE_URL = 'https://router.huggingface.co/v1';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      >;
}

export interface ChatRequest {
  token: string;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  provider?: AiProvider;
  baseUrl?: string;
}
