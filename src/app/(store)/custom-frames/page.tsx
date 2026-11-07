import Link from 'next/link';
import { getLocale } from '@/lib/i18n';
import { getFramePrices } from '@/lib/frame-pricing';
import { FrameStudio } from '@/components/frame-studio';
import './frames.css';
import './drafts.css';

export async function generateMetadata() {
  const mk = (await getLocale()) === 'mk';
  return {
    title: mk ? 'Персонализирани рамки' : 'Custom photo frames',
    description: mk
      ? 'Персонализирај постер за годишнина, крштевка или детски роденден со свои фотографии. Избери формат и хартија или прикачи готов дизајн за печатење.'
      : 'Personalise an anniversary, baptism or birthday poster with your photos. Choose a print size and paper, or upload finished artwork for framing.',
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
            ? 'Избери постер за годишнина, крштевка или роденден и додај свои фотографии. Можеш и да прикачиш готов дизајн за печатење.'
            : 'Choose an anniversary, baptism or birthday poster and add your photos. You can also upload your own finished design for printing.'}
        </p>
      </header>
      <FrameStudio locale={locale} prices={prices} />
    </div>
  );
}
