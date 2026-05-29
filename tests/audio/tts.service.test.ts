import { TtsService } from '../../src/audio/tts.service';

function makeMocks() {
  const client = {
    getModel: jest.fn().mockReturnValue('gpt-4o-mini-tts'),
    synthesize: jest.fn().mockResolvedValue(Buffer.from([7, 7, 7])),
  };
  const cache = {
    get: jest.fn().mockResolvedValue(null),
    put: jest.fn().mockResolvedValue(undefined),
  };
  return { client, cache };
}

describe('TtsService', () => {
  it('on cache miss, calls client and stores in cache', async () => {
    const { client, cache } = makeMocks();
    const svc = new TtsService(client as any, cache as any);

    const buf = await svc.synthesize('안녕', 'nova');

    expect(client.synthesize).toHaveBeenCalledWith('안녕', 'nova');
    expect(cache.put).toHaveBeenCalledTimes(1);
    expect(Buffer.compare(buf, Buffer.from([7, 7, 7]))).toBe(0);
  });

  it('on cache hit, returns cached buffer and does NOT invoke client', async () => {
    const { client, cache } = makeMocks();
    cache.get.mockResolvedValue(Buffer.from([1, 1, 1]));
    const svc = new TtsService(client as any, cache as any);

    const buf = await svc.synthesize('안녕', 'nova');

    expect(client.synthesize).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
    expect(Buffer.compare(buf, Buffer.from([1, 1, 1]))).toBe(0);
  });

  it('uses different cache key for different voices', async () => {
    const { client, cache } = makeMocks();
    const svc = new TtsService(client as any, cache as any);

    await svc.synthesize('안녕', 'nova');
    await svc.synthesize('안녕', 'shimmer');

    const hashNova = cache.get.mock.calls[0][0];
    const hashShimmer = cache.get.mock.calls[1][0];
    expect(hashNova).not.toEqual(hashShimmer);
  });

  it('uses different cache key for different model', async () => {
    const { client, cache } = makeMocks();
    const svc1 = new TtsService(client as any, cache as any);
    await svc1.synthesize('안녕', 'nova');

    client.getModel.mockReturnValue('tts-1');
    const svc2 = new TtsService(client as any, cache as any);
    await svc2.synthesize('안녕', 'nova');

    const hash1 = cache.get.mock.calls[0][0];
    const hash2 = cache.get.mock.calls[1][0];
    expect(hash1).not.toEqual(hash2);
  });

  it('cache key is deterministic', async () => {
    const { client, cache } = makeMocks();
    const svc = new TtsService(client as any, cache as any);

    await svc.synthesize('안녕', 'nova');
    await svc.synthesize('안녕', 'nova');

    const first = cache.get.mock.calls[0][0];
    const second = cache.get.mock.calls[1][0];
    expect(first).toEqual(second);
  });
});
