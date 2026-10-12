/**
 * Domain errors. Services throw these; the HTTP layer maps them to status codes and a
 * consistent JSON envelope: { error: { code, message, fields? } }.
 * Anything that is not an AppError is treated as an unexpected 500 and its details are
 * logged server-side only.
 */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INSUFFICIENT_STOCK"
  | "INVALID_TRANSITION"
  | "RATE_LIMITED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INSUFFICIENT_STOCK: 409,
  INVALID_TRANSITION: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export type FieldErrors = Record<string, string>;

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fields?: FieldErrors,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    this.status = STATUS[code];
  }
}

export const validationError = (message: string, fields?: FieldErrors) =>
  new AppError("VALIDATION_ERROR", message, fields);
export const notFound = (what = "Resource") => new AppError("NOT_FOUND", `${what} not found`);
export const forbidden = (message = "You do not have permission to do that") =>
  new AppError("FORBIDDEN", message);
export const unauthenticated = () => new AppError("UNAUTHENTICATED", "Sign in to continue");
export const conflict = (message: string, fields?: FieldErrors) => new AppError("CONFLICT", message, fields);

/** Postgres error helpers */
export function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}
export function pgConstraint(err: unknown): string | undefined {
  const e = err as { constraint?: string; cause?: { constraint?: string } };
  return e?.constraint ?? e?.cause?.constraint;
}
export const PG_UNIQUE_VIOLATION = "23505";
export const PG_CHECK_VIOLATION = "23514";
export const PG_FK_VIOLATION = "23503";
