import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';

// PUT /api/projects/[id]/members/[userId] - Change role (OWNER only)
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const projectId = params.id;
    const targetUserId = params.userId;

    const body = await request.json();
    const { role } = body as { role?: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' };

    if (!role || !['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Caller must be an OWNER
    const callerMembership = await prisma.projectMember.findFirst({
      where: { projectId, userId: auth.userId },
    });

    if (!callerMembership || callerMembership.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Only project owners can change roles' },
        { status: 403 }
      );
    }

    // Can't change own role
    if (auth.userId === targetUserId) {
      return NextResponse.json(
        { error: "You can't change your own role" },
        { status: 400 }
      );
    }

    const target = await prisma.projectMember.findFirst({
      where: { projectId, userId: targetUserId },
    });

    if (!target) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    const updated = await prisma.projectMember.update({
      where: { id: target.id },
      data: { role },
      include: {
        user: { select: { id: true, email: true, name: true, avatar: true } },
      },
    });

    return NextResponse.json({
      member: {
        id: updated.id,
        userId: updated.userId,
        role: updated.role,
        joinedAt: updated.joinedAt,
        email: updated.user.email,
        name: updated.user.name,
        avatar: updated.user.avatar,
      },
    });
  } catch (error) {
    console.error('Update member role error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/[id]/members/[userId] - Remove a member (OWNER/ADMIN)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const projectId = params.id;
    const targetUserId = params.userId;

    // Caller must be OWNER or ADMIN
    const callerMembership = await prisma.projectMember.findFirst({
      where: { projectId, userId: auth.userId },
    });

    if (
      !callerMembership ||
      !['OWNER', 'ADMIN'].includes(callerMembership.role)
    ) {
      return NextResponse.json(
        { error: 'Only project owners and admins can remove members' },
        { status: 403 }
      );
    }

    // Can't remove self
    if (auth.userId === targetUserId) {
      return NextResponse.json(
        { error: "You can't remove yourself" },
        { status: 400 }
      );
    }

    const target = await prisma.projectMember.findFirst({
      where: { projectId, userId: targetUserId },
    });

    if (!target) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Prevent removing the last OWNER
    if (target.role === 'OWNER') {
      const ownerCount = await prisma.projectMember.count({
        where: { projectId, role: 'OWNER' },
      });
      if (ownerCount <= 1) {
        return NextResponse.json(
          { error: "Can't remove the last owner" },
          { status: 400 }
        );
      }
    }

    await prisma.projectMember.delete({
      where: { id: target.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Remove member error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
