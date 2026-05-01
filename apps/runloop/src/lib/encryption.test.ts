import { describe, it, expect, beforeAll } from 'vitest';
import { encrypt, decrypt, validateSecretName, maskSecret, generateEncryptionKey } from './encryption';

beforeAll(() => {
  // Deterministic 64-hex key for tests so we don't depend on the host env.
  process.env.SECRET_ENCRYPTION_KEY =
    '0000000000000000000000000000000000000000000000000000000000000001';
});

describe('encrypt/decrypt', () => {
  it('round-trips a plaintext value', () => {
    const enc = encrypt('hello world');
    expect(enc.encrypted).toBeTruthy();
    expect(enc.iv).toBeTruthy();
    expect(enc.tag).toBeTruthy();
    expect(decrypt(enc)).toBe('hello world');
  });

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const a = encrypt('secret');
    const b = encrypt('secret');
    expect(a.iv).not.toBe(b.iv);
    expect(a.encrypted).not.toBe(b.encrypted);
    expect(decrypt(a)).toBe(decrypt(b));
  });

  it('decryption fails when the auth tag is tampered with', () => {
    const enc = encrypt('important');
    expect(() => decrypt({ ...enc, tag: 'AAAAAAAAAAAAAAAAAAAAAA==' })).toThrow();
  });

  it('decryption fails when the ciphertext is tampered with', () => {
    const enc = encrypt('important');
    const tampered = {
      ...enc,
      encrypted: Buffer.from('different-content').toString('base64'),
    };
    expect(() => decrypt(tampered)).toThrow();
  });

  it('handles unicode + long values', () => {
    const long = 'สวัสดี'.repeat(2000) + '🎉';
    expect(decrypt(encrypt(long))).toBe(long);
  });
});

describe('generateEncryptionKey', () => {
  it('returns 64 hex chars (256 bits)', () => {
    const k = generateEncryptionKey();
    expect(k).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('validateSecretName', () => {
  const ok = ['API_KEY', 'A', 'X1', 'STRIPE_SECRET_KEY'];
  const bad = ['', 'lower', 'has-hyphen', '1STARTS_WITH_DIGIT', 'has space', 'A_!@#'];
  for (const name of ok) {
    it(`accepts ${name}`, () => expect(validateSecretName(name)).toBe(true));
  }
  for (const name of bad) {
    it(`rejects ${name}`, () => expect(validateSecretName(name)).toBe(false));
  }
});

describe('maskSecret', () => {
  it('returns a non-empty masked string', () => {
    const masked = maskSecret('sk-abcdefghijklmn');
    expect(masked.length).toBeGreaterThan(0);
    expect(masked).toContain('*');
  });
  it('returns a placeholder for very short values', () => {
    const m = maskSecret('ab');
    expect(m.length).toBeGreaterThan(0);
  });
});
