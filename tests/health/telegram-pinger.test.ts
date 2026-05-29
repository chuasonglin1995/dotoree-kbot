import { pingTelegramOnce } from '../../src/health/telegram-pinger';
import { HealthState } from '../../src/health/health-state';

const T0 = 2_000_000;

describe('pingTelegramOnce', () => {
  it('marks telegram ok when getMe resolves', async () => {
    const h = new HealthState(T0);
    const telegram = { getMe: jest.fn().mockResolvedValue({ id: 1 }) };
    const ok = await pingTelegramOnce(telegram, h, T0 + 100);
    expect(ok).toBe(true);
    expect(telegram.getMe).toHaveBeenCalledTimes(1);
    expect(h.snapshot(T0 + 100).lastTelegramOkAtMs).toBe(T0 + 100);
  });

  it('returns false, does not mark, and warns when getMe rejects', async () => {
    const h = new HealthState(T0);
    const telegram = { getMe: jest.fn().mockRejectedValue(new Error('network')) };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const ok = await pingTelegramOnce(telegram, h, T0 + 100);
    expect(ok).toBe(false);
    expect(h.snapshot(T0 + 100).lastTelegramOkAtMs).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('network'));
    warn.mockRestore();
  });
});
