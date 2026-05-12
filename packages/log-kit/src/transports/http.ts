import { LEVEL_ORDER, type LogLevel, type LogRecord, type Transport } from "../types.js";

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
	/**
	 * Diagnostic hook called when a flush fails. Failures are still swallowed
	 * (fire-and-forget telemetry); this hook is purely for observability.
	 */
	onError?: (error: unknown, info: { op: "flush"; url: string }) => void;
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
		onError,
	} = options;

	const threshold = level ? LEVEL_ORDER[level] : Number.NEGATIVE_INFINITY;
	let buffer: LogRecord[] = [];
	let timer: ReturnType<typeof setTimeout> | null = null;

	const report = (err: unknown): void => {
		if (!onError) return;
		try {
			onError(err, { op: "flush", url });
		} catch {
			/* user-side errors must not break logging */
		}
	};

	const clearTimer = (): void => {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
	};

	const flush = async (): Promise<void> => {
		clearTimer();
		if (buffer.length === 0) return;
		const batch = buffer;
		buffer = [];
		try {
			const res = await fetchImpl(url, {
				method: "POST",
				headers: { "Content-Type": "application/json", ...headers },
				body: JSON.stringify(batch),
				keepalive: true,
			});
			if (!res.ok) {
				report(new Error(`HTTP ${res.status} ${res.statusText}`));
			}
		} catch (err) {
			report(err);
		}
	};

	const scheduleFlush = (): void => {
		if (timer) return;
		timer = setTimeout(() => {
			// The timer fired; reset our reference before flushing so a
			// subsequent write can re-schedule.
			timer = null;
			void flush();
		}, flushIntervalMs);
	};

	return {
		name: "http",
		write: (record) => {
			if (LEVEL_ORDER[record.level] < threshold) return;
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
