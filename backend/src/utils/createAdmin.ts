/**
 * One-off script to create or update an admin user.
 * Usage: npx ts-node src/utils/createAdmin.ts
 *
 * Override defaults with env vars:
 *   ADMIN_EMAIL=admin@yourapp.com ADMIN_PASSWORD=secret ADMIN_NAME="Admin" npx ts-node src/utils/createAdmin.ts
 */
import prisma from './prisma';
import bcrypt from 'bcryptjs';

async function createAdmin() {
  const email    = process.env.ADMIN_EMAIL    || 'admin@example.com';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const name     = process.env.ADMIN_NAME     || 'Admin';

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, name, role: 'ADMIN' },
    create: { email, passwordHash, name, role: 'ADMIN' },
    select: { id: true, email: true, name: true, role: true },
  });

  console.log('✅ Admin user ready:', user);
  await prisma.$disconnect();
}

createAdmin().catch((e) => { console.error(e); process.exit(1); });
