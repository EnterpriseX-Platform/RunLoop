import { NextRequest } from 'next/server';
import { prisma } from './prisma';

export interface LogAuditInput {
  projectId?: string | null;
  userId?: string | null;
  action: string;              // e.g. "secret.created", "webhook.deleted"
  resource: string;            // e.g. "secret", "webhook"
  resourceId?: string | null;
  details?: unknown;           // stored in newValue; kept as "details" for ergonomics
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Extract client IP address from a Next.js request.
 * Falls back through common proxy headers.
 */
export function getClientIp(request: NextRequest): string | null {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]!.trim();
  }
  return (
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    null
  );
}

/**
 * Write an audit log entry.
 *
 * Audit logging must NEVER break the primary flow. Any failure is swallowed
 * and emitted to the console so the calling route handler can return success.
 */
export async function logAudit(input: LogAuditInput): Promise<void> {
  try {
    const {
      projectId = null,
      userId = null,
      action,
      resource,
      resourceId = null,
      details,
      oldValue,
      newValue,
      ipAddress = null,
      userAgent = null,
    } = input;

    // Prefer explicit newValue; fall back to details for ergonomics.
    const resolvedNewValue = newValue !== undefined ? newValue : details;

    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        projectId: projectId || null,
        action,
        resource,
        resourceId: resourceId || null,
        oldValue: oldValue === undefined ? undefined : (oldValue as any),
        newValue: resolvedNewValue === undefined ? undefined : (resolvedNewValue as any),
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    });
  } catch (err) {
    // Never throw from the audit layer.
    console.error('[audit] failed to write audit log:', err);
  }
}

/**
 * Convenience wrapper that pulls userId + ipAddress + userAgent from a NextRequest.
 */
export async function logAuditFromRequest(
  request: NextRequest,
  userId: string | null | undefined,
  entry: Omit<LogAuditInput, 'userId' | 'ipAddress' | 'userAgent'>
): Promise<void> {
  await logAudit({
    ...entry,
    userId: userId ?? null,
    ipAddress: getClientIp(request),
    userAgent: request.headers.get('user-agent'),
  });
}
