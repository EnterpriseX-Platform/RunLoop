import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from './prisma';
import { NextRequest } from 'next/server';

// Production guards. Validation happens lazily on first use so that
// `next build` (which loads route modules during "Collecting page data")
// doesn't fail when JWT_SECRET / SECRET_ENCRYPTION_KEY aren't supplied
// to the build environment. Runtime — when we actually sign or verify
// tokens — is where insecure defaults get rejected.
const KNOWN_INSECURE_SECRETS = new Set([
  'dev-secret-key',
  'dev-secret-key-change-in-production',
  'change-me',
  'changeme',
  'runloop-secret-change-in-production',
  'secret',
]);

function isRuntime(): boolean {
  // Next.js sets NEXT_PHASE during build; treat anything else as runtime.
  return process.env.NEXT_PHASE !== 'phase-production-build';
}

let _cachedSecret: string | null = null;
function resolveJwtSecret(): string {
  if (_cachedSecret) return _cachedSecret;
  const raw = process.env.JWT_SECRET;
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === 'production' && isRuntime()) {
    if (!raw) {
      throw new Error('JWT_SECRET must be set in production');
    }
    if (raw.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters in production');
    }
    if (KNOWN_INSECURE_SECRETS.has(raw)) {
      throw new Error('JWT_SECRET is set to a known insecure default — generate a strong random value');
    }
  }
  _cachedSecret = raw || 'dev-only-secret-do-not-use-in-prod';
  return _cachedSecret;
}

const JWT_EXPIRES_IN = '7d';

// SKIP_AUTH bypasses authentication and must NEVER be enabled in production.
// Note: avoid `NEXT_PUBLIC_*` here — that prefix bakes the value into the
// client bundle. The skip flag is server-only.
//
// The "must not be true in prod" check is enforced at the first authenticated
// request (see getCurrentUser below), not at module load — `next build`
// imports every route module during page-data collection and would crash
// if we threw here.
export const SKIP_AUTH =
  process.env.SKIP_AUTH === 'true' || process.env.NEXT_PUBLIC_SKIP_AUTH === 'true';

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, resolveJwtSecret(), { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, resolveJwtSecret()) as JWTPayload;
}

// Dev user for SKIP_AUTH mode
export const DEV_USER: JWTPayload = {
  userId: 'dev-user',
  email: 'dev@runloop.io',
  role: 'ADMIN',
};

// First request enforces the production guards we deferred from module load.
let _runtimeGuardsRan = false;
function enforceRuntimeGuards() {
  if (_runtimeGuardsRan) return;
  _runtimeGuardsRan = true;
  if (process.env.NODE_ENV === 'production' && SKIP_AUTH) {
    throw new Error('SKIP_AUTH cannot be enabled when NODE_ENV=production');
  }
}

// Get current user from request - supports both auth modes
export async function getCurrentUser(request: NextRequest): Promise<JWTPayload | null> {
  enforceRuntimeGuards();
  // Skip auth in dev mode
  if (SKIP_AUTH) {
    return DEV_USER;
  }

  const token = request.cookies.get('token')?.value ||
    request.headers.get('authorization')?.replace('Bearer ', '');

  if (!token) {
    return null;
  }

  // RunLoop API keys are issued via Settings → API Keys with the rl_
  // prefix. The engine validates them by hashing and looking up the
  // api_keys table; we mirror that here so Next.js native routes
  // (/api/env-vars, /api/secrets, /api/ai/chat, …) accept the same
  // token a producer uses against the engine. Without this, API keys
  // worked only against routes that proxy through to the engine, which
  // is surprising and inconsistent.
  if (token.startsWith('rl_')) {
    try {
      const sha256 = crypto.createHash('sha256').update(token).digest('hex');
      const row = await prisma.apiKey.findFirst({
        where: { key: sha256, status: 'ACTIVE' },
        select: { userId: true, projectId: true },
      });
      if (!row) {
        console.warn('[auth] API key not found in api_keys table (prefix=' + token.slice(0, 8) + ')');
        return null;
      }
      // Touch last_used_at on success — same pattern as the engine.
      // Best-effort, ignore failure.
      prisma.apiKey
        .updateMany({ where: { key: sha256 }, data: { lastUsedAt: new Date() } })
        .catch(() => {});
      return {
        userId: row.userId,
        // The JWTPayload shape carries email/role; for API keys we
        // can't synthesize those, but they aren't read by the
        // env-vars / secrets / ai-chat routes (only userId is).
        email: '',
        role: 'API_KEY',
      } as unknown as JWTPayload;
    } catch (err) {
      console.error('[auth] API key lookup error:', err);
      return null;
    }
  }

  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

// Authenticate request - returns { success, user, userId, error }
export async function authenticateRequest(request: NextRequest): Promise<{ success: boolean; user?: JWTPayload; userId?: string; error?: string }> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }
    return { success: true, user, userId: user.userId };
  } catch {
    return { success: false, error: 'Authentication failed' };
  }
}

// Require auth - returns user or throws 401
export async function requireAuth(request: NextRequest): Promise<JWTPayload> {
  const user = await getCurrentUser(request);
  
  if (!user) {
    throw new Error('Unauthorized');
  }
  
  return user;
}

export async function createSession(userId: string, token: string, expiresAt: Date) {
  return prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });
}

export async function invalidateSession(token: string) {
  return prisma.session.delete({
    where: { token },
  });
}

export async function getSession(token: string) {
  return prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
}
