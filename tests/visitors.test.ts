import test from 'node:test';
import assert from 'node:assert/strict';
import { ipNumber, publicIp, visitorIp } from '../src/lib/ip-address';
import { visitIdentity } from '../src/lib/visitor-rules';
import { visitorCity } from '../src/lib/visitor-geo';
import data from '../src/data/macedonia-cities.json';

const requestHeaders = () =>
  new Headers({ 'x-forwarded-for': '5.32.177.1, 10.0.0.1', 'user-agent': 'Mozilla/5.0 QA' });
test('only public IPv4/IPv6 addresses are accepted; mapped IPv4 normalizes consistently', () => {
  assert.deepEqual(ipNumber('::ffff:5.32.177.1'), ipNumber('5.32.177.1'));
  assert.deepEqual(
    ipNumber('2001:470:1f0::1'),
    ipNumber('2001:0470:01f0:0000:0000:0000:0000:0001'),
  );
  for (const invalid of [
    '127.0.0.1',
    '10.1.1.1',
    '192.168.1.1',
    '100.64.2.1',
    '::1',
    'fe80::1',
    'fe80::1%en0',
    '2001:db8::1',
    '224.0.0.1',
    '1.2.3.999',
    'bad',
  ])
    assert.equal(publicIp(invalid), null, invalid);
  assert.deepEqual(visitorIp(requestHeaders(), 'x-forwarded-for'), publicIp('5.32.177.1'));
  assert.equal(visitorIp(requestHeaders(), 'authorization'), null);
  assert.equal(visitorIp(new Headers(), 'x-forwarded-for'), null);
});
test('daily hashes deduplicate repeats, rotate at Skopje midnight and obey browser privacy signals', () => {
  const now = new Date('2026-10-19T21:59:00Z');
  const one = visitIdentity(requestHeaders(), 'a'.repeat(32), now)!;
  assert.equal(one.visitorHash.length, 64);
  assert.equal(one.day, '2026-10-19');
  assert.equal(one.visitorHash, visitIdentity(requestHeaders(), 'a'.repeat(32), now)!.visitorHash);
  assert.notEqual(
    one.visitorHash,
    visitIdentity(requestHeaders(), 'b'.repeat(32), now)!.visitorHash,
  );
  assert.notEqual(
    one.visitorHash,
    visitIdentity(requestHeaders(), 'a'.repeat(32), new Date('2026-10-19T22:00:00Z'))!.visitorHash,
  );
  for (const [key, value] of [
    ['dnt', '1'],
    ['sec-gpc', '1'],
    ['user-agent', 'Googlebot'],
    ['user-agent', ''],
  ]) {
    const headers = requestHeaders();
    headers.set(key, value);
    assert.equal(visitIdentity(headers, 'secret', now), null);
  }
});
test('bundled city data locates both boundaries of every range and leaves unmatched locations unknown', () => {
  for (const version of [4, 6] as const) {
    const rows = version === 4 ? data.ipv4 : data.ipv6;
    let previous = -1n;
    for (const [start, end, city] of rows) {
      const first = BigInt(`0x${start}`),
        last = BigInt(`0x${end}`);
      assert.ok(first > previous && last >= first, 'sorted non-overlapping ranges');
      assert.deepEqual(visitorCity({ version, value: first }), { country: 'MK', city });
      assert.deepEqual(visitorCity({ version, value: last }), { country: 'MK', city });
      previous = last;
    }
  }
  assert.deepEqual(visitorCity(publicIp('5.32.177.1')!), { country: 'MK', city: 'Skopje' });
  assert.deepEqual(visitorCity(publicIp('2001:470:1f0::1')!), { country: 'MK', city: 'Skopje' });
  assert.deepEqual(visitorCity(publicIp('8.8.8.8')!), { country: '', city: '' });
});
