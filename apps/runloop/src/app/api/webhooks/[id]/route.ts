import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';
import { logAuditFromRequest } from '@/lib/audit';

// GET /api/webhooks/[id] - Get webhook details (including secret)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success) {
      return Response.json({ error: auth.error }, { status: 401 });
    }

    const webhook = await prisma.webhook.findUnique({ where: { id: params.id } });
    if (!webhook) {
      return Response.json({ error: 'Webhook not found' }, { status: 404 });
    }

    // Verify membership
    const membership = await prisma.projectMember.findFirst({
      where: { projectId: webhook.projectId, userId: auth.userId },
    });
    if (!membership) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    return Response.json({ webhook });
  } catch (err) {
    console.error('GET /api/webhooks/[id] error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/webhooks/[id] - Update webhook status or config
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success) {
      return Response.json({ error: auth.error }, { status: 401 });
    }

    const existing = await prisma.webhook.findUnique({ where: { id: params.id } });
    if (!existing) {
      return Response.json({ error: 'Webhook not found' }, { status: 404 });
    }

    const membership = await prisma.projectMember.findFirst({
      where: {
        projectId: existing.projectId,
        userId: auth.userId,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });
    if (!membership) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, status, customPayload } = body;

    const updated = await prisma.webhook.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(customPayload !== undefined ? { customPayload } : {}),
      },
    });

    // Audit log
    await logAuditFromRequest(request, auth.userId, {
      projectId: existing.projectId,
      action: 'webhook.updated',
      resource: 'webhook',
      resourceId: existing.id,
      oldValue: {
        name: existing.name,
        status: existing.status,
      },
      newValue: {
        name: updated.name,
        status: updated.status,
      },
    });

    return Response.json({ webhook: updated });
  } catch (err) {
    console.error('PUT /api/webhooks/[id] error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/webhooks/[id] - Delete webhook
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success) {
      return Response.json({ error: auth.error }, { status: 401 });
    }

    const existing = await prisma.webhook.findUnique({ where: { id: params.id } });
    if (!existing) {
      return Response.json({ error: 'Webhook not found' }, { status: 404 });
    }

    const membership = await prisma.projectMember.findFirst({
      where: {
        projectId: existing.projectId,
        userId: auth.userId,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });
    if (!membership) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    await prisma.webhook.delete({ where: { id: params.id } });

    // Audit log
    await logAuditFromRequest(request, auth.userId, {
      projectId: existing.projectId,
      action: 'webhook.deleted',
      resource: 'webhook',
      resourceId: existing.id,
      details: {
        name: existing.name,
        schedulerId: existing.schedulerId,
      },
    });

    return Response.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/webhooks/[id] error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
