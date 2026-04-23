import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@runloop.io' },
    update: {},
    create: {
      email: 'admin@runloop.io',
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

  console.log('\n🎉 Seeding completed!');
  console.log('\nLogin credentials:');
  console.log('  Email: admin@runloop.io');
  console.log('  Password: admin123');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
