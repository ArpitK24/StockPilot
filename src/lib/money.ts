import Decimal from "decimal.js";

/**
 * Money is carried as a decimal string ("12.50") end to end. Arithmetic uses decimal.js
 * so totals never suffer binary floating-point rounding (0.1 + 0.2 !== 0.3).
 */
export const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;
export const MAX_UNIT_PRICE = new Decimal("9999999999.99");

export function toMoney(value: Decimal.Value): string {
  return new Decimal(value).toFixed(2);
}

export function lineTotal(unitPrice: string, quantity: number): string {
  return new Decimal(unitPrice).times(quantity).toFixed(2);
}

export function sumMoney(values: Decimal.Value[]): string {
  return values.reduce<Decimal>((acc, v) => acc.plus(v), new Decimal(0)).toFixed(2);
}

const formatters = new Map<string, Intl.NumberFormat>();
export function formatMoney(value: string | number, currency = "USD"): string {
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 });
    formatters.set(currency, f);
  }
  // Intl formatting of a 2dp decimal string is display-only; no arithmetic happens here.
  return f.format(Number(value));
}
