import Link from 'next/link';
import { Header, Logo } from '@/components/header';
import { CartProvider } from '@/components/cart-context';
import { getCopy, getLocale } from '@/lib/i18n';
import { getSettings } from '@/lib/settings';
import { LiveChat } from '@/components/live-chat';
export const dynamic = 'force-dynamic';
export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [copy, locale, s] = await Promise.all([getCopy(), getLocale(), getSettings()]);
  return (
    <CartProvider copy={copy}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header copy={copy} locale={locale} name={s.storeName} logo={s.logo} />
      <main id="main">{children}</main>
      <footer>
        <div className="footer-grid">
          <div>
            <Link href="/">
              <Logo name={s.storeName} />
            </Link>
            <p className="footer-tag">
              {s.tagline === 'BRINGING IDEAS TO LIFE'
                ? locale === 'en'
                  ? 'Thoughtful objects for everyday living.'
                  : 'Внимателно создадено за секојдневието.'
                : s.tagline}
            </p>
            <p className="muted">
              {locale === 'en'
                ? 'Designed & made in Macedonia.'
                : 'Дизајнирано и создадено во Македонија.'}
            </p>
          </div>
          <div>
            <h3>{copy.shop}</h3>
            <Link href="/shop">{copy.all}</Link>
            <Link href="/categories">{copy.categories}</Link>
            <Link href="/custom-order">{copy.custom}</Link>
          </div>
          <div>
            <h3>GrandXStudio</h3>
            <Link href="/about">{copy.about}</Link>
            <Link href="/contact">{copy.contact}</Link>
            <Link href="/shipping">{copy.shipping}</Link>
            <Link href="/returns">Враќање / Returns</Link>
          </div>
          <div>
            <h3>{copy.contact}</h3>
            {s.email && <a href={`mailto:${s.email}`}>{s.email}</a>}
            {s.phone && <a href={`tel:${s.phone}`}>{s.phone}</a>}
            {s.address && <p>{s.address}</p>}
            {['instagram', 'facebook', 'tiktok']
              .filter((k) => s[k])
              .map((k) => (
                <a target="_blank" rel="noopener noreferrer" key={k} href={s[k]}>
                  {k.charAt(0).toUpperCase() + k.slice(1)} ↗
                </a>
              ))}
            <Link href="/contact">{copy.message} ↗</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} {s.storeName}
          </span>
          <div>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <span>MKD · {copy.cod}</span>
          </div>
        </div>
      </footer>
      {s.chatEnabled !== 'false' && <LiveChat locale={locale} />}
    </CartProvider>
  );
}
