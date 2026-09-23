import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  Tags,
  ShoppingBag,
  Users,
  Layers3,
  Settings,
  Mail,
  Send,
  ArrowUpRight,
} from 'lucide-react';
import { currentUser } from '@/lib/security';
import { Logo } from '@/components/header';
import { ActionButton } from '@/components/api-form';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Studio dashboard', robots: { index: false, follow: false } };
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user || user.role !== 'ADMIN') redirect('/admin/login');
  const nav = [
    ['/admin', 'Overview', LayoutDashboard],
    ['/admin/products', 'Products', Package],
    ['/admin/categories', 'Categories', Tags],
    ['/admin/orders', 'Orders', ShoppingBag],
    ['/admin/customers', 'Customers', Users],
    ['/admin/custom-orders', 'Custom prints', Layers3],
    ['/admin/messages', 'Messages', Mail],
    ['/admin/newsletter', 'Newsletter', Send],
    ['/admin/settings', 'Settings', Settings],
  ] as const;
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link href="/admin">
          <Logo />
        </Link>
        <p className="eyebrow muted">STUDIO MANAGEMENT</p>
        <nav>
          {nav.map(([href, label, Icon]) => (
            <Link key={href} href={href}>
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <Link className="text-link" href="/">
          Open store <ArrowUpRight size={16} />
        </Link>
        <div className="admin-user">
          <p>{user.name}</p>
          <small>{user.email}</small>
          <ActionButton endpoint="/api/auth/logout" redirect="/admin/login">
            Sign out
          </ActionButton>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <span>GrandXStudio / Studio dashboard</span>
          <span className="status-pill">CASH ON DELIVERY · MKD</span>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
