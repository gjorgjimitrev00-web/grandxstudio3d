import 'dotenv/config';
import { chromium } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { db } from '../src/lib/db';
import { mkdir, writeFile } from 'node:fs/promises';
async function main() {
  const origin = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
  const suffix = randomUUID().slice(0, 8),
    email = `browser-${suffix}@example.test`,
    password = randomBytes(24).toString('hex');
  if (!process.env.DATABASE_URL?.includes('127.0.0.1') && !process.env.TEST_DATABASE_CONFIRMED)
    throw Error('Use a disposable test database.');
  const user = await db.user.create({
    data: { email, name: 'Browser QA', role: 'ADMIN', passwordHash: await hash(password, 12) },
  });
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : process.platform === 'darwin'
        ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
        : {}),
    headless: true,
  });
  const errors: string[] = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addCookies([{ name: 'gx-locale', value: 'en', url: origin }]);
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(origin, { waitUntil: 'networkidle' });
    await mkdir('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/home-desktop.png', fullPage: true });
    await page.getByRole('link', { name: 'Shop', exact: true }).first().click();
    await page.waitForURL('**/shop');
    await page.getByRole('link', { name: 'PS5 Controller Holder', exact: true }).click();
    await page.waitForURL('**/product/ps5-controller-holder');
    await page.getByRole('button', { name: 'Боја / Color: Cobalt', exact: true }).click();
    await page.getByRole('button', { name: 'Add to cart', exact: true }).click();
    await page.getByRole('link', { name: 'Continue to checkout', exact: true }).click();
    await page.waitForURL('**/checkout');
    for (const [name, value] of Object.entries({
      firstName: 'Browser',
      lastName: 'QA ' + suffix,
      phone: '+38970123456',
      email,
      city: 'Скопје',
      postalCode: '1000',
      street: 'QA Address 12',
    }))
      await page.locator(`input[name="${name}"]`).fill(value);
    await page.locator('input[name="acceptTerms"]').check();
    await page.getByRole('button', { name: 'Place order', exact: true }).click();
    await page.waitForURL('**/order-confirmation/**');
    await page.getByRole('heading', { name: 'Thank you for your order!' }).waitFor();
    await page.screenshot({ path: 'test-results/order-confirmation.png', fullPage: true });
    const order = await db.order.findFirstOrThrow({ where: { email }, include: { items: true } });
    if (order.items[0].variantName !== 'Cobalt') throw Error('Selected variant was not retained');
    await page.goto(origin + '/admin/login');
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/admin');
    await page.getByRole('heading', { name: 'Your studio, at a glance.' }).waitFor();
    await page.screenshot({ path: 'test-results/admin-desktop.png', fullPage: true });
    await page.goto(origin + '/admin/products/new');
    for (const [name, value] of Object.entries({
      name: 'Browser product ' + suffix,
      slug: 'browser-product-' + suffix,
      sku: 'BROWSER-' + suffix,
      shortDescription: 'Browser test product',
      description: 'Created through the admin form.',
    }))
      await page.locator(`input[name="${name}"],textarea[name="${name}"]`).fill(value);
    await page.locator('[name="price"]').fill('890');
    await page.locator('[name="published"]').check();
    await page.getByRole('button', { name: 'Save product', exact: true }).click();
    await page.waitForURL(/\/admin\/products\/(?!new)[^/]+$/);
    await page.getByRole('heading', { name: 'Product images', exact: true }).waitFor();
    await page
      .locator('input[type="file"][multiple]')
      .setInputFiles('public/images/controller.webp');
    await page.getByRole('button', { name: 'Upload 1 images', exact: true }).click();
    await page.getByText('Images uploaded.', { exact: true }).waitFor();
    await page.locator('input[name="name"]').nth(1).fill('Size');
    await page.locator('input[name="values"]').fill('Small, Large');
    await page.getByRole('button', { name: 'Add option', exact: true }).click();
    await page.locator('.option-list').getByText('Size', { exact: true }).waitFor();
    const variant = page.locator('.variant-details').last();
    await variant.locator('input[name="name"]').fill('Small');
    await variant.locator('input[name="sku"]').fill('BROWSER-' + suffix + '-S');
    await variant.locator('select[name^="option-"]').selectOption({ label: 'Small' });
    await variant.getByRole('button', { name: 'Create variant', exact: true }).click();
    await page.getByText(new RegExp(`Small · BROWSER-${suffix}-S`)).waitFor();
    await page.goto(origin + '/product/browser-product-' + suffix);
    await page.getByRole('heading', { name: 'Browser product ' + suffix, exact: true }).waitFor();
    await page.getByRole('button', { name: 'Size: Small', exact: true }).waitFor();
    await page.goto(origin + '/admin/orders/' + order.id);
    for (const status of ['CONFIRMED', 'IN_PRODUCTION', 'READY', 'SHIPPED', 'DELIVERED']) {
      await page.locator('select[name="status"]').selectOption(status);
      await page.getByRole('button', { name: 'Save changes' }).click();
      await page.waitForFunction(
        (value) =>
          (document.querySelector('select[name="status"]') as HTMLSelectElement)?.value === value,
        status,
      );
      await page.getByText(status.replaceAll('_', ' '), { exact: true }).last().waitFor();
    }
    for (const width of [1280, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(origin, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      if (overflow) throw Error(`Horizontal overflow at ${width}px`);
      await page.screenshot({ path: `test-results/home-${width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + '/product/ps5-controller-holder');
    await page.screenshot({ path: 'test-results/product-mobile.png', fullPage: true });
    await page.getByRole('button', { name: 'Add to cart', exact: true }).click();
    await page.getByRole('link', { name: 'Continue to checkout', exact: true }).click();
    await page.waitForURL('**/checkout');
    await page.screenshot({ path: 'test-results/checkout-mobile.png', fullPage: true });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))
      throw Error('Checkout overflows on mobile');
    await writeFile(
      'test-results/browser-report.json',
      JSON.stringify(
        {
          desktop: true,
          laptop: true,
          tablet: true,
          mobile: true,
          customerFlow: true,
          adminProductFlow: true,
          adminOrderWorkflow: true,
          errors,
        },
        null,
        2,
      ),
    );
    if (errors.length) throw Error(errors.join('\n'));
    console.log(
      'Browser flows passed: storefront → colour → cart → checkout → confirmation; admin → product → image → option → variant → publish; complete order status workflow; 1440/1280/768/390px responsive checks.',
    );
  } finally {
    await browser.close();
    const orders = await db.order.findMany({ where: { email }, include: { items: true } });
    for (const o of orders)
      for (const i of o.items)
        if (i.stockDeducted && i.variantId)
          await db.productVariant.update({
            where: { id: i.variantId },
            data: { stock: { increment: i.quantity } },
          });
    await db.order.deleteMany({ where: { email } });
    await db.customer.deleteMany({ where: { email } });
    await db.product.deleteMany({ where: { slug: 'browser-product-' + suffix } });
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
