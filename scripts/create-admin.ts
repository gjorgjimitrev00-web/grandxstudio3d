import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { email, password } from '../src/lib/validation';
const db = new PrismaClient();
async function main() {
  const ui = createInterface({ input: stdin, output: stdout });
  const address = email.parse(process.env.ADMIN_EMAIL || (await ui.question('Admin email: ')));
  ui.close();
  let pass = process.env.ADMIN_PASSWORD;
  if (!pass) {
    if (!stdin.isTTY) throw Error('Set ADMIN_PASSWORD through a secret environment variable.');
    stdout.write('Admin password (hidden, at least 12 characters): ');
    stdin.setRawMode(true);
    stdin.resume();
    pass = await new Promise<string>((resolve, reject) => {
      let value = '';
      const listener = (data: Buffer) => {
        for (const ch of data.toString()) {
          if (ch === '\u0003') {
            stdin.off('data', listener);
            reject(Error('Cancelled'));
            return;
          }
          if (ch === '\r' || ch === '\n') {
            stdin.off('data', listener);
            resolve(value);
            return;
          }
          if (ch === '\u007f') value = value.slice(0, -1);
          else value += ch;
        }
      };
      stdin.on('data', listener);
    }).finally(() => {
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    });
  }
  password.parse(pass);
  if (await db.user.findUnique({ where: { email: address } }))
    throw Error('That user already exists; no privileges or password were changed.');
  await db.user.create({
    data: {
      email: address,
      name: 'Studio administrator',
      role: 'ADMIN',
      passwordHash: await hash(pass, 12),
    },
  });
  console.log('Administrator created.');
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
