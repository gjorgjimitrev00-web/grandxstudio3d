import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="page">
      <div className="empty">
        <p className="eyebrow orange">404 — NOT IN THIS COLLECTION</p>
        <h1 className="page-title">Страницата не е пронајдена.</h1>
        <p>The page may have moved or requires access.</p>
        <Link href="/shop" className="button">
          Продавница / Shop ↗
        </Link>
      </div>
    </div>
  );
}
