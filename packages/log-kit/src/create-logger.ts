import { consoleTransport } from "./transports/console.js";
import {
	LEVEL_ORDER,
	type LogLevel,
	type LogRecord,
	type Logger,
	type LoggerConfig,
	type SerializedError,
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
 * @example Performance markers
 * ```ts
 * const end = log.mark("db.query");
 * const rows = await db.query(sql);
 * end({ rowCount: rows.length });
 * ```
 *
 * @example Drain on shutdown
 * ```ts
 * const results = await log.flush();
 * const failed = results.filter((r) => !r.ok);
 * if (failed.length > 0) process.exitCode = 1;
 * ```
 */
export function createLogger(config: LoggerConfig = {}): Logger {
	const {
		level = "info",
		context: baseContext = {},
		transports = [consoleTransport()],
		now = () => new Date(),
		onTransportError,
	} = config;

	const threshold = LEVEL_ORDER[level];

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

	const log = (
		recordLevel: LogLevel,
		messageOrError: string | Error,
		callContext?: Record<string, unknown>,
	): void => {
		if (!isLevelEnabled(recordLevel)) return;

		const isError = messageOrError instanceof Error;
		const message = isError ? messageOrError.message : messageOrError;

		const record: LogRecord = {
			timestamp: now().toISOString(),
			level: recordLevel,
			message,
			context: { ...baseContext, ...callContext },
		};
		if (isError) {
			record.error = serializeError(messageOrError);
		}

		dispatch(record);
	};

	const mark = (
		label: string,
		options: { level?: LogLevel } = {},
	): ((extra?: Record<string, unknown>) => void) => {
		const markLevel = options.level ?? "info";
		// Skip the timing measurement entirely if the level isn't enabled -
		// the timer would never produce a record anyway.
		if (!isLevelEnabled(markLevel)) {
			return () => undefined;
		}
		const start = monotonicNow();
		return (extra) => {
			const durationMs = Math.round((monotonicNow() - start) * 100) / 100;
			log(markLevel, label, { durationMs, ...extra });
		};
	};

	const flush = async (): Promise<TransportStatus[]> => {
		// Resolve each transport's flush independently; collect per-transport
		// status so callers can detect partial drain failures.
		return Promise.all(
			transports.map(async (t): Promise<TransportStatus> => {
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

	const child = (childContext: Record<string, unknown>): Logger => {
		const childConfig: LoggerConfig = {
			level,
			context: { ...baseContext, ...childContext },
			transports,
			now,
		};
		// `exactOptionalPropertyTypes` rejects passing `undefined` explicitly,
		// so only attach onTransportError if the parent had one.
		if (onTransportError) childConfig.onTransportError = onTransportError;
		return createLogger(childConfig);
	};

	return {
		isLevelEnabled,
		trace: (m, c) => log("trace", m, c),
		debug: (m, c) => log("debug", m, c),
		info: (m, c) => log("info", m, c),
		warn: (m, c) => log("warn", m, c),
		error: (m, c) => log("error", m, c),
		fatal: (m, c) => log("fatal", m, c),
		child,
		mark,
		flush,
	};
}

export type { Logger, LoggerConfig, LogLevel, LogRecord, Transport };
