import { consoleTransport } from "./transports/console.js";
import {
	LEVEL_ORDER,
	type LevelSetting,
	type LogInput,
	type LogLevel,
	type LogRecord,
	type Logger,
	type LoggerConfig,
	type SerializedError,
	type TimestampFormat,
	type Transport,
	type TransportStatus,
} from "./types.js";

/**
 * Use `performance.now()` when available (browser, modern Node) for sub-ms
 * resolution; fall back to `Date.now()`. Both return millisecond units.
 */
const monotonicNow = (): number => {
	if (typeof performance !== "undefined" && typeof performance.now === "function") {
		return performance.now();
	}
	return Date.now();
};

/**
 * Resolve a {@link TimestampFormat} to a function that turns a `Date` into the
 * value placed in `record.timestamp`.
 */
function resolveTimestamp(format: TimestampFormat): (date: Date) => string | number {
	if (typeof format === "function") return format;
	if (format === "epoch") return (d) => d.getTime();
	return (d) => d.toISOString();
}

/**
 * Serialize an Error into a plain object suitable for JSON transport.
 *
 * Captures: name, message, stack, `cause` (recursively, up to a small depth
 * to prevent cycles), and Node-style `code` if present. Anything else gets
 * dropped to keep records compact.
 */
function serializeError(err: Error, depth = 0): SerializedError {
	const out: SerializedError = {
		name: err.name,
		message: err.message,
	};
	if (err.stack) out.stack = err.stack;
	const code = (err as Error & { code?: unknown }).code;
	if (typeof code === "string" || typeof code === "number") {
		out.code = code;
	}
	// Cap recursion to avoid pathological cause cycles. Three levels is plenty
	// for typical Node error chains (Net → IO → user code).
	if (depth < 3 && err.cause instanceof Error) {
		out.cause = serializeError(err.cause, depth + 1);
	}
	return out;
}

/**
 * Fully-resolved logger state, shared (where appropriate) between a logger and
 * its children. `transports` is a single mutable array so `addTransport` /
 * `removeTransport` on any logger in the family are seen by the others.
 */
type LoggerState = {
	threshold: number;
	baseContext: Record<string, unknown>;
	scope: string | undefined;
	scopeSeparator: string;
	transports: Transport[];
	formatTimestamp: (date: Date) => string | number;
	now: () => Date;
	onTransportError: LoggerConfig["onTransportError"];
};

/**
 * `"silent"` mutes everything; map it to a threshold no record level reaches.
 */
function thresholdFor(level: LevelSetting): number {
	return level === "silent" ? Number.POSITIVE_INFINITY : LEVEL_ORDER[level];
}

/**
 * Create a structured logger.
 *
 * The logger fans out every record to all configured transports. Transports
 * run independently — one slow or failing transport never blocks the others
 * and never propagates errors to the caller. Pass `onTransportError` to be
 * notified when a transport throws or rejects.
 *
 * @example Basic logger
 * ```ts
 * import { createLogger } from "@arshad-shah/log-kit";
 *
 * const log = createLogger({ level: "info" });
 * log.info("Server started", { port: 3000 });
 * ```
 *
 * @example With multiple transports + diagnostics
 * ```ts
 * import { createLogger } from "@arshad-shah/log-kit";
 * import { consoleTransport } from "@arshad-shah/log-kit/transports/console";
 * import { httpTransport } from "@arshad-shah/log-kit/transports/http";
 *
 * const log = createLogger({
 *   level: "info",
 *   transports: [
 *     consoleTransport({ pretty: true }),
 *     httpTransport({ url: "https://logs.example.com/ingest" }),
 *   ],
 *   onTransportError: (err, info) => {
 *     console.error(`[log-kit] ${info.transport} ${info.op} failed`, err);
 *   },
 * });
 * ```
 *
 * @example Scoped child loggers
 * ```ts
 * const root = createLogger({ scope: "app" });
 * const manifest = root.child("manifest"); // scope: "app:manifest"
 * manifest.info("written");
 * ```
 *
 * @example Performance markers
 * ```ts
 * const end = log.mark("db.query");
 * const rows = await db.query(sql);
 * const ms = end({ rowCount: rows.length }); // logs and returns the duration
 * ```
 */
export function createLogger(config: LoggerConfig = {}): Logger {
	const {
		level = "info",
		context: baseContext = {},
		scope,
		scopeSeparator = ":",
		transports = [consoleTransport()],
		timestamp = "iso",
		now = () => new Date(),
		onTransportError,
	} = config;

	return buildLogger({
		threshold: thresholdFor(level),
		baseContext,
		scope,
		scopeSeparator,
		// Copy so runtime add/remove never mutates the caller's array.
		transports: [...transports],
		formatTimestamp: resolveTimestamp(timestamp),
		now,
		onTransportError,
	});
}

/**
 * Build the logger closures over an already-resolved {@link LoggerState}.
 * `child` reuses this with derived state, sharing the same `transports` array.
 */
function buildLogger(state: LoggerState): Logger {
	const {
		threshold,
		baseContext,
		scope,
		scopeSeparator,
		transports,
		formatTimestamp,
		now,
		onTransportError,
	} = state;

	const isLevelEnabled = (l: LogLevel): boolean => LEVEL_ORDER[l] >= threshold;

	const reportError = (err: unknown, transport: Transport, op: "write" | "flush"): void => {
		if (!onTransportError) return;
		try {
			onTransportError(err, { transport: transport.name, op });
		} catch {
			// A bad onTransportError must never break logging.
		}
	};

	const dispatch = (record: LogRecord): void => {
		for (const transport of transports) {
			try {
				const result = transport.write(record);
				if (result instanceof Promise) {
					// Don't await; transports run fire-and-forget. Async rejections
					// surface to the diagnostic channel without breaking logging.
					result.catch((err) => reportError(err, transport, "write"));
				}
			} catch (err) {
				reportError(err, transport, "write");
			}
		}
	};

	const emit = (
		recordLevel: LogLevel,
		messageOrError: string | Error,
		extras?: {
			context?: Record<string, unknown> | undefined;
			meta?: Record<string, unknown> | undefined;
			kind?: string | undefined;
			args?: unknown[] | undefined;
		},
	): void => {
		if (!isLevelEnabled(recordLevel)) return;

		const isError = messageOrError instanceof Error;
		const message = isError ? messageOrError.message : messageOrError;

		const record: LogRecord = {
			timestamp: formatTimestamp(now()),
			level: recordLevel,
			message,
			context: { ...baseContext, ...extras?.context },
		};
		if (isError) record.error = serializeError(messageOrError);
		// Only attach optional fields when present so records stay minimal.
		if (scope) record.scope = scope;
		if (extras?.kind !== undefined) record.kind = extras.kind;
		if (extras?.meta !== undefined) record.meta = extras.meta;
		if (extras?.args && extras.args.length > 0) record.args = extras.args;

		dispatch(record);
	};

	const log = (input: LogInput): void => {
		emit(input.level, input.message, {
			context: input.context,
			meta: input.meta,
			kind: input.kind,
			args: input.args,
		});
	};

	const mark = (
		label: string,
		options: { level?: LogLevel } = {},
	): ((extra?: Record<string, unknown>) => number) => {
		const markLevel = options.level ?? "info";
		// Always measure so the caller gets the duration back even when the
		// level is disabled; only the record emission is gated.
		const start = monotonicNow();
		return (extra) => {
			const durationMs = Math.round((monotonicNow() - start) * 100) / 100;
			emit(markLevel, label, { context: { durationMs, ...extra } });
			return durationMs;
		};
	};

	const flush = async (): Promise<TransportStatus[]> => {
		// Resolve each transport's flush independently; collect per-transport
		// status so callers can detect partial drain failures. Snapshot the
		// array in case a transport mutates the set mid-flush.
		return Promise.all(
			[...transports].map(async (t): Promise<TransportStatus> => {
				if (!t.flush) return { name: t.name, ok: true };
				try {
					await t.flush();
					return { name: t.name, ok: true };
				} catch (err) {
					reportError(err, t, "flush");
					return { name: t.name, ok: false, error: err };
				}
			}),
		);
	};

	const addTransport = (transport: Transport): void => {
		transports.push(transport);
	};

	const removeTransport = (name?: string): number => {
		if (name === undefined) {
			const removed = transports.length;
			transports.length = 0;
			return removed;
		}
		let removed = 0;
		for (let i = transports.length - 1; i >= 0; i--) {
			if (transports[i]?.name === name) {
				transports.splice(i, 1);
				removed++;
			}
		}
		return removed;
	};

	const child = (
		nameOrContext: string | Record<string, unknown>,
		childContext?: Record<string, unknown>,
	): Logger => {
		const isNamed = typeof nameOrContext === "string";
		const nextScope = isNamed
			? scope
				? `${scope}${scopeSeparator}${nameOrContext}`
				: nameOrContext
			: scope;
		const mergedContext = isNamed
			? { ...baseContext, ...childContext }
			: { ...baseContext, ...nameOrContext };

		return buildLogger({
			threshold,
			baseContext: mergedContext,
			scope: nextScope,
			scopeSeparator,
			transports, // shared reference: runtime add/remove propagates
			formatTimestamp,
			now,
			onTransportError,
		});
	};

	return {
		isLevelEnabled,
		trace: (m, c) => emit("trace", m, { context: c }),
		debug: (m, c) => emit("debug", m, { context: c }),
		info: (m, c) => emit("info", m, { context: c }),
		warn: (m, c) => emit("warn", m, { context: c }),
		error: (m, c) => emit("error", m, { context: c }),
		fatal: (m, c) => emit("fatal", m, { context: c }),
		log,
		child: child as Logger["child"],
		mark,
		addTransport,
		removeTransport,
		flush,
	};
}

export type { Logger, LoggerConfig, LogLevel, LogRecord, Transport };
