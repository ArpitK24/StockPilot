/**
 * Calendar-day -> UTC instant conversion done in JS (Intl, DST-aware) instead of SQL
 * `AT TIME ZONE`. Browsers report legacy IANA aliases (e.g. "Asia/Calcutta") that some
 * Postgres builds don't recognise, so the database only ever sees plain timestamptz values.
 */
function offsetMs(at: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** The UTC instant at which `day` (YYYY-MM-DD) starts in `tz`. */
export function startOfDayIn(day: string, tz: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let at = guess - offsetMs(guess, tz);
  at = guess - offsetMs(at, tz); // second pass settles DST transitions
  return new Date(at);
}

export function nextDay(day: string): string {
  const dt = new Date(`${day}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

/** [start, end) instants covering calendar days `from`..`to` inclusive in `tz`. */
export function dayRangeToInstants(range: { from?: string; to?: string; tz: string }) {
  return {
    start: range.from ? startOfDayIn(range.from, range.tz) : undefined,
    end: range.to ? startOfDayIn(nextDay(range.to), range.tz) : undefined,
  };
}
