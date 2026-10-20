import { createHmac } from 'node:crypto';
import { visitorIp } from './ip-address';
import { studioDay } from './time';

export const VISITOR_RETENTION_DAYS = 35;
const bots =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|facebookexternalhit|preview|monitor|uptime/i;

export function visitIdentity(headers: Headers, secret: string, now = new Date()) {
  if (headers.get('dnt') === '1' || headers.get('sec-gpc') === '1') return null;
  const agent = headers.get('user-agent')?.trim().slice(0, 512);
  if (!agent || bots.test(agent)) return null;
  const ip = visitorIp(headers);
  if (!ip) return null;
  const day = studioDay(now);
  const visitorHash = createHmac('sha256', secret)
    .update(`visitors:v1:${day}:${ip.version}:${ip.value.toString(16)}:${agent}`)
    .digest('hex');
  return { day, visitorHash, ip };
}
