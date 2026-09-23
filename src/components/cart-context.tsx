'use client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ShoppingBag, X, Minus, Plus, ArrowRight } from 'lucide-react';
import type { Copy } from '@/lib/i18n';
import { money } from '@/lib/utils';
export type CartItem = {
  key: string;
  productId: string;
  variantId?: string;
  name: string;
  slug: string;
  image: string;
  variantName?: string;
  options: Record<string, string>;
  quantity: number;
  price: number;
};
const CartContext = createContext<null | {
  items: CartItem[];
  add: (item: Omit<CartItem, 'key'>, showDrawer?: boolean) => void;
  update: (key: string, quantity: number) => void;
  clear: () => void;
  open: () => void;
  copy: Copy;
}>(null);
export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw Error('Cart provider missing');
  return ctx;
}
export function CartProvider({ children, copy }: { children: React.ReactNode; copy: Copy }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('gx-cart-v1') || '[]');
      if (Array.isArray(stored))
        setItems(
          stored
            .filter(
              (i) =>
                i &&
                typeof i.productId === 'string' &&
                Number.isInteger(i.quantity) &&
                i.quantity > 0,
            )
            .slice(0, 50),
        );
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) localStorage.setItem('gx-cart-v1', JSON.stringify(items));
  }, [items, ready]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 3000);
    return () => clearTimeout(timer);
  }, [notice]);
  function add(item: Omit<CartItem, 'key'>, showDrawer = true) {
    const key = JSON.stringify([
      item.productId,
      item.variantId,
      Object.entries(item.options).sort(),
    ]);
    setItems((old) => {
      const found = old.find((i) => i.key === key);
      return found
        ? old.map((i) =>
            i.key === key ? { ...i, quantity: Math.min(99, i.quantity + item.quantity) } : i,
          )
        : [...old, { ...item, key }].slice(0, 50);
    });
    setNotice(copy.add + ' ✓');
    if (showDrawer) dialog.current?.showModal();
  }
  const update = (key: string, quantity: number) =>
    setItems((old) =>
      quantity <= 0
        ? old.filter((i) => i.key !== key)
        : old.map((i) => (i.key === key ? { ...i, quantity: Math.min(99, quantity) } : i)),
    );
  return (
    <CartContext.Provider
      value={{
        items,
        add,
        update,
        clear: () => setItems([]),
        open: () => dialog.current?.showModal(),
        copy,
      }}
    >
      {children}
      <div role="status" className={`toast ${notice ? 'visible' : ''}`}>
        {notice}
      </div>
      <dialog
        className="cart-drawer"
        ref={dialog}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current.close();
        }}
      >
        <div className="drawer-content">
          <div className="row between">
            <h2>
              {copy.cart}{' '}
              <span className="muted">({items.reduce((n, i) => n + i.quantity, 0)})</span>
            </h2>
            <button
              className="icon-button"
              aria-label="Close"
              onClick={() => dialog.current?.close()}
            >
              <X />
            </button>
          </div>
          <CartLines />
          {items.length > 0 && (
            <div className="drawer-bottom">
              <div className="row between">
                <span>{copy.subtotal}</span>
                <b>{money(items.reduce((n, i) => n + i.price * i.quantity, 0))}</b>
              </div>
              <p className="small muted">
                {copy.shipping} · {copy.cod}
              </p>
              <Link
                className="button full"
                href="/checkout"
                onClick={() => dialog.current?.close()}
              >
                {copy.checkout}
                <ArrowRight size={18} />
              </Link>
              <Link
                className="text-link centered"
                href="/cart"
                onClick={() => dialog.current?.close()}
              >
                {copy.cart}
              </Link>
            </div>
          )}
        </div>
      </dialog>
    </CartContext.Provider>
  );
}
export function CartButton() {
  const { items, open, copy } = useCart();
  return (
    <button className="icon-button cart-trigger" aria-label={copy.cart} onClick={open}>
      <ShoppingBag size={21} />
      <span>{items.reduce((n, i) => n + i.quantity, 0)}</span>
    </button>
  );
}
export function CartLines() {
  const { items, update, copy } = useCart();
  if (!items.length)
    return (
      <div className="empty">
        <ShoppingBag size={40} />
        <p>{copy.empty}</p>
      </div>
    );
  return (
    <div className="cart-lines">
      {items.map((i) => (
        <article className="cart-line" key={i.key}>
          <img src={i.image || '/favicon.svg'} alt="" />
          <div>
            <Link href={`/product/${i.slug}`}>
              <b>{i.name}</b>
            </Link>
            <p className="small muted">
              {i.variantName} {Object.values(i.options || {}).join(' / ')}
            </p>
            <b>{money(i.price)}</b>
            <div className="row between">
              <div className="quantity">
                <button
                  aria-label="Decrease quantity"
                  onClick={() => update(i.key, i.quantity - 1)}
                >
                  <Minus size={14} />
                </button>
                <span>{i.quantity}</span>
                <button
                  aria-label="Increase quantity"
                  onClick={() => update(i.key, i.quantity + 1)}
                >
                  <Plus size={14} />
                </button>
              </div>
              <button className="text-link small" onClick={() => update(i.key, 0)}>
                {copy.remove}
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
