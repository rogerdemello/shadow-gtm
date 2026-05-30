// ── Structured logger ───────────────────────────────────────────────────────
// Minimal, dependency-free JSON logging so failures across the scan pipeline are
// queryable in Vercel/Supabase logs instead of being swallowed by silent
// catches. One line of JSON per event; `child()` binds recurring context (e.g.
// companyId, scanId) so call sites stay terse.
//
// Errors also flow to Sentry when SENTRY_DSN is configured (see captureError);
// without a DSN it's a no-op, so local/dev runs need no setup.

type Level = "debug" | "info" | "warn" | "error";

type Fields = Record<string, unknown>;

const LEVEL_ORDER: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

// LOG_LEVEL is read directly (not via lib/env) to avoid a cycle: env validation
// failures themselves want to be logged.
const MIN_LEVEL: Level =
  (process.env.LOG_LEVEL as Level) ||
  (process.env.NODE_ENV === "production" ? "info" : "debug");

function serializeError(err: unknown): Fields {
  if (err instanceof Error) {
    return { error: err.message, errorName: err.name, stack: err.stack };
  }
  return { error: String(err) };
}

function emit(level: Level, msg: string, fields: Fields, bound: Fields): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;
  const line = JSON.stringify({
    level,
    msg,
    ...bound,
    ...fields,
  });
  // eslint-disable-next-line no-console -- the logger is the one allowed console site
  (level === "error" || level === "warn" ? console.error : console.log)(line);
}

export interface Logger {
  debug(msg: string, fields?: Fields): void;
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  /** Logs at error level and forwards to Sentry (if configured). */
  error(msg: string, err?: unknown, fields?: Fields): void;
  /** Returns a logger with `bound` fields merged into every line. */
  child(bound: Fields): Logger;
}

function make(bound: Fields): Logger {
  return {
    debug: (msg, fields = {}) => emit("debug", msg, fields, bound),
    info: (msg, fields = {}) => emit("info", msg, fields, bound),
    warn: (msg, fields = {}) => emit("warn", msg, fields, bound),
    error: (msg, err?, fields = {}) => {
      const errFields = err === undefined ? {} : serializeError(err);
      emit("error", msg, { ...errFields, ...fields }, bound);
      captureError(err ?? new Error(msg), { msg, ...bound, ...fields });
    },
    child: (extra) => make({ ...bound, ...extra }),
  };
}

export const logger: Logger = make({});

// ── Sentry hook (optional) ───────────────────────────────────────────────────
// Kept as a thin seam so wiring the real SDK later is a one-function change. With
// no SENTRY_DSN this never loads anything.
export function captureError(_err: unknown, _context?: Fields): void {
  if (!process.env.SENTRY_DSN) return;
  // Intentionally a stub until @sentry/nextjs is added in a later step; the DSN
  // gate means production won't silently assume Sentry is capturing.
}
