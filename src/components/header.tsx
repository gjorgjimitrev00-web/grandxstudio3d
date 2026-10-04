'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef } from 'react';
import { Menu, Search, UserRound, X, ArrowUpRight } from 'lucide-react';
import { CartButton } from './cart-context';
import type { Copy } from '@/lib/i18n';
export function Logo({ name = 'GrandXStudio' }: { name?: string }) {
  if (name !== 'GrandXStudio') return <span className="logo">{name}</span>;
  return (
    <span className="logo">
      Grand<span className="brand-x">X</span>Studio
    </span>
  );
}
export function Header({
  copy,
  locale,
  name,
  logo,
}: {
  copy: Copy;
  locale: string;
  name: string;
  logo: string;
}) {
  const menu = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const links = [
    ['/', copy.home],
    ['/shop', copy.shop],
    ['/categories', copy.categories],
    ['/custom-order', copy.custom],
    ['/about', copy.about],
    ['/contact', copy.contact],
  ];
  return (
    <>
      <div className="announcement">
        <span>
          {locale === 'en'
            ? 'Designed & 3D printed in Macedonia'
            : 'Дизајнирано и 3D печатено во Македонија'}
        </span>
        <span>{copy.cod}</span>
      </div>
      <header className="header">
        <Link href="/" aria-label={name}>
          {logo ? <img className="custom-logo" src={logo} alt={name} /> : <Logo name={name} />}
        </Link>
        <nav
          className="desktop-nav"
          aria-label={locale === 'en' ? 'Main navigation' : 'Главна навигација'}
        >
          {links
            .filter(([href]) => href !== '/' && href !== '/categories')
            .map(([href, label]) => (
              <Link href={href} key={href} aria-current={pathname === href ? 'page' : undefined}>
                {label}
              </Link>
            ))}
        </nav>
        <div className="header-actions">
          <button
            className="language"
            aria-label="Change language"
            onClick={() => {
              document.cookie = `gx-locale=${locale === 'mk' ? 'en' : 'mk'};path=/;max-age=31536000;SameSite=Lax`;
              location.reload();
            }}
          >
            {locale.toUpperCase()}
          </button>
          <button
            className="icon-button"
            aria-label={copy.search}
            onClick={() => search.current?.showModal()}
          >
            <Search size={21} />
          </button>
          <Link className="icon-button account-icon" href="/account" aria-label={copy.account}>
            <UserRound size={21} />
          </Link>
          <CartButton />
          <button
            className="icon-button mobile-only"
            aria-label="Menu"
            onClick={() => menu.current?.showModal()}
          >
            <Menu />
          </button>
        </div>
      </header>
      <dialog ref={menu} className="mobile-menu">
        <div className="row between">
          <Logo name={name} />
          <button
            className="icon-button"
            aria-label="Close menu"
            onClick={() => menu.current?.close()}
          >
            <X />
          </button>
        </div>
        <nav>
          {links.map(([href, label]) => (
            <Link
              href={href}
              key={href}
              aria-current={pathname === href ? 'page' : undefined}
              onClick={() => menu.current?.close()}
            >
              {label}
              <ArrowUpRight />
            </Link>
          ))}
          <Link href="/account" onClick={() => menu.current?.close()}>
            {copy.account}
          </Link>
        </nav>
      </dialog>
      <dialog ref={search} className="search-dialog">
        <div className="row between">
          <h2>{copy.search}</h2>
          <button
            className="icon-button"
            aria-label="Close search"
            onClick={() => search.current?.close()}
          >
            <X />
          </button>
        </div>
        <form action="/shop" onSubmit={() => search.current?.close()} className="row">
          <input name="q" placeholder={copy.search} aria-label={copy.search} autoFocus />
          <button className="button" aria-label={copy.search}>
            <Search size={20} />
          </button>
        </form>
      </dialog>
    </>
  );
}
