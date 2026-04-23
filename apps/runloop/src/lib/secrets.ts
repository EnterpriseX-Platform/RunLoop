/**
 * Secret resolution service for execution runtime
 * Resolves ${{secrets.NAME}} placeholders in configurations
 */

import { prisma } from './prisma';
import { decrypt } from './encryption';

interface SecretResolutionOptions {
  projectId: string;
  schedulerId?: string;
  executionId?: string;
}

interface ResolutionResult {
  value: string;
  secretId: string;
  secretName: string;
}

/**
 * Resolve a secret by name
 */
export async function resolveSecret(
  name: string,
  options: SecretResolutionOptions
): Promise<ResolutionResult | null> {
  const { projectId, schedulerId, executionId } = options;

  // Find secret by name in project
  const secret = await prisma.secret.findFirst({
    where: {
      projectId,
      name,
    },
  });

  if (!secret) {
    // Try global scope
    const globalSecret = await prisma.secret.findFirst({
      where: {
        name,
        scope: 'GLOBAL',
      },
    });

    if (!globalSecret) {
      return null;
    }

    // Check restricted access
    if (globalSecret.accessLevel === 'RESTRICTED' && schedulerId) {
      if (!globalSecret.allowedSchedulers.includes(schedulerId)) {
        throw new Error(`Secret '${name}' is not accessible by this scheduler`);
      }
    }

    // Decrypt and return
    const decryptedValue = decrypt({
      encrypted: globalSecret.value,
      iv: globalSecret.iv,
      tag: globalSecret.authTag,
    });

    // Log access
    await logSecretAccess(globalSecret.id, globalSecret.name, {
      accessedBy: 'SYSTEM',
      executionId,
      schedulerId,
      action: 'READ',
    });

    return {
      value: decryptedValue,
      secretId: globalSecret.id,
      secretName: globalSecret.name,
    };
  }

  // Check restricted access
  if (secret.accessLevel === 'RESTRICTED' && schedulerId) {
    if (!secret.allowedSchedulers.includes(schedulerId)) {
      throw new Error(`Secret '${name}' is not accessible by this scheduler`);
    }
  }

  // Check expiration
  if (secret.expiresAt && new Date() > secret.expiresAt) {
    throw new Error(`Secret '${name}' has expired`);
  }

  // Decrypt value
  const decryptedValue = decrypt({
    encrypted: secret.value,
    iv: secret.iv,
    tag: secret.authTag,
  });

  // Log access
  await logSecretAccess(secret.id, secret.name, {
    accessedBy: 'SYSTEM',
    executionId,
    schedulerId,
    action: 'READ',
  });

  // Update last used
  await prisma.secret.update({
    where: { id: secret.id },
    data: {
      lastUsedAt: new Date(),
      useCount: { increment: 1 },
    },
  });

  return {
    value: decryptedValue,
    secretId: secret.id,
    secretName: secret.name,
  };
}

/**
 * Resolve all secrets in a configuration object
 * Replaces ${{secrets.NAME}} with actual values
 */
export async function resolveSecretsInConfig(
  config: Record<string, any>,
  options: SecretResolutionOptions
): Promise<Record<string, any>> {
  const resolved = { ...config };
  const secretPattern = /\$\{\{secrets\.(\w+)\}\}/g;

  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === 'string') {
      let match;
      let resolvedValue = value;
      
      // Find all secret references
      while ((match = secretPattern.exec(value)) !== null) {
        const secretName = match[1];
        const secret = await resolveSecret(secretName, options);
        
        if (!secret) {
          throw new Error(`Secret '${secretName}' not found`);
        }
        
        resolvedValue = resolvedValue.replace(match[0], secret.value);
      }
      
      resolved[key] = resolvedValue;
    } else if (typeof value === 'object' && value !== null) {
      // Recursively resolve nested objects
      resolved[key] = await resolveSecretsInConfig(value, options);
    }
  }

  return resolved;
}

/**
 * Log secret access
 */
async function logSecretAccess(
  secretId: string,
  secretName: string,
  data: {
    accessedBy: string;
    executionId?: string;
    schedulerId?: string;
    action: any;
    errorMessage?: string;
  }
) {
  try {
    await prisma.secretAccessLog.create({
      data: {
        secretId,
        secretName,
        ...data,
        success: !data.errorMessage,
      },
    });
  } catch (error) {
    // Don't fail execution if logging fails
    console.error('Failed to log secret access:', error);
  }
}

/**
 * Get all accessible secrets for a scheduler
 */
export async function getAccessibleSecrets(
  projectId: string,
  schedulerId?: string
): Promise<string[]> {
  const secrets = await prisma.secret.findMany({
    where: {
      projectId,
      OR: [
        { accessLevel: 'ALL' },
        {
          accessLevel: 'RESTRICTED',
          allowedSchedulers: { has: schedulerId },
        },
      ],
    },
    select: { name: true },
  });

  return secrets.map((s) => s.name);
}

/**
 * Validate that all secrets in config exist and are accessible
 */
export async function validateSecretsInConfig(
  config: Record<string, any>,
  options: SecretResolutionOptions
): Promise<{ valid: boolean; missing: string[] }> {
  const secretPattern = /\$\{\{secrets\.(\w+)\}\}/g;
  const missing: string[] = [];
  const checked = new Set<string>();

  const checkValue = async (value: any) => {
    if (typeof value === 'string') {
      let match;
      while ((match = secretPattern.exec(value)) !== null) {
        const secretName = match[1];
        
        if (checked.has(secretName)) continue;
        checked.add(secretName);
        
        try {
          const secret = await resolveSecret(secretName, options);
          if (!secret) {
            missing.push(secretName);
          }
        } catch (error) {
          missing.push(secretName);
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      for (const v of Object.values(value)) {
        await checkValue(v);
      }
    }
  };

  await checkValue(config);

  return {
    valid: missing.length === 0,
    missing,
  };
}
