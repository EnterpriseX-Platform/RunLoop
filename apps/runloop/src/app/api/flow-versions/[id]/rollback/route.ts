import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';

// POST /api/flow-versions/[id]/rollback
// Restores the flow's current flowConfig to the one captured in this version,
// and creates a fresh version entry marking the rollback.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success) return Response.json({ error: auth.error }, { status: 401 });

    const version = await prisma.flowVersion.findUnique({ where: { id: params.id } });
    if (!version) return Response.json({ error: 'Version not found' }, { status: 404 });

    // Rollback requires going through the Go engine to update the flow so the
    // scheduler in-memory state stays consistent. Forward a PUT request.
    const engineURL = process.env.ENGINE_URL || 'http://localhost:8080';
    const putRes = await fetch(`${engineURL}/rl/api/flows/${version.flowId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        // Propagate the caller's auth so the Go engine accepts the update
        Authorization: request.headers.get('authorization') || '',
        Cookie: request.headers.get('cookie') || '',
      },
      body: JSON.stringify({
        name: version.name,
        description: version.description,
        flowConfig: version.flowConfig,
      }),
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      return Response.json({ error: `Engine rejected rollback: ${errText}` }, { status: putRes.status });
    }

    // Snapshot the rollback so the history shows it happened
    const latest = await prisma.flowVersion.findFirst({
      where: { flowId: version.flowId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const newVer = await prisma.flowVersion.create({
      data: {
        flowId: version.flowId,
        version: (latest?.version ?? 0) + 1,
        name: version.name,
        description: version.description,
        flowConfig: version.flowConfig as any,
        createdBy: auth.userId || 'system',
        comment: `Rolled back to version ${version.version}`,
      },
    });

    return Response.json({ success: true, newVersion: newVer });
  } catch (err) {
    console.error('POST rollback error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
