import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';

// GET /api/notifications?schedulerId=X - list notifications for scheduler
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success) {
      return Response.json({ error: auth.error }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const schedulerId = searchParams.get('schedulerId');
    if (!schedulerId) {
      return Response.json({ error: 'schedulerId required' }, { status: 400 });
    }
    const notifications = await prisma.notification.findMany({
      where: { schedulerId },
      orderBy: { createdAt: 'desc' },
    });
    return Response.json({ notifications });
  } catch (err) {
    console.error('GET notifications error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/notifications - create
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success) {
      return Response.json({ error: auth.error }, { status: 401 });
    }
    const body = await request.json();
    const { schedulerId, type, config, onSuccess, onFailure, onStart } = body;
    if (!schedulerId) return Response.json({ error: 'schedulerId required' }, { status: 400 });
    if (!['EMAIL', 'SLACK', 'WEBHOOK'].includes(type)) {
      return Response.json({ error: 'type must be EMAIL, SLACK, or WEBHOOK' }, { status: 400 });
    }

    const notification = await prisma.notification.create({
      data: {
        schedulerId,
        type,
        config: config || {},
        onSuccess: !!onSuccess,
        onFailure: onFailure !== false,
        onStart: !!onStart,
        status: 'ACTIVE',
      },
    });
    return Response.json({ notification }, { status: 201 });
  } catch (err) {
    console.error('POST notifications error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
