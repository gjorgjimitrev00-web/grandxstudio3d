import 'dotenv/config';
import { chromium, expect } from '@playwright/test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { db } from '../src/lib/db';

const origin = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
if (
  !process.env.DATABASE_URL?.includes('127.0.0.1') ||
  !['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)
)
  throw Error('Use an isolated local app and disposable MySQL database for browser tests.');
const suffix = randomUUID().slice(0, 8);
const name = `Chat visitor ${suffix}`;
const email = `chat-browser-${suffix}@example.test`;
const token = randomBytes(32).toString('hex');
const errors: string[] = [];
async function main() {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  let adminId = '';
  try {
    await mkdir('test-results/chat', { recursive: true });
    const user = await db.user.create({
      data: {
        email,
        name: 'Chat browser admin',
        role: 'ADMIN',
        passwordHash: 'unusable-test-password',
      },
    });
    adminId = user.id;
    await db.session.create({
      data: {
        userId: adminId,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await adminContext.addCookies([{ name: 'gx-session', value: token, url: origin }]);
    const admin = await adminContext.newPage();
    admin.on('pageerror', (error) => errors.push(error.message));
    await admin.goto(origin + '/admin/chat');
    await expect(admin.getByText('You’re available', { exact: true })).toBeVisible({
      timeout: 20000,
    });
    const customerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await customerContext.addCookies([{ name: 'gx-locale', value: 'en', url: origin }]);
    const customer = await customerContext.newPage();
    customer.on('pageerror', (error) => errors.push(error.message));
    await customer.goto(origin);
    await customer.getByRole('button', { name: 'Live chat', exact: true }).click();
    await expect(customer.getByText('The studio is online', { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await customer.getByRole('textbox', { name: 'Your name', exact: true }).fill(name);
    await customer
      .getByRole('dialog')
      .getByRole('textbox', { name: 'Email', exact: true })
      .fill(email);
    await customer
      .getByRole('textbox', { name: 'Your message', exact: true })
      .fill('Could you make a terracotta planter in a custom size?');
    await customer.locator('input[name="consent"]').check();
    await customer.screenshot({ path: 'test-results/chat/customer-desktop.png' });
    await customer.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(customer.locator('.chat-message p')).toHaveText(
      ['Could you make a terracotta planter in a custom size?'],
      { timeout: 15000 },
    );
    await admin.getByRole('button', { name: new RegExp(name) }).click({ timeout: 15000 });
    await expect(admin.locator('.chat-message p')).toHaveText(
      ['Could you make a terracotta planter in a custom size?'],
      { timeout: 15000 },
    );
    const reply = 'Absolutely! Send us the dimensions and we’ll help you choose a finish.';
    await admin.getByRole('textbox', { name: 'Reply to customer' }).fill(reply);
    await admin.getByRole('button', { name: 'Send reply' }).click();
    await expect(customer.locator('.chat-message p').last()).toHaveText(reply, { timeout: 15000 });
    await admin.screenshot({ path: 'test-results/chat/admin-desktop.png', fullPage: true });
    await customer.screenshot({ path: 'test-results/chat/customer-conversation.png' });

    // A network failure must preserve the draft and allow one successful retry.
    await customer.route('**/api/chat', async (route) => {
      if (
        route.request().method() === 'POST' &&
        !route.request().postData()?.includes('initialize')
      )
        return route.abort();
      await route.continue();
    });
    await customer
      .getByRole('textbox', { name: 'Your message', exact: true })
      .fill('A 15 cm diameter, please.');
    await customer.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(customer.getByRole('alert')).toBeVisible();
    await expect(customer.getByRole('textbox', { name: 'Your message', exact: true })).toHaveValue(
      'A 15 cm diameter, please.',
    );
    await customer.unroute('**/api/chat');
    await customer.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(customer.locator('.chat-message p').last()).toHaveText(
      'A 15 cm diameter, please.',
    );
    await expect(admin.locator('.chat-message p').last()).toHaveText('A 15 cm diameter, please.', {
      timeout: 15000,
    });
    await admin.getByRole('button', { name: 'Resolve', exact: true }).click();
    await expect(
      customer.getByText('This conversation is resolved. Send a message to reopen it.'),
    ).toBeVisible({ timeout: 15000 });
    await customer
      .getByRole('textbox', { name: 'Your message', exact: true })
      .fill('<img src=x onerror=alert(1)>');
    await customer.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(customer.locator('.chat-message p').last()).toHaveText(
      '<img src=x onerror=alert(1)>',
    );
    await expect(customer.locator('.chat-message img')).toHaveCount(0);
    await expect(admin.getByRole('button', { name: 'Resolve', exact: true })).toBeVisible({
      timeout: 15000,
    });
    await customer.reload();
    await customer.getByRole('button', { name: 'Live chat', exact: true }).click();
    await expect(customer.locator('.chat-message p')).toHaveCount(4, { timeout: 15000 });
    await customer.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        customer
          .locator('.chat-window')
          .evaluate((el) => el.getBoundingClientRect().right <= window.innerWidth),
      )
      .toBe(true);
    await customer.screenshot({ path: 'test-results/chat/customer-mobile.png' });
    await customer.getByRole('button', { name: 'Close chat', exact: true }).press('Escape');
    await expect(customer.getByRole('dialog')).toHaveCount(0);
    await expect(customer.getByRole('button', { name: 'Live chat', exact: true })).toBeFocused();
    await admin.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() => admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await admin.screenshot({ path: 'test-results/chat/admin-mobile.png', fullPage: true });
    await admin.getByRole('checkbox', { name: /You’re available/ }).uncheck();
    await expect(admin.getByText('You’re away', { exact: true })).toBeVisible({ timeout: 10000 });

    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const mobile = await mobileContext.newPage();
    mobile.on('pageerror', (error) => errors.push(error.message));
    await mobile.goto(origin);
    await mobile.getByRole('button', { name: 'Разговор во живо', exact: true }).click();
    await expect(mobile.getByText('Оставете ни порака', { exact: true })).toBeVisible();
    await expect(mobile.getByRole('textbox', { name: 'Вашето име', exact: true })).toBeVisible();
    await expect(mobile.locator('.chat-message')).toHaveCount(0);
    await mobile.screenshot({ path: 'test-results/chat/customer-mobile-mk.png' });
    expect(errors).toEqual([]);
    console.log(
      'Chat browser checks passed: two-way delivery, retry, resolve/reopen, privacy, reload, mobile EN/MK and no JavaScript errors.',
    );
  } finally {
    await browser.close();
    await db.chatConversation.deleteMany({ where: { email } });
    if (adminId) await db.user.deleteMany({ where: { id: adminId } });
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
