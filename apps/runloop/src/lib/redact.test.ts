import { describe, it, expect } from 'vitest';
import { redact, redactString } from './redact';

describe('redact', () => {
  it('replaces values for sensitive keys (case-insensitive)', () => {
    const out = redact({ password: 'p@ss', Token: 'abc', userName: 'alice' });
    expect(out.password).toBe('[REDACTED]');
    expect(out.Token).toBe('[REDACTED]');
    expect(out.userName).toBe('alice');
  });

  it('walks nested objects', () => {
    const out = redact({ user: { email: 'a@b.com', api_key: 'secret' } });
    expect(out.user.email).toBe('a@b.com');
    expect(out.user.api_key).toBe('[REDACTED]');
  });

  it('walks arrays', () => {
    const out = redact([{ password: 'x' }, { name: 'ok' }]);
    expect(out[0].password).toBe('[REDACTED]');
    expect(out[1].name).toBe('ok');
  });

  it('redacts JWT-shaped strings even outside sensitive keys', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.abcdefghijklmnop_signature';
    const out = redact({ note: `bearer ${jwt}` });
    expect(out.note).toBe('bearer [REDACTED]');
  });

  it('redacts sk-* OpenAI keys', () => {
    const out = redactString('apiKey=sk-abcdefghijklmnopqrstuv');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts ghp_* GitHub tokens', () => {
    const out = redactString('token=ghp_abcdefghijklmnopqrstuvwxyz0123456789');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts rl_* RunLoop API keys', () => {
    const out = redactString('Authorization: Bearer rl_abcdefghijklmnopqrstuvwxyz');
    expect(out).toContain('[REDACTED]');
  });

  it('handles null/undefined/primitive', () => {
    expect(redact(null)).toBe(null);
    expect(redact(undefined)).toBe(undefined);
    expect(redact(42)).toBe(42);
    expect(redact(true)).toBe(true);
  });

  it('caps recursion depth', () => {
    // build a circular-ish 20-deep chain
    let nested: any = { leaf: 'ok' };
    for (let i = 0; i < 20; i++) nested = { inner: nested };
    const out: any = redact(nested);
    // does not throw, returns either the redacted sentinel or a partial copy
    expect(out).toBeDefined();
  });
});
