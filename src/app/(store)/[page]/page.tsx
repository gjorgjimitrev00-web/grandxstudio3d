import { notFound } from 'next/navigation';
import { getSettings } from '@/lib/settings';
import { getLocale } from '@/lib/i18n';
import { AnalyticsPrivacy } from '@/components/visitor-tracker';
const titles: Record<string, string> = {
  about: 'За нас / About',
  terms: 'Услови за користење / Terms',
  privacy: 'Политика за приватност / Privacy',
  shipping: 'Достава / Shipping',
  returns: 'Враќање / Returns',
};
export async function generateMetadata({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  return { title: titles[page] || 'Not found', alternates: { canonical: `/${page}` } };
}
export default async function ContentPage({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  if (!titles[page]) notFound();
  const [s, locale] = await Promise.all([getSettings(), getLocale()]);
  return (
    <div className="page">
      <div className="legal">
        <p className="eyebrow orange">GRANDXSTUDIO</p>
        <h1 className="page-title">{titles[page]}</h1>
        {page === 'about' && (
          <img
            className="about-image"
            src="/images/hero.webp"
            alt="GrandXStudio design collection"
          />
        )}
        <div>{s[page]}</div>
        {page === 'privacy' && (
          <AnalyticsPrivacy locale={locale} enabled={s.analyticsEnabled !== 'false'} />
        )}
      </div>
    </div>
  );
}
