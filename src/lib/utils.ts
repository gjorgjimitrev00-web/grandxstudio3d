export function money(value: number) {
  return `${new Intl.NumberFormat('mk-MK', { maximumFractionDigits: 0 }).format(value)} ден.`;
}
export const siteUrl = () =>
  (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
export const serialize = <T>(data: T): T => JSON.parse(JSON.stringify(data));
export function safeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
