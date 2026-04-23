import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encrypt, decrypt, maskSecret, validateSecretName } from '@/lib/encryption';
import { authenticateRequest, getCurrentUser } from '@/lib/auth';
import { logAuditFromRequest } from '@/lib/audit';
import { Prisma } from '@prisma/client';

// GET /api/secrets - List all secrets for a project
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success) {
      return Response.json({ error: auth.error }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const category = searchParams.get('category');
    const scope = searchParams.get('scope');
    const includeValues = searchParams.get('includeValues') === 'true';

    if (!projectId) {
      return Response.json({ error: 'Project ID is required' }, { status: 400 });
    }

    // Check project access
    const membership = await prisma.projectMember.findFirst({
      where: {
        projectId,
        userId: auth.userId,
      },
    });

    if (!membership) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    const where: Prisma.SecretWhereInput = {
      projectId,
    };

    if (category) {
      where.category = category;
    }

    if (scope) {
      where.scope = scope as any;
    }

    const secrets = await prisma.secret.findMany({
      where,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        tags: true,
        scope: true,
        accessLevel: true,
        allowedSchedulers: true,
        lastUsedAt: true,
        useCount: true,
        createdAt: true,
        updatedAt: true,
        createdBy: true,
        expiresAt: true,
        // Never include encrypted value or IV in listing
        ...(includeValues && { value: true, iv: true }),
      },
    });

    // Mask values if included
    const sanitizedSecrets = secrets.map((secret: any) => ({
      ...secret,
      value: secret.value ? maskSecret(decrypt({ encrypted: secret.value, iv: secret.iv, tag: (secret as any).authTag ?? '' }), 4) : null,
      iv: undefined, // Never expose IV
    }));

    return Response.json({ secrets: sanitizedSecrets });
  } catch (error) {
    console.error('List secrets error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/secrets - Create a new secret
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success) {
      return Response.json({ error: auth.error }, { status: 401 });
    }

    const body = await request.json();
    const {
      projectId,
      name,
      value,
      description,
      category,
      tags,
      scope = 'PROJECT',
      accessLevel = 'ALL',
      allowedSchedulers = [],
      expiresAt,
    } = body;

    // Validation
    if (!projectId || !name || !value) {
      return Response.json(
        { error: 'Project ID, name, and value are required' },
        { status: 400 }
      );
    }

    if (!validateSecretName(name)) {
      return Response.json(
        { error: 'Name must be uppercase alphanumeric with underscores, starting with letter' },
        { status: 400 }
      );
    }

    // Check project access (admin only for secrets)
    const membership = await prisma.projectMember.findFirst({
      where: {
        projectId,
        userId: auth.userId,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!membership) {
      return Response.json(
        { error: 'Only project owners and admins can manage secrets' },
        { status: 403 }
      );
    }

    // Encrypt the value
    const encrypted = encrypt(value);

    // Create secret
    const secret = await prisma.secret.create({
      data: {
        projectId,
        name,
        value: encrypted.encrypted,
        iv: encrypted.iv,
        authTag: encrypted.tag,
        description,
        category,
        tags: tags || [],
        scope: scope as any,
        accessLevel: accessLevel as any,
        allowedSchedulers,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdBy: auth.userId!,
      },
    });

    // Log access
    await prisma.secretAccessLog.create({
      data: {
        secretId: secret.id,
        secretName: secret.name,
        accessedBy: auth.userId!,
        action: 'CREATE',
        success: true,
      },
    });

    // Audit log
    await logAuditFromRequest(request, auth.userId, {
      projectId,
      action: 'secret.created',
      resource: 'secret',
      resourceId: secret.id,
      details: {
        name: secret.name,
        category: secret.category,
        scope: secret.scope,
        accessLevel: secret.accessLevel,
      },
    });

    return Response.json({
      secret: {
        id: secret.id,
        name: secret.name,
        description: secret.description,
        category: secret.category,
        tags: secret.tags,
        scope: secret.scope,
        accessLevel: secret.accessLevel,
        createdAt: secret.createdAt,
      },
    });
  } catch (error) {
    console.error('Create secret error:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return Response.json(
          { error: 'Secret with this name already exists in the project' },
          { status: 409 }
        );
      }
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/secrets - Bulk delete secrets
export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success) {
      return Response.json({ error: auth.error }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const ids = searchParams.get('ids')?.split(',') || [];
    const projectId = searchParams.get('projectId');

    if (ids.length === 0 || !projectId) {
      return Response.json(
        { error: 'Secret IDs and project ID are required' },
        { status: 400 }
      );
    }

    // Check project access
    const membership = await prisma.projectMember.findFirst({
      where: {
        projectId,
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

    // Log deletions before deleting
    const secrets = await prisma.secret.findMany({
      where: { id: { in: ids }, projectId },
    });

    for (const secret of secrets) {
      await prisma.secretAccessLog.create({
        data: {
          secretId: secret.id,
          secretName: secret.name,
          accessedBy: auth.userId!,
          action: 'DELETE',
          success: true,
        },
      });
    }

    // Delete secrets
    await prisma.secret.deleteMany({
      where: {
        id: { in: ids },
        projectId,
      },
    });

    // Audit log (one entry per deleted secret)
    for (const secret of secrets) {
      await logAuditFromRequest(request, auth.userId, {
        projectId,
        action: 'secret.deleted',
        resource: 'secret',
        resourceId: secret.id,
        details: { name: secret.name },
      });
    }

    return Response.json({ deleted: ids.length });
  } catch (error) {
    console.error('Delete secrets error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
