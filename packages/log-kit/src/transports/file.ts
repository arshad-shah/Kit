import type { LogRecord, Transport } from "../types.js";

/**
 * File transport options.
 */
export type FileTransportOptions = {
	/** Filesystem path to write logs to. Records are appended as JSONL. */
	path: string;
	/** Flush every N records. Defaults to 1 (write immediately). */
	batchSize?: number;
	/**
	 * Diagnostic hook called when a write/flush fails. Mirrors the contract of
	 * `LoggerConfig.onTransportError` so you can plug the same handler in.
	 *
	 * Failures are still swallowed (the transport never throws back to the
	 * caller) - this hook is purely for observability.
	 */
	onError?: (error: unknown, info: { op: "write" | "flush"; path: string }) => void;
};

/**
 * Build a transport that appends records to a file as JSON Lines.
 *
 * **Node only.** This transport uses `node:fs/promises` and will throw if
 * imported in a browser context. Import only from server-side code.
 *
 * Each record is written as one JSON object per line (newline-delimited),
 * the standard format for log shippers like Vector, Fluent Bit, and Promtail.
 *
 * Concurrent flushes are serialized internally: appends are chained through
 * a single in-process queue so two writes can never interleave on disk past
 * the OS's atomic-append guarantee (`PIPE_BUF`, ~4 KB on Linux). Records
 * always land in submission order, one per line.
 *
 * @example
 * ```ts
 * fileTransport({
 *   path: "./logs/app.log",
 *   onError: (err) => console.error("[log-kit] file write failed", err),
 * })
 * ```
 */
export function fileTransport(options: FileTransportOptions): Transport {
	const { path, batchSize = 1, onError } = options;
	let buffer: string[] = [];
	// Serialize appendFile calls. Each flush chains onto the tail of `chain`,
	// so even concurrent flush() callers get strict FIFO writes.
	let chain: Promise<void> = Promise.resolve();

	const report = (err: unknown, op: "write" | "flush"): void => {
		try {
			onError?.(err, { op, path });
		} catch {
			/* swallow user-side errors so a bad onError can't break logging */
		}
	};

	const flush = (): Promise<void> => {
		if (buffer.length === 0) return chain;
		const chunk = buffer.join("");
		buffer = [];

		// Append this batch to the end of the chain. We return the chain
		// itself so a caller awaiting flush() waits for *this* batch's write
		// to land (and any earlier ones still in flight).
		const next = chain.then(async () => {
			try {
				const { appendFile } = await import("node:fs/promises");
				await appendFile(path, chunk, "utf-8");
			} catch (err) {
				report(err, "flush");
			}
		});
		// Keep the chain alive even after errors so subsequent writes still go.
		chain = next.catch(() => undefined);
		return next;
	};

	return {
		name: "file",
		write: (record: LogRecord) => {
			buffer.push(`${JSON.stringify(record)}\n`);
			if (buffer.length >= batchSize) {
				// Fire-and-forget; failures are routed to `onError`.
				flush().catch((err) => report(err, "write"));
			}
		},
		flush,
	};
}
