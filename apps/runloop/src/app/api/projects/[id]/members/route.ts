import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';
import { Prisma } from '@prisma/client';

// GET /api/projects/[id]/members - List members for a project
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const projectId = params.id;

    // Verify caller is a member of this project
    const callerMembership = await prisma.projectMember.findFirst({
      where: { projectId, userId: auth.userId },
    });

    if (!callerMembership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const members = await prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: {
          select: { id: true, email: true, name: true, avatar: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return NextResponse.json({
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        email: m.user.email,
        name: m.user.name,
        avatar: m.user.avatar,
      })),
      callerRole: callerMembership.role,
    });
  } catch (error) {
    console.error('List members error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[id]/members - Invite user by email
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const projectId = params.id;
    const body = await request.json();
    const { email, role } = body as { email?: string; role?: 'ADMIN' | 'MEMBER' | 'VIEWER' };

    if (!email || !role) {
      return NextResponse.json(
        { error: 'Email and role are required' },
        { status: 400 }
      );
    }

    if (!['ADMIN', 'MEMBER', 'VIEWER'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Verify caller is OWNER or ADMIN
    const callerMembership = await prisma.projectMember.findFirst({
      where: {
        projectId,
        userId: auth.userId,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!callerMembership) {
      return NextResponse.json(
        { error: 'Only project owners and admins can invite members' },
        { status: 403 }
      );
    }

    // Look up invitee by email
    const invitee = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, email: true, name: true, avatar: true },
    });

    if (!invitee) {
      return NextResponse.json(
        { error: 'User not found — ask them to sign up first' },
        { status: 404 }
      );
    }

    // Check if already a member
    const existing = await prisma.projectMember.findFirst({
      where: { projectId, userId: invitee.id },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'User is already a member of this project' },
        { status: 409 }
      );
    }

    // Create membership
    const member = await prisma.projectMember.create({
      data: {
        projectId,
        userId: invitee.id,
        role,
      },
    });

    return NextResponse.json(
      {
        member: {
          id: member.id,
          userId: member.userId,
          role: member.role,
          joinedAt: member.joinedAt,
          email: invitee.email,
          name: invitee.name,
          avatar: invitee.avatar,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Invite member error:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return NextResponse.json(
          { error: 'User is already a member of this project' },
          { status: 409 }
        );
      }
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
