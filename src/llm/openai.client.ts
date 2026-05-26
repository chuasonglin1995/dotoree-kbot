import OpenAI from 'openai';
import { LLMClient, LLMCompleteOptions } from './llm.client';

export class OpenAILLMClient implements LLMClient {
  private readonly openai: OpenAI;

  constructor(apiKey: string, private readonly model: string) {
    this.openai = new OpenAI({ apiKey });
  }

  async complete(options: LLMCompleteOptions): Promise<string> {
    const res = await this.openai.chat.completions.create({
      model: this.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    });
    return res.choices[0]?.message?.content ?? '';
  }
}
