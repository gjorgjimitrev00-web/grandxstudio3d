import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, ArrowRight, Layers3, PackageCheck, PenTool, Box } from 'lucide-react';
import { getSettings } from '@/lib/settings';
import { db } from '@/lib/db';
import { getCopy, getLocale } from '@/lib/i18n';
import { ProductCard } from '@/components/product-card';
import { Newsletter } from '@/components/newsletter';
import { selectStudioProducts } from '@/lib/studio-products';
import type { Prisma } from '@prisma/client';
import { CHRISTMAS_CATEGORY_SLUG, storefrontProductWhere } from '@/lib/catalog-visibility';
import { getBlackFriday } from '@/lib/campaigns';
import { withCampaign } from '@/lib/campaign-rules';

const productInclude = {
  images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1 },
  categories: { where: { category: { enabled: true } }, include: { category: true } },
} satisfies Prisma.ProductInclude;

export const metadata = { alternates: { canonical: '/' } };
export default async function Home() {
  const [copy, locale, settings, campaign] = await Promise.all([
    getCopy(),
    getLocale(),
    getSettings(),
    getBlackFriday(),
  ]);
  const en = locale === 'en';
  const [recentProducts, categories, christmas] = process.env.DATABASE_URL
    ? await Promise.all([
        db.product.findMany({
          where: storefrontProductWhere,
          include: productInclude,
          take: 8,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        }),
        db.category.findMany({
          where: { enabled: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
          take: 8,
          include: {
            products: {
              where: { product: storefrontProductWhere },
              orderBy: [{ product: { createdAt: 'desc' } }, { productId: 'asc' }],
              take: 2,
              include: { product: { include: productInclude } },
            },
          },
        }),
        db.category.findUnique({
          where: { slug: CHRISTMAS_CATEGORY_SLUG },
          select: { enabled: true },
        }),
      ])
    : [[], [], null];
  const christmasEnabled = christmas?.enabled === true;
  const products = selectStudioProducts(
    categories.map((category) => category.products.map(({ product }) => product)),
    recentProducts,
  );
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            {en
              ? 'Made with care. 3D printed in Macedonia.'
              : 'Изработено со внимание. 3D печатено во Македонија.'}
          </p>
          <h1>
            {settings.tagline === 'BRINGING IDEAS TO LIFE' ? (
              <>
                {en ? 'Small objects.' : 'Мали предмети.'}
                <br />
                <span className="hero-soft">{en ? 'Everyday joy.' : 'Секојдневна радост.'}</span>
              </>
            ) : (
              settings.tagline
            )}
          </h1>
          <p className="hero-description">
            {en
              ? 'Carefully made with 3D printing. Find something for your space, or let’s make it yours.'
              : 'Внимателно изработено со 3D печатење. Пронајди нешто за твојот простор, или создај нешто по свое.'}
          </p>
          <div className="hero-buttons">
            <Link href="/shop" className="button">
              {copy.shopNow}
              <ArrowRight size={18} />
            </Link>
            <Link href="/custom-order" className="text-link">
              {copy.customOrder}
              <ArrowUpRight size={18} />
            </Link>
          </div>
        </div>
        <div className="hero-visual">
          <Image
            src={
              christmasEnabled
                ? '/images/christmas-collection-hero.webp'
                : '/images/studio-objects-2026.webp'
            }
            alt={
              christmasEnabled
                ? en
                  ? 'Our 3D printed Christmas collection: Santa, a polar bear, a tree, a gnome, baubles, a bell and Santa hats'
                  : 'Нашата 3D печатена новогодишна колекција: Дедо Мраз, поларно мече, елка, гном, лампиони, ѕвонче и капчиња'
                : en
                  ? 'Our lamp, vase, phone stand and LED candle holder'
                  : 'Нашата ламба, вазна, држач за телефон и LED држач'
            }
            preload
            width={christmasEnabled ? 1254 : 1448}
            height={christmasEnabled ? 1254 : 1086}
            sizes="(max-width: 700px) 92vw, (min-width: 1500px) 620px, 46vw"
          />
          <Link
            href={christmasEnabled ? `/shop?category=${CHRISTMAS_CATEGORY_SLUG}` : '/shop'}
            className="visual-label"
          >
            <span>
              {christmasEnabled
                ? en
                  ? 'Explore the Christmas collection'
                  : 'Откриј ја новогодишната колекција'
                : en
                  ? 'Explore the collection'
                  : 'Откриј ја колекцијата'}
            </span>
            <ArrowUpRight size={20} />
          </Link>
        </div>
      </section>
      <div className="benefit-strip">
        <span>
          <Layers3 />
          {en ? 'Locally 3D printed' : 'Локално 3D печатено'}
        </span>
        <span>
          <PenTool />
          {en ? 'Personalized for you' : 'Персонализирано за тебе'}
        </span>
        <span>
          <PackageCheck />
          {copy.cod}
        </span>
      </div>
      <section className="section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{en ? 'From the studio' : 'Од студиото'}</p>
            <h2>{copy.featured}</h2>
            <p className="muted">
              {christmasEnabled
                ? en
                  ? 'Lighting, vases, useful little objects and a touch of celebration.'
                  : 'Светло, вазни, практични мали предмети и малку празнична радост.'
                : en
                  ? 'Lighting, vases and useful little objects for your space.'
                  : 'Светло, вазни и практични мали предмети за твојот простор.'}
            </p>
          </div>
          <Link href="/shop" className="text-link">
            {copy.all}
            <ArrowRight size={17} />
          </Link>
        </div>
        <div className="product-grid">
          {products.map((p) => (
            <ProductCard key={p.id} product={withCampaign(p, campaign)} copy={copy} />
          ))}
        </div>
        {!products.length && (
          <div className="empty">
            <Box />
            <p>{copy.noProducts}</p>
            <Link href="/custom-order" className="text-link">
              {copy.customOrder}
              <ArrowRight size={17} />
            </Link>
          </div>
        )}
      </section>
      {categories.length > 0 && (
        <section className="categories-section">
          <div className="section-heading">
            <h2>{en ? 'Find your everyday.' : 'Пронајди го твојот стил.'}</h2>
            <Link className="text-link" href="/categories">
              {copy.categories}
              <ArrowRight size={17} />
            </Link>
          </div>
          <div className="category-list">
            {categories.map((c) => (
              <Link href={`/shop?category=${c.slug}`} key={c.id}>
                <h3>{c.name}</h3>
                <ArrowUpRight size={18} />
              </Link>
            ))}
          </div>
          <div className="collection-links">
            <Link href="/shop?sort=newest">
              {copy.new}
              <ArrowRight size={15} />
            </Link>
            <Link href="/shop?sort=popular">
              {copy.bestsellers}
              <ArrowRight size={15} />
            </Link>
          </div>
        </section>
      )}
      <section className="custom-banner" aria-labelledby="custom-order-title">
        <div className="custom-copy">
          <p className="eyebrow">{en ? 'A little more personal' : 'Нешто лично твое'}</p>
          <h2 id="custom-order-title">{copy.customTitle}</h2>
          <p>
            {en
              ? 'A detail for your home. A gift with a story. Tell us what you have in mind and we’ll explore how to bring it to life with 3D printing.'
              : 'Детал за твојот дом. Подарок со приказна. Кажи ни што замислуваш и заедно ќе најдеме начин да го создадеме со 3D печатење.'}
          </p>
          <ul
            className="custom-details"
            aria-label={en ? 'Make it your own' : 'Додај свој карактер'}
          >
            <li>{en ? 'Your colour' : 'Твоја боја'}</li>
            <li>{en ? 'Your shape' : 'Твоја форма'}</li>
            <li>{en ? 'Your detail' : 'Твој детал'}</li>
          </ul>
          <Link href="/custom-order" className="button">
            {en ? 'Share your idea' : 'Сподели ја твојата идеја'}
            <ArrowUpRight size={18} />
          </Link>
        </div>
        <figure className="custom-art">
          <Image
            src="/images/studio-objects-2026.webp"
            width={1448}
            height={1086}
            sizes="(max-width: 700px) 90vw, (min-width: 1500px) 700px, 50vw"
            alt={
              en
                ? 'Studio composition with our white spiral lamp, red vase, green armchair phone holder and pink LED candle holder'
                : 'Студиска композиција со нашата бела спирална ламба, црвена вазна, зелен држач за телефон и розов LED држач'
            }
          />
          <figcaption>
            <span>GrandXStudio</span>
            <span>{en ? 'A few ideas to start with.' : 'Неколку идеи за почеток.'}</span>
          </figcaption>
        </figure>
      </section>
      <Newsletter copy={copy} />
    </>
  );
}
