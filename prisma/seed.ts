import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SAMPLE_SEED !== 'true')
    throw Error(
      'Sample seeding is disabled in production. Set ALLOW_SAMPLE_SEED=true only for an empty demonstration store.',
    );
  const categories = [
    ['gaming', 'Gaming'],
    ['home-decor', 'Home décor'],
    ['desk-accessories', 'Desk accessories'],
    ['lighting', 'Lighting'],
    ['personalized', 'Персонализирани'],
    ['gifts', 'Подароци'],
    ['automotive', 'Automotive'],
    ['custom-prints', 'Custom prints'],
  ];
  for (let i = 0; i < categories.length; i++) {
    const [slug, name] = categories[i];
    await db.category.upsert({
      where: { slug },
      create: { slug, name, description: `GrandXStudio ${name}`, sortOrder: i },
      update: {},
    });
  }
  const records = [
    ['ps5-controller-holder', 'PS5 Controller Holder', 690, 'gaming', 'controller', true, true],
    [
      'dual-ps5-controller-holder',
      'Dual Controller Holder',
      990,
      'gaming',
      'controller',
      false,
      true,
    ],
    ['headphone-stand', 'Arc Headphone Stand', 1490, 'desk-accessories', 'headphones', true, true],
    [
      'gaming-desk-organizer',
      'Gaming Desk Organizer',
      990,
      'desk-accessories',
      'controller',
      false,
      false,
    ],
    ['cable-organizer', 'Cable Organizer', 350, 'desk-accessories', 'headphones', false, false],
    ['modern-3d-printed-lamp', 'Forma — Table Lamp', 2500, 'lighting', 'hero', true, true],
    [
      'personalized-led-name-sign',
      'Personalized LED Name Sign',
      2700,
      'personalized',
      'hero',
      false,
      false,
    ],
    ['personalized-keychain', 'Personalized Keychain', 350, 'gifts', 'controller', false, false],
    ['phone-stand', 'Everyday Phone Stand', 690, 'desk-accessories', 'headphones', true, false],
    ['custom-lithophane', 'Custom Lithophane', 1990, 'gifts', 'hero', false, false],
  ] as const;
  for (let i = 0; i < records.length; i++) {
    const [slug, name, price, categorySlug, image, featured, bestseller] = records[i];
    if (await db.product.findUnique({ where: { slug } })) continue;
    const category = await db.category.findUniqueOrThrow({ where: { slug: categorySlug } });
    const product = await db.product.create({
      data: {
        slug,
        name,
        sku: `GX-SAMPLE-${i + 1}`,
        price,
        salePrice: i === 2 ? 1290 : null,
        shortDescription:
          'Внимателно дизајниран, прецизно испечатен. Мал детал што го подобрува твоето секојдневие.',
        description:
          'Изработен со прецизно 3D печатење, овој дизајн ги спојува функцијата и формата. Суптилните слоеви се дел од карактерот на секој предмет.\n\nПример производ за развој. Фотографијата е генериран концепт и не претставува потврдена залиха. Пред продажба, заменете ја со фотографија од вашиот вистински производ и проверете ги спецификациите.',
        published: true,
        featured,
        bestseller,
        isNew: i % 2 === 0,
        inventoryMode: i === 0 ? 'IN_STOCK' : 'MADE_TO_ORDER',
        trackInventory: i === 0,
        stock: i === 0 ? 20 : 0,
        lowStockThreshold: 3,
        categories: { create: { categoryId: category.id } },
        images: {
          create: {
            url: `/images/${image}.webp`,
            listingUrl: `/images/${image}.webp`,
            thumbnailUrl: `/images/${image}.webp`,
            filename: `sample-${image}`,
            width: 1000,
            height: 1000,
            altText: `${name} — sample concept`,
            isPrimary: true,
          },
        },
        specifications: {
          create: [
            { label: 'Материјал', value: 'PLA — пример; потврдете пред продажба' },
            { label: 'Производство', value: '3D печатење, Македонија' },
            {
              label: 'Нега',
              value: 'Избришете со мека сува крпа. Чувајте подалеку од висока температура.',
            },
          ],
        },
      },
    });
    const color = await db.productOption.create({
      data: {
        productId: product.id,
        name: 'Боја / Color',
        kind: 'SELECT',
        required: true,
        values: {
          create: [
            { value: 'Graphite', swatch: '#30312e' },
            { value: 'Ivory', swatch: '#e6e4db' },
            { value: 'Cobalt', swatch: '#2548bb' },
            { value: 'Orange', swatch: '#e96030' },
          ],
        },
      },
      include: { values: true },
    });
    for (const value of color.values)
      await db.productVariant.create({
        data: {
          productId: product.id,
          name: value.value,
          sku: `GX-SAMPLE-${i + 1}-${value.value.toUpperCase()}`,
          stock: i === 0 ? 5 : 0,
          values: { create: { valueId: value.id } },
        },
      });
    if (categorySlug === 'personalized' || slug === 'personalized-keychain')
      await db.productOption.create({
        data: { productId: product.id, name: 'Персонализиран текст', kind: 'TEXT', required: true },
      });
  }
  for (const [id, name, kind, price, freeThreshold, enabled] of [
    ['standard', 'Стандардна достава', 'STANDARD', 150, 3000, true],
    ['free', 'Бесплатна достава', 'FREE', 0, 3000, true],
    ['pickup', 'Лично подигнување', 'PICKUP', 0, null, false],
  ] as const)
    await db.shippingMethod.upsert({
      where: { id },
      create: { id, name, kind, price, freeThreshold, enabled },
      update: {},
    });
  console.log(
    'Development sample catalog and shipping methods are ready. No admin credentials were created.',
  );
}
main().finally(() => db.$disconnect());
