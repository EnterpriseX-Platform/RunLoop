import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get project IDs for user
    const userProjects = await prisma.projectMember.findMany({
      where: { userId: user.userId },
      select: { projectId: true },
    });

    const projectIds = userProjects.map((p) => p.projectId);

    // Get counts
    const [totalProjects, totalRunloops, totalExecutions, successExecutions] = await Promise.all([
      prisma.project.count({
        where: { id: { in: projectIds }, status: 'ACTIVE' },
      }),
      prisma.scheduler.count({
        where: { projectId: { in: projectIds }, status: { not: 'INACTIVE' } },
      }),
      prisma.execution.count({
        where: { projectId: { in: projectIds } },
      }),
      prisma.execution.count({
        where: { projectId: { in: projectIds }, status: 'SUCCESS' },
      }),
    ]);

    // Get recent executions. schedulerId is a loose identifier (not a FK),
    // so we look up the scheduler record separately.
    const recentExecutions = await prisma.execution.findMany({
      where: { projectId: { in: projectIds } },
      orderBy: { startedAt: 'desc' },
      take: 5,
    });

    const schedulerIds = Array.from(new Set(recentExecutions.map((e) => e.schedulerId).filter((id): id is string => !!id)));
    const schedulers = schedulerIds.length > 0
      ? await prisma.scheduler.findMany({
          where: { id: { in: schedulerIds } },
          select: { id: true, name: true },
        })
      : [];
    const schedulerById = new Map(schedulers.map((s) => [s.id, s]));

    const mappedExecutions = recentExecutions.map((e) => ({
      ...e,
      runloop: schedulerById.get(e.schedulerId) ?? null,
    }));

    // Get upcoming runloops
    const upcomingRunloops = await prisma.scheduler.findMany({
      where: {
        projectId: { in: projectIds },
        status: 'ACTIVE',
        nextRunAt: { not: null },
      },
      orderBy: { nextRunAt: 'asc' },
      take: 5,
    });

    const successRate = totalExecutions > 0
      ? (successExecutions / totalExecutions) * 100
      : 0;

    return NextResponse.json({
      totalProjects,
      totalRunloops,
      totalExecutions,
      successRate,
      recentExecutions: mappedExecutions,
      upcomingRunloops,
    });
  } catch (error) {
    console.error('Dashboard metrics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
