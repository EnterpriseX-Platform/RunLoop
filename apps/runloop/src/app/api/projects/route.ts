import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, SKIP_AUTH, DEV_USER } from '@/lib/auth';

// Ensure dev user exists in database
async function ensureDevUser() {
  if (!SKIP_AUTH) return;
  
  await prisma.user.upsert({
    where: { id: DEV_USER.userId },
    update: {},
    create: {
      id: DEV_USER.userId,
      email: DEV_USER.email,
      name: 'Developer',
      password: 'dev-password-not-used',
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });
}

// GET /api/projects - List all projects
export async function GET(request: NextRequest) {
  try {
    await ensureDevUser();
    
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const projects = await prisma.project.findMany({
      where: {
        status: 'ACTIVE',
        members: {
          some: {
            userId: user.userId,
          },
        },
      },
      include: {
        _count: {
          select: {
            schedulers: true,
            members: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Map _count.schedulers to _count.runloops for frontend compatibility
    const mappedProjects = projects.map((p: Record<string, unknown> & { _count?: { schedulers: number; members: number } }) => ({
      ...p,
      _count: {
        runloops: p._count?.schedulers || 0,
        members: p._count?.members || 0,
      },
    }));

    return NextResponse.json({ projects: mappedProjects });
  } catch (error) {
    console.error('List projects error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects - Create new project
export async function POST(request: NextRequest) {
  try {
    await ensureDevUser();
    
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, color } = body;

    if (!name) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }

    const project = await prisma.project.create({
      data: {
        name,
        description,
        color: color || 'cyan',
        createdBy: user.userId,
        members: {
          create: {
            userId: user.userId,
            role: 'OWNER',
          },
        },
      },
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error('Create project error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
