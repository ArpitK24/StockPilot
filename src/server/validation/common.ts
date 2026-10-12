import { z } from "zod";
import { validationError, type FieldErrors } from "../errors";

export const uuidSchema = z.string().uuid("Invalid id");

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof paginationSchema>;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Invalid date");

/**
 * Date filters are calendar days (YYYY-MM-DD) interpreted in the caller's IANA time
 * zone (`tz`, default UTC). `from` is inclusive, `to` is inclusive of the whole day.
 * The conversion to UTC instants happens in SQL with AT TIME ZONE, so DST is handled.
 */
export const dateRangeSchema = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    tz: z
      .string()
      .max(64)
      .refine(isValidTimeZone, "Unknown time zone")
      .default("UTC"),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: "`from` must be on or before `to`", path: ["to"] });
export type DateRange = z.infer<typeof dateRangeSchema>;

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Parse or throw a 422 with per-field messages. */
export function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw validationError("Some fields need attention", toFieldErrors(result.error));
  return result.data;
}

/** URLSearchParams -> plain object, dropping empty values so defaults apply. */
export function searchParamsToObject(sp: URLSearchParams | Record<string, string | string[] | undefined>) {
  const out: Record<string, string> = {};
  const entries = sp instanceof URLSearchParams ? sp.entries() : Object.entries(sp);
  for (const [k, v] of entries) {
    const value = Array.isArray(v) ? v[0] : v;
    if (value !== undefined && value !== "") out[k] = value;
  }
  return out;
}
