/**
 * Severity levels in increasing order. Logger configured at level `info`
 * passes everything `info` and above; `debug` is suppressed.
 */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

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
	/** ISO 8601 timestamp at record creation. */
	timestamp: string;
	/** Severity level. */
	level: LogLevel;
	/** Human-readable message. */
	message: string;
	/** Structured context attached at the log call or via `child()`. */
	context: Record<string, unknown>;
	/** Optional error, if `.error()` was called with one. */
	error?: SerializedError;
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
 * Configuration for {@link createLogger}.
 */
export type LoggerConfig = {
	/** Minimum level to emit. Records below this are dropped. Defaults to `"info"`. */
	level?: LogLevel;
	/** Static context merged into every record. */
	context?: Record<string, unknown>;
	/** Transports to fan out to. Defaults to `[consoleTransport()]`. */
	transports?: Transport[];
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
	 * Create a child logger that prepends the given context to every record.
	 * Useful for request-scoped or component-scoped loggers.
	 */
	child: (context: Record<string, unknown>) => Logger;

	/**
	 * Start a performance marker. Returns a function that, when called,
	 * emits a record with `durationMs` measured from the start.
	 *
	 * @example
	 * ```ts
	 * const end = logger.mark("query.users");
	 * const users = await db.users.find();
	 * end({ count: users.length });
	 * // -> { level: "info", message: "query.users", context: { durationMs: 12, count: 50 } }
	 * ```
	 */
	mark: (
		label: string,
		options?: { level?: LogLevel },
	) => (extraContext?: Record<string, unknown>) => void;

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
