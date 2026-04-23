import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from './prisma';
import { NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const JWT_EXPIRES_IN = '7d';
export const SKIP_AUTH = process.env.NEXT_PUBLIC_SKIP_AUTH === 'true';

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
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
}

// Dev user for SKIP_AUTH mode
export const DEV_USER: JWTPayload = {
  userId: 'dev-user',
  email: 'dev@runloop.io',
  role: 'ADMIN',
};

// Get current user from request - supports both auth modes
export async function getCurrentUser(request: NextRequest): Promise<JWTPayload | null> {
  // Skip auth in dev mode
  if (SKIP_AUTH) {
    return DEV_USER;
  }

  const token = request.cookies.get('token')?.value ||
    request.headers.get('authorization')?.replace('Bearer ', '');

  if (!token) {
    return null;
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
