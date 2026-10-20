import data from '@/data/macedonia-cities.json';

const ranges = {
  4: data.ipv4.map(([start, end, city]) => ({
    start: BigInt(`0x${start}`),
    end: BigInt(`0x${end}`),
    city,
  })),
  6: data.ipv6.map(([start, end, city]) => ({
    start: BigInt(`0x${start}`),
    end: BigInt(`0x${end}`),
    city,
  })),
};
export const cityDatabaseRelease = data.release;

export function visitorCity(ip: { version: 4 | 6; value: bigint }) {
  const rows = ranges[ip.version];
  let low = 0,
    high = rows.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const row = rows[middle];
    if (ip.value < row.start) high = middle - 1;
    else if (ip.value > row.end) low = middle + 1;
    else return { country: 'MK', city: row.city };
  }
  return { country: '', city: '' };
}
