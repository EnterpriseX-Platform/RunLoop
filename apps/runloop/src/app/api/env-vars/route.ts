// /api/env-vars — list / create / update / delete project env vars.
// Plaintext per-project config (NOT secrets). Flows reference values
// as ${{env.NAME}} which the engine resolves at execution time.

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

async function checkMembership(projectId: string, userId: string) {
  return prisma.projectMember.findFirst({ where: { projectId, userId } });
}

// GET /api/env-vars?projectId=...
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.success) return Response.json({ error: auth.error }, { status: 401 });

  const projectId = new URL(request.url).searchParams.get('projectId');
  if (!projectId) return Response.json({ error: 'projectId required' }, { status: 400 });

  const m = await checkMembership(projectId, auth.userId!);
  if (!m) return Response.json({ error: 'access denied' }, { status: 403 });

  const data = await prisma.envVar.findMany({
    where: { projectId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, value: true, description: true, updatedAt: true, createdBy: true },
  });
  return Response.json({ data });
}

// POST /api/env-vars  body: { projectId, name, value, description? }
// Upsert by (projectId, name) so editing reuses the same row.
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.success) return Response.json({ error: auth.error }, { status: 401 });

  const body = await request.json().catch(() => null) as
    | { projectId?: string; name?: string; value?: string; description?: string | null }
    | null;
  if (!body) return Response.json({ error: 'invalid body' }, { status: 400 });

  const { projectId, name, value, description } = body;
  if (!projectId || !name || value === undefined) {
    return Response.json({ error: 'projectId, name, value required' }, { status: 400 });
  }
  if (!NAME_RE.test(name)) {
    return Response.json(
      { error: 'name must match ' + NAME_RE.source + ' (UPPER_SNAKE_CASE recommended)' },
      { status: 400 },
    );
  }

  const m = await checkMembership(projectId, auth.userId!);
  if (!m) return Response.json({ error: 'access denied' }, { status: 403 });

  const row = await prisma.envVar.upsert({
    where: { projectId_name: { projectId, name } },
    create: {
      projectId,
      name,
      value,
      description: description ?? null,
      createdBy: auth.userId!,
    },
    update: {
      value,
      description: description ?? null,
    },
  });
  return Response.json({ data: { id: row.id, name: row.name, value: row.value } });
}
