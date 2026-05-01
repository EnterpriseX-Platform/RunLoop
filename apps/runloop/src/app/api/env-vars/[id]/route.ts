import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';

// DELETE /api/env-vars/:id — remove a single env var. Membership of the
// owning project is required.
export async function DELETE(request: NextRequest, ctx: { params: { id: string } }) {
  const auth = await authenticateRequest(request);
  if (!auth.success) return Response.json({ error: auth.error }, { status: 401 });

  const id = ctx.params.id;
  const row = await prisma.envVar.findUnique({ where: { id } });
  if (!row) return Response.json({ error: 'not found' }, { status: 404 });

  const m = await prisma.projectMember.findFirst({
    where: { projectId: row.projectId, userId: auth.userId! },
  });
  if (!m) return Response.json({ error: 'access denied' }, { status: 403 });

  await prisma.envVar.delete({ where: { id } });
  return Response.json({ data: { id, deleted: true } });
}
