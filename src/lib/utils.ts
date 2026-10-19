export function money(value: number) {
  // Prices are whole MKD. Keep the same separators during server rendering and
  // hydration even in browsers that fall back from the Macedonian ICU locale.
  return `${Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')} ден.`;
}
export const siteUrl = () =>
  (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
export const serialize = <T>(data: T): T => JSON.parse(JSON.stringify(data));
export function safeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
