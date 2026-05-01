import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';

// GET /api/flow-versions?flowId=X - list versions for a flow
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success) return Response.json({ error: auth.error }, { status: 401 });

    const flowId = new URL(request.url).searchParams.get('flowId');
    if (!flowId) return Response.json({ error: 'flowId required' }, { status: 400 });

    const versions = await prisma.flowVersion.findMany({
      where: { flowId },
      orderBy: { version: 'desc' },
    });
    return Response.json({ versions });
  } catch (err) {
    console.error('GET flow-versions error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/flow-versions - create a new snapshot (called after flow update)
// Body: { flowId, name, description, flowConfig, comment? }
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success) return Response.json({ error: auth.error }, { status: 401 });

    const body = await request.json();
    const { flowId, name, description, flowConfig, comment } = body;
    if (!flowId || !name || !flowConfig) {
      return Response.json({ error: 'flowId, name, flowConfig required' }, { status: 400 });
    }

    // Next version number = max(existing) + 1
    const latest = await prisma.flowVersion.findFirst({
      where: { flowId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    const version = await prisma.flowVersion.create({
      data: {
        flowId,
        version: nextVersion,
        name,
        description: description || null,
        flowConfig,
        createdBy: auth.userId || 'system',
        comment: comment || null,
      },
    });

    return Response.json({ version }, { status: 201 });
  } catch (err) {
    console.error('POST flow-versions error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
