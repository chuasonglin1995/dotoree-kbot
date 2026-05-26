import { OpenAILLMClient } from '../../src/llm/openai.client';

const mockCreate = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

describe('OpenAILLMClient', () => {
  beforeEach(() => mockCreate.mockReset());

  it('passes messages and returns assistant content', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'hello' } }] });
    const client = new OpenAILLMClient('sk-test', 'gpt-4o-mini');
    const out = await client.complete({ messages: [{ role: 'user', content: 'hi' }] });
    expect(out).toBe('hello');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    );
  });

  it('sets response_format when jsonMode is true', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: '{}' } }] });
    const client = new OpenAILLMClient('sk-test', 'gpt-4o-mini');
    await client.complete({ messages: [], jsonMode: true });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ response_format: { type: 'json_object' } }),
    );
  });
});
