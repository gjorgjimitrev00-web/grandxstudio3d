import Link from 'next/link';
import { LoginForm } from '@/components/account';
import { Logo } from '@/components/header';
import { getCopy } from '@/lib/i18n';
import { currentUser } from '@/lib/security';
import { redirect } from 'next/navigation';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin sign in', robots: { index: false, follow: false } };
export default async function Login() {
  if ((await currentUser())?.role === 'ADMIN') redirect('/admin');
  const copy = await getCopy();
  return (
    <main className="admin-login">
      <div className="narrow">
        <Link href="/">
          <Logo />
        </Link>
        <p className="eyebrow orange">THE STUDIO, BEHIND THE SCENES</p>
        <LoginForm copy={copy} admin />
        <Link href="/" className="text-link centered">
          Back to store
        </Link>
      </div>
    </main>
  );
}
