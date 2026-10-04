import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, ArrowRight, Layers3, PackageCheck, PenTool, Box } from 'lucide-react';
import { getSettings } from '@/lib/settings';
import { db } from '@/lib/db';
import { getCopy, getLocale } from '@/lib/i18n';
import { ProductCard } from '@/components/product-card';
import { Newsletter } from '@/components/newsletter';
export const metadata = { alternates: { canonical: '/' } };
export default async function Home() {
  const [copy, locale, settings] = await Promise.all([getCopy(), getLocale(), getSettings()]);
  const en = locale === 'en';
  const [products, categories] = process.env.DATABASE_URL
    ? await Promise.all([
        db.product.findMany({
          where: { published: true, featured: true },
          include: {
            images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1 },
            categories: { include: { category: true } },
          },
          take: 4,
          orderBy: { createdAt: 'desc' },
        }),
        db.category.findMany({ where: { enabled: true }, orderBy: { sortOrder: 'asc' }, take: 8 }),
      ])
    : [[], []];
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            {en
              ? 'Independent design. Made in Macedonia.'
              : 'Оригинален дизајн. Создадено во Македонија.'}
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
              ? 'Thoughtfully designed, locally 3D printed. Find something for your space, or let’s make it yours.'
              : 'Внимателно дизајнирано, локално 3D печатено. Пронајди нешто за твојот простор, или создај нешто по свое.'}
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
            src="/images/hero.webp"
            alt={
              en
                ? 'Sculptural 3D printed lighting and objects for the home'
                : 'Скулптурална 3D печатена ламба и предмети за домот'
            }
            preload
            fill
            sizes="(max-width: 700px) 92vw, (min-width: 1500px) 620px, 46vw"
          />
          <Link href="/shop" className="visual-label">
            <span>{en ? 'Form meets everyday function.' : 'Форма со секојдневна функција.'}</span>
            <ArrowUpRight size={20} />
          </Link>
        </div>
      </section>
      <div className="benefit-strip">
        <span>
          <Layers3 />
          {en ? 'Designed & made locally' : 'Локален дизајн и изработка'}
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
          </div>
          <Link href="/shop" className="text-link">
            {copy.all}
            <ArrowRight size={17} />
          </Link>
        </div>
        <div className="product-grid">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} copy={copy} />
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
      <section className="custom-banner">
        <div className="custom-art">
          <img
            src="/images/headphones.webp"
            loading="lazy"
            alt={
              en
                ? 'Blue 3D printed headphone stand on a desk'
                : 'Сина 3D печатена основа за слушалки'
            }
          />
        </div>
        <div className="custom-copy">
          <p className="eyebrow">{en ? 'A little more personal' : 'Нешто лично твое'}</p>
          <h2>{copy.customTitle}</h2>
          <p>{copy.customText}</p>
          <Link href="/custom-order" className="button">
            {copy.customOrder}
            <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>
      <Newsletter copy={copy} />
    </>
  );
}
