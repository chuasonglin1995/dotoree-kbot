import { createHash } from 'crypto';
import { AudioCache } from './audio-cache';
import { TtsClient } from './tts.client';

export class TtsService {
  constructor(
    private readonly client: TtsClient,
    private readonly cache: AudioCache,
  ) {}

  async synthesize(text: string, voice: string): Promise<Buffer> {
    const hash = this.hashKey(text, voice);
    const cached = await this.cache.get(hash);
    if (cached) return cached;

    const buffer = await this.client.synthesize(text, voice);
    await this.cache.put(hash, buffer);
    return buffer;
  }

  private hashKey(text: string, voice: string): string {
    const model = this.client.getModel();
    return createHash('sha256')
      .update(JSON.stringify([text, voice, model]))
      .digest('hex');
  }
}
