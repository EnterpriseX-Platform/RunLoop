/**
 * Encryption service for secrets management
 * Uses AES-256-GCM for authenticated encryption
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Get encryption key from environment
function getEncryptionKey(): Buffer {
  const key = process.env.SECRET_ENCRYPTION_KEY;
  if (!key) {
    // In development, generate a deterministic key
    if (process.env.NODE_ENV === 'development') {
      return crypto.scryptSync('runloop-dev-key', 'salt', KEY_LENGTH);
    }
    throw new Error('SECRET_ENCRYPTION_KEY is required in production');
  }
  
  // Ensure key is correct length
  if (key.length !== KEY_LENGTH * 2) {
    throw new Error('SECRET_ENCRYPTION_KEY must be 64 hex characters (256 bits)');
  }
  
  return Buffer.from(key, 'hex');
}

export interface EncryptedValue {
  encrypted: string; // base64 encoded
  iv: string;        // base64 encoded
  tag: string;       // base64 encoded (auth tag for GCM)
}

/**
 * Encrypt a value using AES-256-GCM
 */
export function encrypt(value: string): EncryptedValue {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(value, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const tag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

/**
 * Decrypt a value using AES-256-GCM
 */
export function decrypt(encryptedValue: EncryptedValue): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(encryptedValue.iv, 'base64');
  const tag = Buffer.from(encryptedValue.tag, 'base64');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  let decrypted = decipher.update(encryptedValue.encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Rotate encryption key (re-encrypt with new key)
 * Returns new encrypted value
 */
export function rotateEncryption(
  encryptedValue: EncryptedValue,
  newKey: Buffer
): EncryptedValue {
  const decrypted = decrypt(encryptedValue);
  
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, newKey, iv);
  
  let encrypted = cipher.update(decrypted, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const tag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

/**
 * Generate a secure random key
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

/**
 * Mask a secret value for display (e.g., "***abc123" )
 */
export function maskSecret(value: string, visibleChars: number = 4): string {
  if (value.length <= visibleChars * 2) {
    return '*'.repeat(value.length);
  }
  const start = value.substring(0, visibleChars);
  const end = value.substring(value.length - visibleChars);
  return `${'*'.repeat(4)}${start}...${end}${'*'.repeat(4)}`;
}

/**
 * Validate secret name (alphanumeric + underscore, no spaces)
 */
export function validateSecretName(name: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(name);
}

/**
 * Suggest secret name from service name
 */
export function suggestSecretName(service: string, key: string): string {
  return `${service.toUpperCase()}_${key.toUpperCase()}`;
}
