/**
 * Minimal structured logger (JSON lines -> Vercel log drain). Keys that could carry
 * secrets are redacted, and errors are reduced to name/message/stack/pg code.
 */
const REDACT = /pass(word)?|token|secret|cookie|authorization|session|hash/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[depth]";
  if (value instanceof Error) {
    const e = value as Error & { code?: string; constraint?: string };
    return { name: e.name, message: e.message, code: e.code, constraint: e.constraint, stack: e.stack?.split("\n").slice(0, 6).join("\n") };
  }
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = REDACT.test(k) ? "[redacted]" : sanitize(v, depth + 1);
    return out;
  }
  return value;
}

function write(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === "test" && level === "info") return;
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...(sanitize(fields) as object) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (event: string, fields?: Record<string, unknown>) => write("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => write("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => write("error", event, fields),
};
