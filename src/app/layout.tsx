import type { Metadata } from 'next';
import './globals.css';
import { getLocale } from '@/lib/i18n';
import { siteUrl } from '@/lib/utils';
import { getSettings } from '@/lib/settings';
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  return {
    metadataBase: new URL(siteUrl()),
    title: {
      default: `${settings.storeName} — ${settings.tagline}`,
      template: `%s | ${settings.storeName}`,
    },
    description:
      'Функционални додатоци, оригинални дизајни и персонализирани 3D печатени производи. Создадено во Македонија.',
    icons: { icon: '/favicon.svg' },
    openGraph: { type: 'website', siteName: settings.storeName, locale: 'mk_MK' },
    twitter: { card: 'summary' },
  };
}
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={await getLocale()} data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
