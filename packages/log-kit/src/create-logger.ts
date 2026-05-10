import { consoleTransport } from "./transports/console.js";
import {
	LEVEL_ORDER,
	type LogLevel,
	type LogRecord,
	type Logger,
	type LoggerConfig,
	type Transport,
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

function serializeError(err: Error): { name: string; message: string; stack?: string } {
	const out: { name: string; message: string; stack?: string } = {
		name: err.name,
		message: err.message,
	};
	if (err.stack) out.stack = err.stack;
	return out;
}

/**
 * Create a structured logger.
 *
 * The logger fans out every record to all configured transports. Transports
 * run independently - one slow or failing transport never blocks the others
 * and never propagates errors to the caller.
 *
 * @example Basic logger
 * ```ts
 * import { createLogger } from "@arshad-shah/log-kit";
 *
 * const log = createLogger({ level: "info" });
 * log.info("Server started", { port: 3000 });
 * ```
 *
 * @example With multiple transports
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
 * });
 * ```
 *
 * @example Performance markers
 * ```ts
 * const end = log.mark("db.query");
 * const rows = await db.query(sql);
 * end({ rowCount: rows.length });
 * ```
 */
export function createLogger(config: LoggerConfig = {}): Logger {
	const {
		level = "info",
		context: baseContext = {},
		transports = [consoleTransport()],
		now = () => new Date(),
	} = config;

	const threshold = LEVEL_ORDER[level];

	const isLevelEnabled = (l: LogLevel): boolean => LEVEL_ORDER[l] >= threshold;

	const dispatch = (record: LogRecord): void => {
		for (const transport of transports) {
			try {
				const result = transport.write(record);
				if (result instanceof Promise) {
					// Don't await; transports run fire-and-forget. Catch rejections so
					// they don't surface as unhandled.
					result.catch(() => {
						/* noop - transport failures must not break logging */
					});
				}
			} catch {
				/* noop */
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
		const start = monotonicNow();
		const markLevel = options.level ?? "info";
		return (extra) => {
			const durationMs = Math.round((monotonicNow() - start) * 100) / 100;
			log(markLevel, label, { durationMs, ...extra });
		};
	};

	const flush = async (): Promise<void> => {
		await Promise.allSettled(
			transports.map((t) => {
				try {
					return Promise.resolve(t.flush?.());
				} catch (err) {
					return Promise.reject(err);
				}
			}),
		);
	};

	const child = (childContext: Record<string, unknown>): Logger =>
		createLogger({
			level,
			context: { ...baseContext, ...childContext },
			transports,
			now,
		});

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
