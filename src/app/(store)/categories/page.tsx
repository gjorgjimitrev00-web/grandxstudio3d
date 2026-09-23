import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { db } from '@/lib/db';
import { getCopy } from '@/lib/i18n';
export const metadata = { title: 'Categories', alternates: { canonical: '/categories' } };
export default async function Categories() {
  const copy = await getCopy();
  const categories = await db.category.findMany({
    where: { enabled: true },
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { products: { where: { product: { published: true } } } } } },
  });
  return (
    <div className="page">
      <p className="eyebrow orange">A PLACE FOR EVERY IDEA</p>
      <h1 className="page-title">{copy.categories}</h1>
      <div className="category-cards">
        {categories.map((c, i) => (
          <Link href={`/shop?category=${c.slug}`} key={c.id} className="category-card">
            {c.image && <img src={c.image} alt={c.name} />}
            <span className="eyebrow">
              0{i + 1} / {c._count.products}
            </span>
            <h2>
              {c.name}
              <ArrowUpRight />
            </h2>
            <p>{c.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
