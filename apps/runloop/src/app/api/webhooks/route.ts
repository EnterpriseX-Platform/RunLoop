import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';
import { logAuditFromRequest } from '@/lib/audit';
import crypto from 'crypto';

// GET /api/webhooks?projectId=X&schedulerId=Y - List webhooks
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success) {
      return Response.json({ error: auth.error }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const schedulerId = searchParams.get('schedulerId');

    if (!projectId) {
      return Response.json({ error: 'Project ID is required' }, { status: 400 });
    }

    // Check project access
    const membership = await prisma.projectMember.findFirst({
      where: { projectId, userId: auth.userId },
    });
    if (!membership) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    const where: any = { projectId };
    if (schedulerId) where.schedulerId = schedulerId;

    const webhooks = await prisma.webhook.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return Response.json({ webhooks });
  } catch (err) {
    console.error('GET /api/webhooks error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/webhooks - Create a webhook
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success) {
      return Response.json({ error: auth.error }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, schedulerId, name, description, customPayload } = body;

    if (!projectId) {
      return Response.json({ error: 'Project ID is required' }, { status: 400 });
    }
    if (!name) {
      return Response.json({ error: 'Name is required' }, { status: 400 });
    }

    // Check project access (admin+)
    const membership = await prisma.projectMember.findFirst({
      where: {
        projectId,
        userId: auth.userId,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });
    if (!membership) {
      return Response.json(
        { error: 'Only project owners and admins can create webhooks' },
        { status: 403 }
      );
    }

    // Generate a secure random secret for HMAC signing
    const secret = crypto.randomBytes(32).toString('hex');

    const webhook = await prisma.webhook.create({
      data: {
        projectId,
        schedulerId: schedulerId || null,
        name,
        description: description || null,
        secret,
        customPayload: customPayload || undefined,
        status: 'ACTIVE',
      },
    });

    // Audit log
    await logAuditFromRequest(request, auth.userId, {
      projectId,
      action: 'webhook.created',
      resource: 'webhook',
      resourceId: webhook.id,
      details: {
        name: webhook.name,
        schedulerId: webhook.schedulerId,
      },
    });

    return Response.json({ webhook }, { status: 201 });
  } catch (err) {
    console.error('POST /api/webhooks error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
