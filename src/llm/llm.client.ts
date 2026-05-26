export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCompleteOptions {
  messages: LLMMessage[];
  jsonMode?: boolean;
  temperature?: number;
}

export interface LLMClient {
  complete(options: LLMCompleteOptions): Promise<string>;
}
