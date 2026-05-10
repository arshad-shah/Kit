import type { LogLevel, LogRecord, Transport } from "../types.js";

/**
 * HTTP transport options.
 */
export type HttpTransportOptions = {
	/** Endpoint to POST records to. */
	url: string;
	/** Headers merged into every request. */
	headers?: Record<string, string>;
	/** Buffer size before flushing. Defaults to 50. */
	batchSize?: number;
	/** Max time in ms before flushing a non-full buffer. Defaults to 5000. */
	flushIntervalMs?: number;
	/** Minimum level for this transport, independent of logger level. */
	level?: LogLevel;
	/** Custom fetch implementation. Defaults to `globalThis.fetch`. */
	fetch?: typeof fetch;
};

const LEVEL_VALUES: Record<LogLevel, number> = {
	trace: 10,
	debug: 20,
	info: 30,
	warn: 40,
	error: 50,
	fatal: 60,
};

/**
 * Build a transport that batches records and POSTs them as JSON arrays.
 *
 * Records are buffered up to `batchSize` or `flushIntervalMs`, whichever
 * comes first. Failed POSTs are dropped silently - logging must never
 * break the host application.
 *
 * Designed for fire-and-forget telemetry. For at-least-once delivery,
 * persist records to disk first via the file transport, then ship from there.
 *
 * @example
 * ```ts
 * httpTransport({
 *   url: "https://logs.example.com/ingest",
 *   headers: { "x-api-key": process.env.LOG_KEY! },
 *   batchSize: 100,
 *   flushIntervalMs: 10_000,
 * })
 * ```
 */
export function httpTransport(options: HttpTransportOptions): Transport {
	const {
		url,
		headers = {},
		batchSize = 50,
		flushIntervalMs = 5000,
		level,
		fetch: fetchImpl = globalThis.fetch.bind(globalThis),
	} = options;

	const threshold = level ? LEVEL_VALUES[level] : Number.NEGATIVE_INFINITY;
	let buffer: LogRecord[] = [];
	let timer: ReturnType<typeof setTimeout> | null = null;

	const flush = async (): Promise<void> => {
		if (buffer.length === 0) return;
		const batch = buffer;
		buffer = [];
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		try {
			await fetchImpl(url, {
				method: "POST",
				headers: { "Content-Type": "application/json", ...headers },
				body: JSON.stringify(batch),
				keepalive: true,
			});
		} catch {
			// Drop on failure. The contract is fire-and-forget.
		}
	};

	const scheduleFlush = (): void => {
		if (timer) return;
		timer = setTimeout(() => {
			void flush();
		}, flushIntervalMs);
	};

	return {
		name: "http",
		write: (record) => {
			if (LEVEL_VALUES[record.level] < threshold) return;
			buffer.push(record);
			if (buffer.length >= batchSize) {
				void flush();
			} else {
				scheduleFlush();
			}
		},
		flush,
	};
}
