import Image from 'next/image';
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
          <Image
            className="about-image"
            src="/images/about-studio-2026.webp"
            width={1672}
            height={941}
            sizes="(max-width: 900px) 90vw, 800px"
            alt={
              locale === 'en'
                ? 'GrandXStudio 3D printed collection: white spiral lamp, red vase, green phone holder and pink LED candle holder'
                : '3D печатена колекција на GrandXStudio: бела спирална ламба, црвена вазна, зелен држач за телефон и розов LED држач'
            }
          />
        )}
        <div>{s[page]}</div>
        {page === 'privacy' && (
          <section>
            <h2>
              {locale === 'en' ? 'Personalized frame orders' : 'Нарачки на персонализирани рамки'}
            </h2>
            <p>
              {locale === 'en'
                ? 'The frame editor previews your photos in your browser. When you submit an order, GrandXStudio uses the uploaded artwork to create a print PDF and a proof. These files and your order details are stored privately for the studio to prepare the print and contact you about your order.'
                : 'Уредувачот ги прикажува фотографиите во вашиот прелистувач. Кога ќе ја испратите нарачката, GrandXStudio ги користи фотографиите за да подготви PDF за печатење и преглед на постерот. Датотеките и податоците за нарачката се чуваат приватно за студиото да го изработи постерот и да ве контактира околу нарачката.'}
            </p>
          </section>
        )}
        {page === 'privacy' && (
          <section>
            <h2>
              {locale === 'en'
                ? 'Event requests and product reviews'
                : 'Понуди за настани и рецензии'}
            </h2>
            <p>
              {locale === 'en'
                ? 'The studio uses the logo and list of names you supply to prepare your event order. Share your private quote link only with people who may see and approve your sample. Product reviews are optional. If you consent to publication, your approved rating, review and optional photo appear on the product page without your name or order number.'
                : 'Студиото го користи логото и списокот со имиња што ги доставуваш за изработка на нарачката за настан. Приватниот линк сподели го само со лица кои смеат да го видат и одобрат примерокот. Рецензиите се по избор. Со твоја согласност, одобрената оценка, рецензија и евентуалната фотографија се објавуваат на страницата на производот без твоето име или бројот на нарачката.'}
            </p>
          </section>
        )}
        {page === 'privacy' && (
          <AnalyticsPrivacy locale={locale} enabled={s.analyticsEnabled !== 'false'} />
        )}
      </div>
    </div>
  );
}
