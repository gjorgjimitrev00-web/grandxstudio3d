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
