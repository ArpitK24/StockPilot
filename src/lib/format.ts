export function formatDateTime(value: string | Date, tz?: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(value));
}
export function formatDate(value: string | Date, tz?: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: tz }).format(new Date(value));
}
export function relativeTime(value: string | Date, now = Date.now()) {
  const diff = (new Date(value).getTime() - now) / 1000;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}
export const orderNo = (n: number) => `#${n}`;
export const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export const MOVEMENT_LABEL: Record<string, string> = {
  received: "Received",
  returned: "Returned",
  correction: "Count correction",
  damaged: "Damaged",
  lost: "Lost / shrinkage",
  order_reserved: "Reserved by order",
  order_released: "Released by cancel",
};
