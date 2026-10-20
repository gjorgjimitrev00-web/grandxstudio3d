/**
 * Download DB-IP's public monthly city database, retaining only MK ranges.
 * No visitor data is sent. Run: node --import tsx scripts/update-city-data.ts YYYY-MM
 */
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { ipNumber } from '../src/lib/ip-address';

function csvRow(line: string) {
  const fields: string[] = [];
  let value = '',
    quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      fields.push(value);
      value = '';
    } else value += ch;
  }
  if (quoted) throw new Error('Unexpected multiline record in the MK subset.');
  fields.push(value);
  return fields;
}
async function main() {
  const release = process.argv[2] || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(release)) throw new Error('Use YYYY-MM.');
  const source = `https://download.db-ip.com/free/dbip-city-lite-${release}.csv.gz`;
  const response = await fetch(source, { signal: AbortSignal.timeout(180000) });
  if (!response.ok || !response.body)
    throw new Error(`Database download failed: ${response.status}`);
  const stream = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream).pipe(
    createGunzip(),
  );
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  const rows: Record<4 | 6, [string, string, string][]> = { 4: [], 6: [] };
  for await (const line of lines) {
    if (!line.includes(',MK,') && !line.includes(',"MK",')) continue;
    const fields = csvRow(line);
    if (fields.length !== 8 || fields[3] !== 'MK') continue;
    const from = ipNumber(fields[0]),
      to = ipNumber(fields[1]);
    if (!from || !to || from.version !== to.version || from.value > to.value)
      throw new Error('Invalid IP range in source.');
    const city = fields[5]
      .replace(/[\x00-\x1f\x7f]/g, '')
      .trim()
      .slice(0, 120);
    rows[from.version].push([from.value.toString(16), to.value.toString(16), city]);
  }
  for (const version of [4, 6] as const) {
    rows[version].sort((a, b) => (BigInt(`0x${a[0]}`) < BigInt(`0x${b[0]}`) ? -1 : 1));
    for (let i = 1; i < rows[version].length; i++)
      if (BigInt(`0x${rows[version][i - 1][1]}`) >= BigInt(`0x${rows[version][i][0]}`))
        throw new Error('Overlapping ranges in source.');
  }
  if (rows[4].length < 20 || !rows[6].length)
    throw new Error('Incomplete MK database; existing data retained.');
  const target = resolve('src/data/macedonia-cities.json');
  await mkdir(dirname(target), { recursive: true });
  await writeFile(
    `${target}.tmp`,
    JSON.stringify({
      provider: 'DB-IP Lite',
      license: 'CC BY 4.0',
      attribution: 'https://db-ip.com/',
      release,
      source,
      note: 'Modified: only North Macedonia ranges and city names; other fields removed.',
      ipv4: rows[4],
      ipv6: rows[6],
    }) + '\n',
  );
  await rename(`${target}.tmp`, target);
  console.log(
    `Saved ${rows[4].length} IPv4 and ${rows[6].length} IPv6 MK city ranges (${release}).`,
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
