import { describe, it, expect } from 'vitest';
import { createRateLimiter, clientKey } from './rate-limit';

describe('createRateLimiter', () => {
  it('allows up to N requests then blocks', () => {
    const rl = createRateLimiter({ max: 3, windowMs: 10_000 });
    expect(rl.consume('a')).toBe(true);
    expect(rl.consume('a')).toBe(true);
    expect(rl.consume('a')).toBe(true);
    expect(rl.consume('a')).toBe(false);
  });

  it('isolates buckets by key', () => {
    const rl = createRateLimiter({ max: 1, windowMs: 10_000 });
    expect(rl.consume('a')).toBe(true);
    expect(rl.consume('b')).toBe(true);
    expect(rl.consume('a')).toBe(false);
    expect(rl.consume('b')).toBe(false);
  });

  it('reset() clears a key', () => {
    const rl = createRateLimiter({ max: 1, windowMs: 10_000 });
    expect(rl.consume('a')).toBe(true);
    expect(rl.consume('a')).toBe(false);
    rl.reset('a');
    expect(rl.consume('a')).toBe(true);
  });

  it('window expires and refills', async () => {
    const rl = createRateLimiter({ max: 1, windowMs: 50 });
    expect(rl.consume('a')).toBe(true);
    expect(rl.consume('a')).toBe(false);
    await new Promise((r) => setTimeout(r, 80));
    expect(rl.consume('a')).toBe(true);
  });

  it('remaining() reports tokens left', () => {
    const rl = createRateLimiter({ max: 5, windowMs: 10_000 });
    rl.consume('a');
    rl.consume('a');
    expect(rl.remaining('a')).toBe(3);
  });
});

describe('clientKey', () => {
  function req(headers: Record<string, string>) {
    return { headers: new Headers(headers) };
  }
  it('prefers x-forwarded-for first hop', () => {
    expect(clientKey(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }), 'p:'))
      .toBe('p:1.2.3.4');
  });
  it('falls back to x-real-ip', () => {
    expect(clientKey(req({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
  });
  it('falls back to cf-connecting-ip', () => {
    expect(clientKey(req({ 'cf-connecting-ip': '8.8.8.8' }))).toBe('8.8.8.8');
  });
  it('returns "unknown" with no headers', () => {
    expect(clientKey(req({}))).toBe('unknown');
  });
});
