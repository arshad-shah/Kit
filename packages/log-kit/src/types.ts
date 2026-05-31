/**
 * Severity levels in increasing order. Logger configured at level `info`
 * passes everything `info` and above; `debug` is suppressed.
 */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/**
 * A level accepted by {@link LoggerConfig.level}. In addition to the six
 * record levels, `"silent"` disables output entirely — nothing is emitted and
 * `isLevelEnabled` returns `false` for every level. Use it to fully mute a
 * logger (e.g. a host that does its own gating) instead of leaning on `trace`.
 */
export type LevelSetting = LogLevel | "silent";

/**
 * Canonical numeric ordering for level comparisons.
 *
 * Used both for the logger's own threshold check and by transports (e.g. the
 * HTTP transport's per-transport level filter). Anything inside the package
 * needing to compare levels should import this rather than re-deriving it.
 */
export const LEVEL_ORDER: Readonly<Record<LogLevel, number>> = Object.freeze({
	trace: 10,
	debug: 20,
	info: 30,
	warn: 40,
	error: 50,
	fatal: 60,
});

/**
 * Serialized representation of an Error, safe to JSON-encode and ship to a
 * transport. Captures the common fields plus the `cause` chain (recursive,
 * depth-capped) and Node-style `code` for I/O errors.
 */
export type SerializedError = {
	name: string;
	message: string;
	stack?: string;
	/** Node-style error code, e.g. `"ENOENT"` or numeric `errno`. */
	code?: string | number;
	/** Recursive cause chain (from `new Error(..., { cause })`). Depth-capped at 3. */
	cause?: SerializedError;
};

/**
 * A structured log record. Transports receive these and decide what to do.
 *
 * Records are plain JSON-serializable objects with no methods. The shape is
 * stable - transports can safely persist or transmit them.
 */
export type LogRecord = {
	/**
	 * Timestamp at record creation. An ISO 8601 string by default; a number
	 * (epoch ms) or other shape when {@link LoggerConfig.timestamp} is set.
	 */
	timestamp: string | number;
	/** Severity level. */
	level: LogLevel;
	/** Human-readable message (or a printf-style template when {@link args} is set). */
	message: string;
	/** Structured context attached at the log call or via `child()`. */
	context: Record<string, unknown>;
	/** Optional error, if `.error()` was called with one. */
	error?: SerializedError;
	/**
	 * Hierarchical scope, e.g. `"app:manifest"`, set via `child(name)`. A
	 * presentation transport can render it as a prefix.
	 */
	scope?: string;
	/**
	 * Presentation tag a transport can map to a badge or colour without
	 * abusing `level` (e.g. `"success"` → green ✔). log-kit never interprets it.
	 */
	kind?: string;
	/**
	 * Host-owned passthrough payload. log-kit never reads or mutates this — it
	 * is a first-class escape hatch for wrappers that need to carry their own
	 * entry shape (presentation data, original call, etc.) to a transport,
	 * keeping `context` for the user's structured data.
	 */
	meta?: Record<string, unknown>;
	/**
	 * Extra printf-style arguments for {@link message}. The console transport
	 * substitutes `%s/%d/%i/%f/%j/%o/%O/%%`; JSON transports keep them
	 * alongside the template.
	 */
	args?: unknown[];
};

/**
 * Full-control input for {@link Logger.log}. Lets a host build a record with
 * any of the first-class fields (`meta`, `kind`, `args`) that the convenience
 * methods (`info`, `warn`, …) don't expose, without smuggling them through
 * `context`.
 */
export type LogInput = {
	/** Severity level. */
	level: LogLevel;
	/** Message string, or an `Error` to capture name/message/stack/cause/code. */
	message: string | Error;
	/** Structured context, merged over the logger's base context. */
	context?: Record<string, unknown>;
	/** Host passthrough payload (see {@link LogRecord.meta}). */
	meta?: Record<string, unknown>;
	/** Presentation tag (see {@link LogRecord.kind}). */
	kind?: string;
	/** printf-style arguments for `message` (see {@link LogRecord.args}). */
	args?: unknown[];
};

/**
 * A transport receives every record at or above the logger's threshold.
 *
 * Errors thrown or rejected by a transport never propagate to the caller.
 * Configure `LoggerConfig.onTransportError` if you want to observe them.
 */
export type Transport = {
	/** Identifier for diagnostics; not required to be unique. */
	name: string;
	/** Send a record. May be sync or async; the logger does not await. */
	write: (record: LogRecord) => void | Promise<void>;
	/** Optional flush hook called by `logger.flush()`. */
	flush?: () => void | Promise<void>;
};

/**
 * Result of flushing a single transport. Returned by `logger.flush()` so
 * callers can detect partial-drain failures (e.g. before exiting a serverless
 * handler) instead of treating "the promise resolved" as success.
 */
export type TransportStatus =
	| { name: string; ok: true }
	| { name: string; ok: false; error: unknown };

/**
 * Information passed to `LoggerConfig.onTransportError`.
 */
export type TransportErrorInfo = {
	/** The transport's `name`. */
	transport: string;
	/** Whether the failure occurred during a record write or a flush. */
	op: "write" | "flush";
};

/**
 * Controls how a record's `timestamp` is produced.
 *
 * - `"iso"` (default): `date.toISOString()` — an ISO 8601 string.
 * - `"epoch"`: `date.getTime()` — epoch milliseconds as a number.
 * - a function: receives the raw `Date` and returns whatever wire shape your
 *   host's contract requires.
 */
export type TimestampFormat = "iso" | "epoch" | ((date: Date) => string | number);

/**
 * Configuration for {@link createLogger}.
 */
export type LoggerConfig = {
	/**
	 * Minimum level to emit. Records below this are dropped. `"silent"` mutes
	 * the logger entirely. Defaults to `"info"`.
	 */
	level?: LevelSetting;
	/** Static context merged into every record. */
	context?: Record<string, unknown>;
	/** Initial hierarchical scope (see `child(name)`). */
	scope?: string;
	/** Separator used when nesting scopes via `child(name)`. Defaults to `":"`. */
	scopeSeparator?: string;
	/** Transports to fan out to. Defaults to `[consoleTransport()]`. */
	transports?: Transport[];
	/** How to format the record timestamp. Defaults to `"iso"`. */
	timestamp?: TimestampFormat;
	/**
	 * Optional clock for deterministic tests. Defaults to `() => new Date()`.
	 */
	now?: () => Date;
	/**
	 * Diagnostic hook fired when a transport `write` or `flush` throws or
	 * rejects. Failures are still swallowed so logging keeps working — this
	 * hook is purely for observability (dev consoles, error tracking, etc.).
	 *
	 * Inherited by child loggers created via `logger.child()`.
	 */
	onTransportError?: (error: unknown, info: TransportErrorInfo) => void;
};

/**
 * The logger interface.
 */
export type Logger = {
	/** Returns true if the given level would be emitted. */
	isLevelEnabled: (level: LogLevel) => boolean;

	trace: (message: string, context?: Record<string, unknown>) => void;
	debug: (message: string, context?: Record<string, unknown>) => void;
	info: (message: string, context?: Record<string, unknown>) => void;
	warn: (message: string, context?: Record<string, unknown>) => void;
	/**
	 * Log an error. Pass an Error instance to capture name/message/stack/cause/code,
	 * or a message string with optional context.
	 */
	error: (messageOrError: string | Error, context?: Record<string, unknown>) => void;
	fatal: (messageOrError: string | Error, context?: Record<string, unknown>) => void;

	/**
	 * Low-level structured log with full control over the record — including
	 * `meta`, `kind`, and `args`, which the convenience methods don't expose.
	 * The escape hatch for wrappers that build their own entries.
	 *
	 * @example
	 * ```ts
	 * log.log({
	 *   level: "info",
	 *   message: "built %s in %dms",
	 *   args: ["index.js", 12],
	 *   kind: "success",
	 *   meta: { entry: hostEntry },
	 * });
	 * ```
	 */
	log: (input: LogInput) => void;

	/**
	 * Create a child logger.
	 *
	 * - `child(context)` prepends a context object to every record.
	 * - `child(name)` / `child(name, context)` nests a string **scope**
	 *   (`parent:child`) that transports can render as a prefix — ideal for
	 *   hierarchical CLI loggers (`app`, `app:manifest`).
	 *
	 * Children share the parent's transports (including any added later via
	 * `addTransport`) and inherit its level, timestamp format, and
	 * `onTransportError`.
	 */
	child: {
		(context: Record<string, unknown>): Logger;
		(name: string, context?: Record<string, unknown>): Logger;
	};

	/**
	 * Start a performance marker. Returns a function that, when called, emits a
	 * record with `durationMs` measured from the start **and returns that
	 * duration** so callers can reuse the number.
	 *
	 * The duration is returned even when the level is disabled (no record is
	 * emitted in that case).
	 *
	 * @example
	 * ```ts
	 * const end = logger.mark("query.users");
	 * const users = await db.users.find();
	 * const ms = end({ count: users.length }); // logs, and ms is reusable
	 * ```
	 */
	mark: (
		label: string,
		options?: { level?: LogLevel },
	) => (extraContext?: Record<string, unknown>) => number;

	/** Add a transport at runtime. Affects this logger and its children. */
	addTransport: (transport: Transport) => void;
	/**
	 * Remove transports at runtime. With a `name`, removes every transport with
	 * that name; without one, removes all. Returns the number removed.
	 */
	removeTransport: (name?: string) => number;

	/**
	 * Flush all transports. Returns a per-transport status so callers can
	 * detect drains that failed (e.g. before exiting a serverless handler).
	 *
	 * The promise always resolves; failures appear as `{ ok: false, error }`
	 * entries in the returned array and are also reported via
	 * `LoggerConfig.onTransportError` if configured.
	 */
	flush: () => Promise<TransportStatus[]>;
};
