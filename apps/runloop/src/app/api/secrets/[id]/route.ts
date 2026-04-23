import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encrypt, decrypt, maskSecret, validateSecretName } from '@/lib/encryption';
import { authenticateRequest } from '@/lib/auth';
import { logAuditFromRequest } from '@/lib/audit';
import { Prisma } from '@prisma/client';

// GET /api/secrets/[id] - Get a specific secret
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success) {
      return Response.json({ error: auth.error }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const includeValue = searchParams.get('includeValue') === 'true';
    const schedulerId = searchParams.get('schedulerId'); // For access validation

    const secret = await prisma.secret.findUnique({
      where: { id: params.id },
    });

    if (!secret) {
      return Response.json({ error: 'Secret not found' }, { status: 404 });
    }

    // Check project access
    const membership = await prisma.projectMember.findFirst({
      where: {
        projectId: secret.projectId,
        userId: auth.userId,
      },
    });

    if (!membership) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check restricted access
    if (secret.accessLevel === 'RESTRICTED' && schedulerId) {
      if (!secret.allowedSchedulers.includes(schedulerId)) {
        return Response.json(
          { error: 'Secret is not accessible by this scheduler' },
          { status: 403 }
        );
      }
    }

    // Log access
    await prisma.secretAccessLog.create({
      data: {
        secretId: secret.id,
        secretName: secret.name,
        accessedBy: auth.userId!,
        schedulerId: schedulerId || null,
        action: 'READ',
        success: true,
      },
    });

    // Update last used
    await prisma.secret.update({
      where: { id: params.id },
      data: {
        lastUsedAt: new Date(),
        useCount: { increment: 1 },
      },
    });

    const response: any = {
      id: secret.id,
      name: secret.name,
      description: secret.description,
      category: secret.category,
      tags: secret.tags,
      scope: secret.scope,
      accessLevel: secret.accessLevel,
      allowedSchedulers: secret.allowedSchedulers,
      lastUsedAt: secret.lastUsedAt,
      useCount: secret.useCount,
      createdAt: secret.createdAt,
      updatedAt: secret.updatedAt,
      expiresAt: secret.expiresAt,
      createdBy: secret.createdBy,
    };

    // Include decrypted value if requested (admin only)
    if (includeValue) {
      if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
        return Response.json(
          { error: 'Only admins can view secret values' },
          { status: 403 }
        );
      }

      try {
        const decryptedValue = decrypt({
          encrypted: secret.value,
          iv: secret.iv,
          tag: secret.authTag,
        });
        response.value = decryptedValue;
        response.maskedValue = maskSecret(decryptedValue, 4);
      } catch (error) {
        return Response.json(
          { error: 'Failed to decrypt secret value' },
          { status: 500 }
        );
      }
    } else {
      response.maskedValue = maskSecret(secret.value, 4);
    }

    return Response.json({ secret: response });
  } catch (error) {
    console.error('Get secret error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/secrets/[id] - Update a secret
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success) {
      return Response.json({ error: auth.error }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      value,
      description,
      category,
      tags,
      scope,
      accessLevel,
      allowedSchedulers,
      expiresAt,
    } = body;

    const secret = await prisma.secret.findUnique({
      where: { id: params.id },
    });

    if (!secret) {
      return Response.json({ error: 'Secret not found' }, { status: 404 });
    }

    // Check project access (admin only)
    const membership = await prisma.projectMember.findFirst({
      where: {
        projectId: secret.projectId,
        userId: auth.userId,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!membership) {
      return Response.json(
        { error: 'Only project owners and admins can update secrets' },
        { status: 403 }
      );
    }

    // Validate name if provided
    if (name && !validateSecretName(name)) {
      return Response.json(
        { error: 'Name must be uppercase alphanumeric with underscores, starting with letter' },
        { status: 400 }
      );
    }

    // Prepare update data
    const updateData: Prisma.SecretUpdateInput = {
      description,
      category,
      tags,
      scope: scope as any,
      accessLevel: accessLevel as any,
      allowedSchedulers,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    };

    // Update name if changed
    if (name && name !== secret.name) {
      updateData.name = name;
    }

    // Update value if provided (create new encryption)
    if (value) {
      const encrypted = encrypt(value);
      updateData.value = encrypted.encrypted;
      updateData.iv = encrypted.iv;
      updateData.authTag = encrypted.tag;
      updateData.rotatedFrom = secret.id;
    }

    const updated = await prisma.secret.update({
      where: { id: params.id },
      data: updateData,
    });

    // Log update
    await prisma.secretAccessLog.create({
      data: {
        secretId: secret.id,
        secretName: secret.name,
        accessedBy: auth.userId!,
        action: 'UPDATE',
        success: true,
      },
    });

    // Audit log
    await logAuditFromRequest(request, auth.userId, {
      projectId: secret.projectId,
      action: 'secret.updated',
      resource: 'secret',
      resourceId: secret.id,
      oldValue: {
        name: secret.name,
        category: secret.category,
        scope: secret.scope,
        accessLevel: secret.accessLevel,
      },
      newValue: {
        name: updated.name,
        category: updated.category,
        scope: updated.scope,
        accessLevel: updated.accessLevel,
        rotated: !!value,
      },
    });

    return Response.json({
      secret: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        category: updated.category,
        tags: updated.tags,
        scope: updated.scope,
        accessLevel: updated.accessLevel,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    console.error('Update secret error:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return Response.json(
          { error: 'Secret with this name already exists' },
          { status: 409 }
        );
      }
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/secrets/[id] - Delete a specific secret
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success) {
      return Response.json({ error: auth.error }, { status: 401 });
    }

    const secret = await prisma.secret.findUnique({
      where: { id: params.id },
    });

    if (!secret) {
      return Response.json({ error: 'Secret not found' }, { status: 404 });
    }

    // Check project access (admin only)
    const membership = await prisma.projectMember.findFirst({
      where: {
        projectId: secret.projectId,
        userId: auth.userId,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!membership) {
      return Response.json(
        { error: 'Only project owners and admins can delete secrets' },
        { status: 403 }
      );
    }

    // Log deletion before deleting
    await prisma.secretAccessLog.create({
      data: {
        secretId: secret.id,
        secretName: secret.name,
        accessedBy: auth.userId!,
        action: 'DELETE',
        success: true,
      },
    });

    await prisma.secret.delete({
      where: { id: params.id },
    });

    // Audit log
    await logAuditFromRequest(request, auth.userId, {
      projectId: secret.projectId,
      action: 'secret.deleted',
      resource: 'secret',
      resourceId: secret.id,
      details: { name: secret.name },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Delete secret error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
