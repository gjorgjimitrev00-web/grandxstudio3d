import Link from 'next/link';
import Image from 'next/image';
import { getSettings } from '@/lib/settings';
import { ArrowUpRight, ArrowRight, Layers3, PackageCheck, PenTool, Truck, Box } from 'lucide-react';
import { db } from '@/lib/db';
import { getCopy } from '@/lib/i18n';
import { ProductCard } from '@/components/product-card';
import { Newsletter } from '@/components/newsletter';
export const metadata = { alternates: { canonical: '/' } };
export default async function Home() {
  const copy = await getCopy();
  const settings = await getSettings();
  const products = process.env.DATABASE_URL
    ? await db.product.findMany({
        where: { published: true, featured: true },
        include: {
          images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1 },
          categories: { include: { category: true } },
        },
        take: 4,
        orderBy: { createdAt: 'desc' },
      })
    : [];
  const categories = process.env.DATABASE_URL
    ? await db.category.findMany({
        where: { enabled: true },
        orderBy: { sortOrder: 'asc' },
        take: 8,
      })
    : [];
  const [newProducts, bestsellers] = process.env.DATABASE_URL
    ? await Promise.all([
        db.product.findMany({
          where: { published: true, isNew: true },
          include: {
            images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1 },
            categories: { include: { category: true } },
          },
          take: 4,
          orderBy: { createdAt: 'desc' },
        }),
        db.product.findMany({
          where: { published: true, bestseller: true },
          include: {
            images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1 },
            categories: { include: { category: true } },
          },
          take: 4,
          orderBy: { createdAt: 'desc' },
        }),
      ])
    : [[], []];
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="orange-line" />
            DESIGNED TO BE DIFFERENT
          </p>
          <h1>
            {settings.tagline === 'BRINGING IDEAS TO LIFE' ? (
              <>
                BRINGING
                <br />
                IDEAS <span className="outline-text">TO</span>
                <br />
                <span className="orange">LIFE.</span>
                <span className="hero-asterisk">✳</span>
              </>
            ) : (
              settings.tagline
            )}
          </h1>
          <p className="hero-description">{copy.heroSub}</p>
          <div className="hero-buttons">
            <Link href="/shop" className="button">
              {copy.shopNow}
              <ArrowUpRight size={19} />
            </Link>
            <Link href="/custom-order" className="text-link">
              {copy.customOrder}
              <ArrowRight size={18} />
            </Link>
          </div>
          <div className="hero-bottom">
            <span>01 — OBJECTS WITH PURPOSE</span>
            <span>EST. IN MACEDONIA</span>
          </div>
        </div>
        <div className="hero-visual">
          <Image
            src="/images/hero.webp"
            alt="Скулптурална 3D печатена ламба, сина вазна и портокалов држач"
            priority
            fill
            sizes="(max-width: 600px) 100vw, 50vw"
          />
          <div className="visual-label">
            <span>FROM LAYERS TO LIVING.</span>
            <Link href="/shop?category=lighting" aria-label="Explore lighting">
              <ArrowUpRight />
            </Link>
          </div>
          <span className="image-index">THE STUDIO COLLECTION / 001</span>
        </div>
      </section>
      <div className="benefit-strip">
        <span>
          <Layers3 />
          Прецизност во секој слој
        </span>
        <span>
          <PenTool />
          Создадено по твоја мерка
        </span>
        <span>
          <PackageCheck />
          {copy.cod}
        </span>
        <span>
          <Truck />
          Достава низ Македонија
        </span>
      </div>
      <section className="section">
        <div className="section-heading">
          <div>
            <p className="eyebrow orange">CURATED BY GRANDXSTUDIO</p>
            <h2>{copy.featured}</h2>
            <p className="muted">{copy.featuredSub}</p>
          </div>
          <Link href="/shop" className="text-link">
            {copy.all}
            <ArrowUpRight size={18} />
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
              {copy.customOrder} ↗
            </Link>
          </div>
        )}
      </section>
      <section className="categories-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">FIND YOUR EVERYDAY EXTRAORDINARY</p>
            <h2>{copy.categories}</h2>
          </div>
          <Link className="text-link" href="/categories">
            {copy.all}
            <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className="category-list">
          {categories.map((c, i) => (
            <Link href={`/shop?category=${c.slug}`} key={c.id}>
              <span className="category-number">0{i + 1}</span>
              <h3>{c.name}</h3>
              <ArrowUpRight />
            </Link>
          ))}
        </div>
      </section>
      {newProducts.length > 0 && (
        <section className="section">
          <div className="section-heading">
            <div>
              <p className="eyebrow orange">FRESH OFF THE PRINTER</p>
              <h2>{copy.new}</h2>
            </div>
            <Link className="text-link" href="/shop?sort=newest">
              {copy.all}
              <ArrowUpRight size={18} />
            </Link>
          </div>
          <div className="product-grid">
            {newProducts.map((p) => (
              <ProductCard key={p.id} product={p} copy={copy} />
            ))}
          </div>
        </section>
      )}
      <section className="custom-banner">
        <div className="custom-art">
          <img
            src="/images/headphones.webp"
            loading="lazy"
            alt="Сина 3D печатена основа за слушалки"
          />
          <span>IMAGINE. DESIGN. PRINT.</span>
        </div>
        <div className="custom-copy">
          <p className="eyebrow">NOT OFF THE SHELF. OUT OF YOUR MIND.</p>
          <h2>{copy.customTitle}</h2>
          <p>{copy.customText}</p>
          <Link href="/custom-order" className="button light">
            {copy.customOrder}
            <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>
      <section className="section why-section">
        <div>
          <p className="eyebrow orange">WHY GRANDXSTUDIO</p>
          <h2>
            Повеќе од
            <br />
            испечатен предмет.
          </h2>
        </div>
        <div className="why-grid">
          {[
            [
              '01',
              'Дизајн со функција',
              'Предмети што изгледаат добро и имаат свое место во твоето секојдневие.',
            ],
            [
              '02',
              'Локално создадено',
              'Од идеја до последниот слој, внимателно произведено во Македонија.',
            ],
            [
              '03',
              'Лично, по твое',
              'Избери боја, димензија или создај целосно нов дизајн со нас.',
            ],
          ].map(([n, title, body]) => (
            <article key={n}>
              <span className="orange">{n}</span>
              <h3>{title}</h3>
              <p className="muted">{body}</p>
            </article>
          ))}
        </div>
      </section>
      {bestsellers.length > 0 && (
        <section className="section">
          <div className="section-heading">
            <div>
              <p className="eyebrow orange">THE MOST LOVED</p>
              <h2>{copy.bestsellers}</h2>
            </div>
            <Link href="/shop?sort=popular" className="text-link">
              {copy.all} ↗
            </Link>
          </div>
          <div className="product-grid">
            {bestsellers.map((p) => (
              <ProductCard key={p.id} product={p} copy={copy} />
            ))}
          </div>
        </section>
      )}
      <Newsletter copy={copy} />
    </>
  );
}
