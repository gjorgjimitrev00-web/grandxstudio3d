import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function bootstrap(email = '', password = '') {
  return spawnSync(process.execPath, ['--import', 'tsx', 'scripts/bootstrap.ts'], {
    encoding: 'utf8',
    timeout: 15000,
    env: {
      ...process.env,
      // The config-only paths must complete without connecting to a database.
      DATABASE_URL: 'mysql://unused:unused@127.0.0.1:1/bootstrap_test',
      BOOTSTRAP_ADMIN_EMAIL: email,
      BOOTSTRAP_ADMIN_PASSWORD: password,
    },
  });
}

test('bootstrap explains missing credentials while allowing routine deployments', () => {
  const result = bootstrap();
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Admin bootstrap skipped/);
  assert.match(result.stdout, /BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD/);
  assert.match(result.stdout, /build environment/);
});

test('bootstrap identifies a missing password without logging the email', () => {
  const email = 'bootstrap-test@example.test';
  const result = bootstrap(email);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /BOOTSTRAP_ADMIN_PASSWORD is missing or empty/);
  assert.equal((result.stdout + result.stderr).includes(email), false);
});

test('bootstrap identifies a missing email without logging the password', () => {
  const password = 'bootstrap-test-private-value';
  const result = bootstrap('', password);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /BOOTSTRAP_ADMIN_EMAIL is missing or empty/);
  assert.equal((result.stdout + result.stderr).includes(password), false);
});
