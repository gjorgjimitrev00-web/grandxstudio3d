import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { hash } from 'bcryptjs';
import { writeFile } from 'node:fs/promises';
const db = new PrismaClient();
async function main() {
  if (process.env.NODE_ENV === 'production' || !process.env.DATABASE_URL?.includes('127.0.0.1'))
    throw Error('This helper is only for the local development preview.');
  const email = `studio-${randomBytes(4).toString('hex')}@grandxstudio.test`;
  const password = randomBytes(18).toString('base64url');
  await db.user.create({
    data: {
      email,
      name: 'Studio owner · local preview',
      role: 'ADMIN',
      passwordHash: await hash(password, 12),
    },
  });
  await writeFile(
    'LOCAL-ACCESS.txt',
    `GrandXStudio local development preview only\n\nStore: http://127.0.0.1:3000\nAdmin: http://127.0.0.1:3000/admin/login\nEmail: ${email}\nPassword: ${password}\n\nThese random credentials exist only in your local database. This file is ignored by Git. Use the documented first-admin setup for Hostinger.\n`,
    { mode: 0o600, flag: 'wx' },
  );
  console.log('Local preview administrator created. See the ignored LOCAL-ACCESS.txt file.');
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
