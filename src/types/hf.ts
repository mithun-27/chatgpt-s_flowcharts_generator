export interface HfSettings {
  token: string;
  textModel: string;
  visionModel: string;
}

export const DEFAULT_HF_SETTINGS: HfSettings = {
  token: '',
  textModel: 'openai/gpt-oss-20b',
  visionModel: 'Qwen/Qwen3-VL-30B-A3B-Instruct',
};

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
}
