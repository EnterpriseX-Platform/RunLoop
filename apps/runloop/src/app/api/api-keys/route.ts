import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';

// GET /api/api-keys?projectId=X - List non-revoked API keys for a project
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success) {
      return Response.json({ error: auth.error }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return Response.json({ error: 'Project ID is required' }, { status: 400 });
    }

    // Require project membership (any role)
    const membership = await prisma.projectMember.findFirst({
      where: {
        projectId,
        userId: auth.userId,
      },
    });

    if (!membership) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    const keys = await prisma.apiKey.findMany({
      where: {
        projectId,
        revokedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
        revokedAt: true,
        status: true,
        userId: true,
        // Never return `key` (hashed token)
      },
    });

    return Response.json({ apiKeys: keys });
  } catch (error) {
    console.error('List API keys error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/api-keys - Create a new API key, returns raw token ONCE
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success) {
      return Response.json({ error: auth.error }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, name, expiresAt } = body;

    if (!projectId || !name || typeof name !== 'string' || !name.trim()) {
      return Response.json(
        { error: 'Project ID and name are required' },
        { status: 400 }
      );
    }

    // Require OWNER or ADMIN
    const membership = await prisma.projectMember.findFirst({
      where: {
        projectId,
        userId: auth.userId,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!membership) {
      return Response.json(
        { error: 'Only project owners and admins can create API keys' },
        { status: 403 }
      );
    }

    // Generate raw token: rl_<32 random hex chars>
    const randomPart = crypto.randomBytes(16).toString('hex'); // 32 hex chars
    const rawToken = `rl_${randomPart}`;
    const hashedKey = crypto.createHash('sha256').update(rawToken).digest('hex');
    const prefix = rawToken.substring(0, 8); // "rl_" + first 5 hex chars = 8 chars

    // Parse expiresAt (optional)
    let expiresAtDate: Date | null = null;
    if (expiresAt) {
      const parsed = new Date(expiresAt);
      if (isNaN(parsed.getTime())) {
        return Response.json({ error: 'Invalid expiresAt date' }, { status: 400 });
      }
      expiresAtDate = parsed;
    }

    const apiKey = await prisma.apiKey.create({
      data: {
        projectId,
        userId: auth.userId!,
        name: name.trim(),
        key: hashedKey,
        prefix,
        permissions: [],
        expiresAt: expiresAtDate,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
        status: true,
      },
    });

    // Return the raw token ONCE — caller must save it now
    return Response.json({
      apiKey,
      token: rawToken,
      message: 'Save this token now — you will not see it again.',
    });
  } catch (error) {
    console.error('Create API key error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
