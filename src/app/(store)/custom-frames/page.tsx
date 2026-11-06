import Link from 'next/link';
import { getLocale } from '@/lib/i18n';
import { getFramePrices } from '@/lib/frame-pricing';
import { FrameStudio } from '@/components/frame-studio';
import './frames.css';

export async function generateMetadata() {
  const mk = (await getLocale()) === 'mk';
  return {
    title: mk ? 'Персонализирани рамки' : 'Custom photo frames',
    description: mk
      ? 'Направи љубовен постер од твоите фотографии или прикачи готов дизајн и нарачај печатење од GrandXStudio.'
      : 'Create a love poster with your photos or upload a finished design and order a framed print from GrandXStudio.',
    alternates: { canonical: '/custom-frames' },
  };
}

export default async function CustomFramesPage() {
  const [locale, prices] = await Promise.all([getLocale(), getFramePrices()]);
  const mk = locale === 'mk';
  return (
    <div className="frame-page">
      <nav className="frame-crumb" aria-label={mk ? 'Навигација' : 'Breadcrumb'}>
        <Link href="/">{mk ? 'Почетна' : 'Home'}</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{mk ? 'Персонализирани рамки' : 'Custom frames'}</span>
      </nav>
      <header className="frame-intro">
        <h1>
          {mk ? 'Рамка по ' : 'A frame of '}
          <em>{mk ? 'твоја мерка.' : 'your own.'}</em>
        </h1>
        <p>
          {mk
            ? 'Избери постер за твоите фотографии или прикачи свој дизајн. Намести го секој детал и види како ќе изгледа отпечатокот.'
            : 'Choose a poster for your photos or upload your own design. Arrange the details and see how your print will look.'}
        </p>
      </header>
      <FrameStudio locale={locale} prices={prices} />
    </div>
  );
}
