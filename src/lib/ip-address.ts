import { isIP } from 'node:net';

export function ipNumber(raw: string): { version: 4 | 6; value: bigint } | null {
  const ip = raw.trim().toLowerCase();
  if (ip.includes('%')) return null;
  const version = isIP(ip);
  if (!version) return null;
  if (version === 4)
    return {
      version: 4,
      value: ip.split('.').reduce((value, part) => (value << 8n) + BigInt(part), 0n),
    };
  let expanded = ip;
  if (ip.includes('.')) {
    const colon = ip.lastIndexOf(':');
    const tail = ipNumber(ip.slice(colon + 1))!;
    expanded = `${ip.slice(0, colon + 1)}${(tail.value >> 16n).toString(16)}:${(tail.value & 65535n).toString(16)}`;
  }
  const [left, right] = expanded.split('::');
  const before = left ? left.split(':') : [];
  const after = right ? right.split(':') : [];
  const groups = expanded.includes('::')
    ? [...before, ...Array(8 - before.length - after.length).fill('0'), ...after]
    : before;
  const value = groups.reduce((total, group) => (total << 16n) + BigInt(`0x${group}`), 0n);
  if (value >> 32n === 65535n) return { version: 4, value: value & 0xffffffffn };
  return { version: 6, value };
}

const reservedV4 = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const;

export function publicIp(raw: string) {
  const ip = ipNumber(raw);
  if (!ip) return null;
  if (ip.version === 4) {
    if (
      reservedV4.some(
        ([network, bits]) =>
          ip.value >> BigInt(32 - bits) === ipNumber(network)!.value >> BigInt(32 - bits),
      )
    )
      return null;
  } else if (ip.value >> 125n !== 1n || ip.value >> 96n === 0x20010db8n) return null;
  return ip;
}

/** Forwarded headers are used for approximate analytics only, never access control. */
export function visitorIp(
  headers: Headers,
  configuredHeader = process.env.ANALYTICS_IP_HEADER || 'x-forwarded-for',
) {
  const allowed = ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip'];
  if (!allowed.includes(configuredHeader)) return null;
  const raw = headers.get(configuredHeader)?.split(',')[0]?.trim();
  return raw ? publicIp(raw) : null;
}
