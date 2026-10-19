import 'dotenv/config';
import { chromium, expect, type Page } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { db } from '../src/lib/db';

async function main() {
  const origin = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
  if (
    !process.env.DATABASE_URL?.includes('127.0.0.1') ||
    !['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)
  )
    throw Error('Use an isolated local app and disposable database.');
  const suffix = randomUUID().slice(0, 8);
  const customerEmail = `rewards-browser-${suffix}@example.test`;
  const adminEmail = `rewards-admin-${suffix}@example.test`;
  const password = randomBytes(24).toString('hex');
  const userIds: string[] = [],
    productIds: string[] = [];
  const errors: string[] = [];
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  async function saved(page: Page, path: string, action: () => Promise<unknown>) {
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url() === origin + path && r.request().method() !== 'GET'),
      action(),
    ]);
    assert.equal(response.status(), 200, await response.text());
    await page.reload();
  }
  async function login(page: Page, email: string, admin = false) {
    await page.goto(origin + (admin ? '/admin/login' : '/account'));
    await page.waitForLoadState('networkidle');
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('heading', {
        name: admin ? 'Your studio, at a glance.' : 'Mila Rewards QA',
        exact: true,
      }),
    ).toBeVisible();
  }
  try {
    const passwordHash = await hash(password, 12);
    const admin = await db.user.create({
      data: { name: 'Rewards Admin QA', email: adminEmail, role: 'ADMIN', passwordHash },
    });
    userIds.push(admin.id);
    const user = await db.user.create({
      data: { name: 'Mila Rewards QA', email: customerEmail, passwordHash },
    });
    userIds.push(user.id);
    const customer = await db.customer.create({
      data: {
        userId: user.id,
        email: customerEmail,
        firstName: 'Mila',
        lastName: 'Rewards QA',
        phone: '+38970123456',
      },
    });
    for (const [name, price, image] of [
      ['Studio desk stand', 1000, 'headphones'],
      ['Little desk companion', 500, 'controller'],
    ] as const) {
      const p = await db.product.create({
        data: {
          name: `${name} ${suffix}`,
          slug: `${name.toLowerCase().replaceAll(' ', '-')}-${suffix}`,
          sku: `${name}-${suffix}`,
          shortDescription: 'A thoughtful print from the studio.',
          description: 'Browser verification fixture.',
          price,
          published: true,
          images: {
            create: {
              url: `/images/${image}.webp`,
              listingUrl: `/images/${image}.webp`,
              thumbnailUrl: `/images/${image}.webp`,
              filename: `qa-${suffix}-${image}`,
              altText: name,
              width: 1000,
              height: 1000,
              isPrimary: true,
            },
          },
        },
      });
      productIds.push(p.id);
    }
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const customerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    for (const context of [adminContext, customerContext])
      await context.addCookies([{ name: 'gx-locale', value: 'en', url: origin }]);
    const adminPage = await adminContext.newPage(),
      customerPage = await customerContext.newPage();
    for (const page of [adminPage, customerPage])
      page.on('pageerror', (error) => errors.push(`${page.url()}: ${error.message}`));
    await login(adminPage, adminEmail, true);
    await adminPage.goto(origin + '/admin/rewards');
    const giftForm = adminPage.locator('form').nth(1);
    await giftForm.locator('select[name="productId"]').selectOption(productIds[1]);
    await giftForm.getByLabel('Point cost', { exact: true }).fill('200');
    await saved(adminPage, '/api/admin/rewards/gifts', () =>
      giftForm.getByRole('button', { name: 'Add gift', exact: true }).click(),
    );
    await expect(
      adminPage.getByRole('heading', { name: `Little desk companion ${suffix}`, exact: true }),
    ).toBeVisible();
    await mkdir('test-results', { recursive: true });
    await adminPage.screenshot({ path: 'test-results/rewards-admin-desktop.png', fullPage: true });
    await adminPage.goto(origin + '/admin/customers/' + customer.id);
    await adminPage.getByLabel('Points to add or subtract').fill('500');
    await adminPage
      .getByLabel('Reason (visible to the customer)')
      .fill('Welcome to GrandX Rewards');
    await saved(adminPage, '/api/admin/rewards/adjust', () =>
      adminPage.getByRole('button', { name: 'Adjust points', exact: true }).click(),
    );
    assert.equal(
      (await db.rewardsAccount.findUniqueOrThrow({ where: { userId: user.id } })).balance,
      500,
    );
    await login(customerPage, customerEmail);
    const forbidden = await customerContext.request.post(origin + '/api/admin/rewards/settings', {
      headers: { Origin: origin },
      data: { enabled: false },
    });
    assert.ok([401, 403].includes(forbidden.status()));
    const crossOrigin = await adminContext.request.post(origin + '/api/admin/rewards/adjust', {
      headers: { Origin: 'https://untrusted.example' },
      data: {},
    });
    assert.equal(crossOrigin.status(), 403);
    const other = await customerContext.request.get(origin + '/admin/rewards', { maxRedirects: 0 });
    assert.ok([303, 307].includes(other.status()));
    await customerPage.goto(origin + '/rewards');
    await expect(customerPage.locator('.rewards-number').first()).toHaveText('500');
    await customerPage.screenshot({ path: 'test-results/rewards-desktop.png', fullPage: true });
    for (const width of [1280, 768, 390]) {
      await customerPage.setViewportSize({ width, height: 900 });
      assert.equal(
        await customerPage.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
        `Rewards overflow at ${width}px`,
      );
    }
    await customerPage.screenshot({ path: 'test-results/rewards-mobile.png' });
    await customerPage
      .getByRole('heading', { name: 'Your points history', exact: true })
      .scrollIntoViewIfNeeded();
    await customerPage.screenshot({ path: 'test-results/rewards-history-mobile.png' });
    await customerContext.addCookies([{ name: 'gx-locale', value: 'mk', url: origin }]);
    await customerPage.reload();
    await expect(
      customerPage.getByRole('heading', { name: 'Повеќе радост со секоја нарачка.' }),
    ).toBeVisible();
    await customerPage.screenshot({ path: 'test-results/rewards-mobile-mk.png' });
    await customerContext.addCookies([{ name: 'gx-locale', value: 'en', url: origin }]);
    const p = await db.product.findUniqueOrThrow({ where: { id: productIds[0] } });
    await customerPage.goto(origin + '/product/' + p.slug);
    await customerPage.getByRole('button', { name: 'Add to cart', exact: true }).click();
    await customerPage.getByRole('link', { name: 'Continue to checkout', exact: true }).click();
    await expect(
      customerPage.getByRole('heading', { name: 'Continue to checkout', exact: true }),
    ).toBeVisible();
    await customerPage.getByLabel('Points to use as a discount', { exact: true }).fill('100');
    const gift = await db.rewardGift.findUniqueOrThrow({ where: { productId: productIds[1] } });
    await customerPage
      .getByRole('combobox', { name: 'Add a printed gift', exact: true })
      .selectOption(gift.id);
    await expect(customerPage.getByText('Reward gift', { exact: true })).toBeVisible();
    assert.equal(
      await customerPage.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
      'Checkout overflows mobile',
    );
    await customerPage.screenshot({
      path: 'test-results/rewards-checkout-mobile.png',
      fullPage: true,
    });
    for (const [name, value] of Object.entries({
      firstName: 'Mila',
      lastName: 'Rewards QA',
      email: customerEmail,
      phone: '+38970123456',
      city: 'Skopje',
      postalCode: '1000',
      street: 'QA Street 1',
    }))
      await customerPage.locator(`input[name="${name}"]`).fill(value);
    await customerPage.locator('input[name="acceptTerms"]').check();
    await customerPage.getByRole('button', { name: 'Place order', exact: true }).click();
    await expect(
      customerPage.getByRole('heading', { name: 'Thank you for your order!' }),
    ).toBeVisible();
    const order = await db.order.findFirstOrThrow({ where: { customerId: customer.id } });
    assert.equal(order.rewardDiscount, 100);
    assert.equal(order.giftPoints, 200);
    assert.equal(order.pointsEarned, 45);
    await adminPage.goto(origin + '/admin/orders/' + order.id);
    for (const status of ['CONFIRMED', 'READY', 'SHIPPED', 'DELIVERED']) {
      await adminPage.locator('select[name="status"]').selectOption(status);
      await saved(adminPage, '/api/admin/orders/' + order.id, () =>
        adminPage.getByRole('button', { name: 'Save changes', exact: true }).click(),
      );
    }
    adminPage.once('dialog', (dialog) => dialog.accept());
    await saved(adminPage, `/api/admin/rewards/${order.id}/payment`, () =>
      adminPage.getByRole('button', { name: 'Confirm cash payment received', exact: true }).click(),
    );
    assert.equal(
      (await db.rewardsAccount.findUniqueOrThrow({ where: { userId: user.id } })).balance,
      245,
    );
    await adminPage.getByText('Record a return / refund', { exact: true }).click();
    await adminPage.getByLabel('Total product money refunded so far · MKD').fill('900');
    await adminPage.getByLabel('Reward gift has also been returned').check();
    await adminPage
      .getByLabel('Return reason', { exact: true })
      .fill('Full return including printed gift');
    await saved(adminPage, `/api/admin/rewards/${order.id}/return`, () =>
      adminPage
        .getByRole('button', { name: 'Record return and adjust points', exact: true })
        .click(),
    );
    assert.equal(
      (await db.rewardsAccount.findUniqueOrThrow({ where: { userId: user.id } })).balance,
      500,
    );
    await customerPage.goto(origin + '/rewards');
    await expect(customerPage.getByText('Points restored', { exact: true })).toBeVisible();
    await expect(customerPage.locator('.rewards-number').first()).toHaveText('500');
    assert.deepEqual(errors, []);
    await writeFile(
      'test-results/rewards-browser-report.json',
      JSON.stringify(
        {
          adminGiftSetup: true,
          bonusPoints: true,
          memberRedemption: true,
          paymentAndReturn: true,
          authorization: true,
          englishAndMacedonian: true,
          widths: [1440, 1280, 768, 390],
          errors,
        },
        null,
        2,
      ),
    );
    console.log(
      'Rewards browser checks passed: admin gift setup and bonus, customer discount + gift, payment, return, authorization, two languages, responsive layouts.',
    );
  } finally {
    await browser.close();
    await db.order.deleteMany({ where: { email: customerEmail } });
    await db.customer.deleteMany({ where: { email: customerEmail } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.product.deleteMany({ where: { id: { in: productIds } } });
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
