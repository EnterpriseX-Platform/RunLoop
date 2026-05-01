import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Strong-ish random password for the seeded admin. Override with
// SEED_ADMIN_PASSWORD when you want a known value (e.g. CI). The plaintext
// is printed once at the end so the operator can capture it.
function generatePassword(): string {
  // 18 chars from a URL-safe alphabet ≈ 108 bits of entropy.
  return crypto.randomBytes(13).toString('base64url');
}

async function main() {
  console.log('🌱 Seeding database...');

  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@runloop.local';
  const plaintextPassword = process.env.SEED_ADMIN_PASSWORD || generatePassword();
  const adminPassword = await bcrypt.hash(plaintextPassword, 10);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: 'Admin User',
      password: adminPassword,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });

  console.log('✅ Admin user created:', admin.email);

  // Create demo project
  const project = await prisma.project.upsert({
    where: { id: 'demo-project' },
    update: {},
    create: {
      id: 'demo-project',
      name: 'Demo Project',
      description: 'A demo project to get you started',
      color: 'cyan',
      createdBy: admin.id,
      members: {
        create: {
          userId: admin.id,
          role: 'OWNER',
        },
      },
    },
  });

  console.log('✅ Demo project created:', project.name);

  // Create sample scheduler
  const scheduler = await prisma.scheduler.upsert({
    where: { id: 'demo-scheduler' },
    update: {},
    create: {
      id: 'demo-scheduler',
      name: 'Demo HTTP Scheduler',
      description: 'A sample HTTP scheduler',
      type: 'HTTP',
      config: JSON.stringify({
        url: 'https://httpbin.org/get',
        method: 'GET',
        headers: {},
      }),
      schedule: '0 */6 * * *',
      timezone: 'Asia/Bangkok',
      status: 'INACTIVE',
      projectId: project.id,
      createdBy: admin.id,
    },
  });

  console.log('✅ Demo scheduler created:', scheduler.name);

  // Hand off to the template seeder so a fresh checkout has the n8n-style
  // catalog visible in the flow editor without an extra command.
  try {
    await import('./seed-node-templates');
  } catch (err) {
    console.warn('⚠️  Could not seed node templates:', err instanceof Error ? err.message : err);
  }

  console.log('\n🎉 Seeding completed!');
  console.log('\nLogin credentials (shown once — store securely):');
  console.log(`  Email:    ${adminEmail}`);
  console.log(`  Password: ${plaintextPassword}`);
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log('\n  (Password was auto-generated. Set SEED_ADMIN_PASSWORD env var');
    console.log('   before re-seeding to keep a known value.)');
  }
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
