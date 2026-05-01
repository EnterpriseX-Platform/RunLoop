// Simple PII / secret redaction for log payloads. Recursive — clones the
// input so the original object is never mutated. Keys are matched
// case-insensitively against the SENSITIVE_KEY set, and values that look
// like JWT/Bearer/API tokens get redacted regardless of their key name.
//
// Use this anywhere you `console.log` a request body, audit-log a config,
// or write a debug trace that may end up in long-lived storage.

const SENSITIVE_KEY = new Set([
  'password',
  'pass',
  'pwd',
  'secret',
  'apikey',
  'api_key',
  'apitoken',
  'api_token',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'auth',
  'private_key',
  'session',
  'cookie',
  'set-cookie',
  'jwt',
  'jwt_secret',
  'secret_encryption_key',
  'database_url',
  'connection_string',
  'webhook_url',
  'bearer',
  'x-api-key',
]);

const TOKEN_PATTERN =
  /(eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9-_]{16,}|ghp_[A-Za-z0-9]{30,}|rl_[A-Za-z0-9]{16,})/g;

const REDACTED = '[REDACTED]';

export function redact<T>(value: T, depth = 0): T {
  if (depth > 8) return REDACTED as unknown as T;
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.replace(TOKEN_PATTERN, REDACTED) as unknown as T;
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((v) => redact(v, depth + 1)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.has(k.toLowerCase())) {
      out[k] = REDACTED;
      continue;
    }
    out[k] = redact(v, depth + 1);
  }
  return out as unknown as T;
}

// Convenience wrapper for log lines: stringify then redact, so any
// embedded tokens in opaque strings still get scrubbed.
export function redactString(s: string): string {
  return s.replace(TOKEN_PATTERN, REDACTED);
}
