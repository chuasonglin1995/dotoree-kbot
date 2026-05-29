import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

export class AudioCache {
  constructor(private readonly dir: string) {}

  private pathFor(hash: string): string {
    return join(this.dir, `${hash}.ogg`);
  }

  async get(hash: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathFor(hash));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return null;
      console.warn(`[AudioCache] read failed for ${hash}:`, err);
      return null;
    }
  }

  async put(hash: string, buffer: Buffer): Promise<void> {
    try {
      await mkdir(this.dir, { recursive: true });
      await writeFile(this.pathFor(hash), buffer);
    } catch (err) {
      console.warn(`[AudioCache] write failed for ${hash}:`, err);
    }
  }
}
