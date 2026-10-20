import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);

if (args.length > 1 || (args.length === 1 && args[0] !== '--deploy')) {
  console.error('Usage: node scripts/build.mjs [--deploy]');
  process.exit(1);
}

// Set these before starting Node/Rust tools, not inside next.config.ts:
// native libraries can initialize their thread pools before Next loads config.
const env = {
  ...process.env,
  TOKIO_WORKER_THREADS: '1',
  RAYON_NUM_THREADS: '1',
  UV_THREADPOOL_SIZE: '1',
};
const prismaManifest = require.resolve('prisma/package.json');
const prismaCli = resolve(dirname(prismaManifest), require(prismaManifest).bin.prisma);

function run(label, cli, cliArgs) {
  console.log(`\n${label}`);
  const result = spawnSync(process.execPath, [cli, ...cliArgs], {
    cwd: root,
    env,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`${label} could not start: ${result.error.message}`);
  } else if (result.signal) {
    console.error(`${label} was terminated by ${result.signal}.`);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('Build thread limits: Tokio=1, Rayon=1, libuv=1; Next.js page workers=1.');

if (args[0] === '--deploy') {
  run('Applying database migrations', prismaCli, ['migrate', 'deploy']);
  run('Checking first-admin bootstrap', require.resolve('tsx/cli'), ['scripts/bootstrap.ts']);
}

run('Generating Prisma Client', prismaCli, ['generate']);
run('Building Next.js with Webpack', require.resolve('next/dist/bin/next'), ['build', '--webpack']);
