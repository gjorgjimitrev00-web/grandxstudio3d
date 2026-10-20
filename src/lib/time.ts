/** Convert a calendar date in Europe/Skopje to its UTC midnight, including DST. */
export function skopjeMidnight(year: number, month: number, day: number) {
  const target = Date.UTC(year, month - 1, day);
  let instant = target;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Skopje',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(
      formatter.formatToParts(new Date(instant)).map((p) => [p.type, p.value]),
    );
    const local = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour),
      Number(p.minute),
      Number(p.second),
    );
    instant += target - local;
  }
  return new Date(instant);
}
export function reportingPeriods(now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Skopje',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    today: skopjeMidnight(Number(p.year), Number(p.month), Number(p.day)),
    month: skopjeMidnight(Number(p.year), Number(p.month), 1),
  };
}

/** ISO calendar key for the studio's local day, independent of the server timezone. */
export function studioDay(now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Skopje',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}

export function validDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function shiftDay(day: string, amount: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function studioDayStart(day: string) {
  if (!validDay(day)) throw new Error('Invalid calendar date.');
  const [year, month, date] = day.split('-').map(Number);
  return skopjeMidnight(year, month, date);
}
