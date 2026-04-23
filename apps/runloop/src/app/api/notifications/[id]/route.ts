import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success) return Response.json({ error: auth.error }, { status: 401 });
    const body = await request.json();
    const updated = await prisma.notification.update({
      where: { id: params.id },
      data: {
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.config !== undefined ? { config: body.config } : {}),
        ...(body.onSuccess !== undefined ? { onSuccess: body.onSuccess } : {}),
        ...(body.onFailure !== undefined ? { onFailure: body.onFailure } : {}),
        ...(body.onStart !== undefined ? { onStart: body.onStart } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
    });
    return Response.json({ notification: updated });
  } catch (err) {
    console.error('PUT notification error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success) return Response.json({ error: auth.error }, { status: 401 });
    await prisma.notification.delete({ where: { id: params.id } });
    return Response.json({ success: true });
  } catch (err) {
    console.error('DELETE notification error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
