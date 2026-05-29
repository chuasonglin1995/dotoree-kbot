import { TtsClient } from '../../src/audio/tts.client';

const mockSpeechCreate = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    audio: { speech: { create: mockSpeechCreate } },
  })),
}));

describe('TtsClient', () => {
  beforeEach(() => mockSpeechCreate.mockReset());

  it('calls audio.speech.create with model, voice, input, opus format', async () => {
    const fakeBytes = new Uint8Array([1, 2, 3, 4]);
    mockSpeechCreate.mockResolvedValue({
      arrayBuffer: async () => fakeBytes.buffer,
    });

    const client = new TtsClient('sk-test', 'gpt-4o-mini-tts');
    const out = await client.synthesize('안녕하세요!', 'nova');

    expect(Buffer.isBuffer(out)).toBe(true);
    expect(Buffer.compare(out, Buffer.from(fakeBytes))).toBe(0);
    expect(mockSpeechCreate).toHaveBeenCalledWith({
      model: 'gpt-4o-mini-tts',
      voice: 'nova',
      input: '안녕하세요!',
      response_format: 'opus',
    });
  });
});
