import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { email, password } from '../src/lib/validation';
const db = new PrismaClient();
async function main() {
  const address = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const pass = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!address && !pass) {
    console.log(
      'Admin bootstrap skipped: BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are missing or empty in the build environment. Set both and redeploy to create the first administrator.',
    );
    return;
  }
  if (!address) throw Error('Admin bootstrap failed: BOOTSTRAP_ADMIN_EMAIL is missing or empty.');
  if (!pass) throw Error('Admin bootstrap failed: BOOTSTRAP_ADMIN_PASSWORD is missing or empty.');
  email.parse(address);
  password.parse(pass);
  if (await db.user.count({ where: { role: 'ADMIN' } })) {
    console.log(
      'An administrator already exists. Bootstrap skipped. Remove bootstrap environment variables.',
    );
    return;
  }
  await db.user.create({
    data: {
      email: address.toLowerCase(),
      name: 'Studio administrator',
      role: 'ADMIN',
      passwordHash: await hash(pass, 12),
    },
  });
  console.log('First administrator created. Remove bootstrap environment variables now.');
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
