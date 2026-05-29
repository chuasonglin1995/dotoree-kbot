import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AudioCache } from '../../src/audio/audio-cache';

describe('AudioCache', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'audio-cache-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('returns null on miss', async () => {
    const cache = new AudioCache(dir);
    const result = await cache.get('does-not-exist');
    expect(result).toBeNull();
  });

  it('round-trips put then get', async () => {
    const cache = new AudioCache(dir);
    const buf = Buffer.from([1, 2, 3, 4, 5]);
    await cache.put('abc', buf);
    const got = await cache.get('abc');
    expect(got).not.toBeNull();
    expect(Buffer.compare(got!, buf)).toBe(0);
  });

  it('writes to <dir>/<hash>.ogg', async () => {
    const cache = new AudioCache(dir);
    await cache.put('deadbeef', Buffer.from([9]));
    const got = await cache.get('deadbeef');
    expect(got).not.toBeNull();
  });

  it('swallows write failure (e.g., invalid path) and does not throw', async () => {
    const cache = new AudioCache('/nonexistent/path/that/cannot/be/made/\0invalid');
    await expect(cache.put('x', Buffer.from([1]))).resolves.toBeUndefined();
  });
});
