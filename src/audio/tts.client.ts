import OpenAI from 'openai';

export class TtsClient {
  private readonly openai: OpenAI;

  constructor(apiKey: string, private readonly model: string) {
    this.openai = new OpenAI({ apiKey });
  }

  getModel(): string {
    return this.model;
  }

  async synthesize(text: string, voice: string): Promise<Buffer> {
    const response = await this.openai.audio.speech.create({
      model: this.model,
      voice,
      input: text,
      response_format: 'opus',
    });
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
