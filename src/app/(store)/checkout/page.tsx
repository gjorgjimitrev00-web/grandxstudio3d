import { db } from '@/lib/db';
import { getCopy, getLocale } from '@/lib/i18n';
import { rewardsSettings, availableGifts } from '@/lib/rewards';
import { currentUser } from '@/lib/security';
import { CheckoutForm } from '@/components/checkout-form';
export const metadata = { title: 'Checkout', robots: { index: false, follow: false } };
export default async function Checkout() {
  const copy = await getCopy();
  const methods = await db.shippingMethod.findMany({
    where: { enabled: true, country: 'MK' },
    orderBy: { createdAt: 'asc' },
  });
  methods.sort(
    (a, b) =>
      (a.kind === 'STANDARD' ? 0 : a.kind === 'PICKUP' ? 1 : 2) -
      (b.kind === 'STANDARD' ? 0 : b.kind === 'PICKUP' ? 1 : 2),
  );
  const user = await currentUser();
  const [settings, gifts, account, locale] = await Promise.all([
    rewardsSettings(),
    availableGifts(),
    user ? db.rewardsAccount.findUnique({ where: { userId: user.id } }) : null,
    getLocale(),
  ]);
  const customer = user
    ? await db.customer.findUnique({
        where: { userId: user.id },
        include: { addresses: { take: 1 } },
      })
    : null;
  const profile = customer
    ? {
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        ...customer.addresses[0],
      }
    : user
      ? { email: user.email }
      : {};
  return (
    <div className="page">
      <p className="eyebrow orange">ONE STEP CLOSER TO SOMETHING GOOD</p>
      <h1 className="page-title">{copy.checkout}</h1>
      <p className="page-intro">
        {copy.cod} · {copy.country}
      </p>
      {methods.length ? (
        <CheckoutForm
          methods={methods}
          profile={profile}
          rewards={{
            signedIn: !!user,
            enabled: settings.enabled,
            balance: account?.balance || 0,
            minimumDiscountPoints: settings.minimumDiscountPoints,
            maxDiscountPercent: settings.maxDiscountPercent,
            locale,
            gifts,
          }}
        />
      ) : (
        <div className="notice">
          Нарачките ќе бидат достапни наскоро. / Ordering will be available soon.
        </div>
      )}
    </div>
  );
}
