import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';

// DELETE /api/api-keys/[id] - Revoke API key (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success) {
      return Response.json({ error: auth.error }, { status: 401 });
    }

    const { id } = params;
    if (!id) {
      return Response.json({ error: 'API key ID is required' }, { status: 400 });
    }

    const existing = await prisma.apiKey.findUnique({
      where: { id },
      select: { id: true, projectId: true, revokedAt: true },
    });

    if (!existing) {
      return Response.json({ error: 'API key not found' }, { status: 404 });
    }

    if (!existing.projectId) {
      return Response.json({ error: 'API key is not associated with a project' }, { status: 400 });
    }

    // Require OWNER or ADMIN on the project
    const membership = await prisma.projectMember.findFirst({
      where: {
        projectId: existing.projectId,
        userId: auth.userId,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!membership) {
      return Response.json(
        { error: 'Only project owners and admins can revoke API keys' },
        { status: 403 }
      );
    }

    if (existing.revokedAt) {
      return Response.json({ error: 'API key already revoked' }, { status: 400 });
    }

    const updated = await prisma.apiKey.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        status: 'REVOKED',
      },
      select: {
        id: true,
        revokedAt: true,
        status: true,
      },
    });

    return Response.json({ apiKey: updated });
  } catch (error) {
    console.error('Revoke API key error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
