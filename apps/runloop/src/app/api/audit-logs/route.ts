import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';
import { Prisma } from '@prisma/client';

// GET /api/audit-logs?projectId=X&action=&userId=&from=&to=&limit=50&offset=0
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success) {
      return Response.json({ error: auth.error }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const action = searchParams.get('action') || undefined;
    const userId = searchParams.get('userId') || undefined;
    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;
    const search = searchParams.get('search') || undefined;
    const limitParam = parseInt(searchParams.get('limit') || '50', 10);
    const offsetParam = parseInt(searchParams.get('offset') || '0', 10);

    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;
    const offset = Number.isFinite(offsetParam) ? Math.max(offsetParam, 0) : 0;

    if (!projectId) {
      return Response.json({ error: 'Project ID is required' }, { status: 400 });
    }

    // Project membership check
    const membership = await prisma.projectMember.findFirst({
      where: { projectId, userId: auth.userId },
    });
    if (!membership) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    const where: Prisma.AuditLogWhereInput = {
      projectId,
    };
    if (action) where.action = action;
    if (userId) where.userId = userId;
    if (from || to) {
      where.createdAt = {};
      if (from) {
        const d = new Date(from);
        if (!isNaN(d.getTime())) (where.createdAt as any).gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (!isNaN(d.getTime())) (where.createdAt as any).lte = d;
      }
    }
    if (search) {
      where.OR = [
        { action: { contains: search, mode: 'insensitive' } },
        { resource: { contains: search, mode: 'insensitive' } },
        { resourceId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, logs, distinctActionsRaw, distinctUsers] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          user: {
            select: { id: true, email: true, name: true },
          },
        },
      }),
      prisma.auditLog.findMany({
        where: { projectId },
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
      }),
      prisma.auditLog.findMany({
        where: { projectId, userId: { not: null } },
        distinct: ['userId'],
        select: {
          userId: true,
          user: { select: { id: true, email: true, name: true } },
        },
      }),
    ]);

    const distinctActions = distinctActionsRaw.map((r) => r.action);
    const distinctUserList = distinctUsers
      .filter((r) => r.user)
      .map((r) => ({ id: r.user!.id, email: r.user!.email, name: r.user!.name }));

    return Response.json({
      logs,
      total,
      limit,
      offset,
      filters: {
        actions: distinctActions,
        users: distinctUserList,
      },
    });
  } catch (err) {
    console.error('GET /api/audit-logs error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
