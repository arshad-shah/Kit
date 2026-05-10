import type { LogRecord, Transport } from "../types.js";

/**
 * File transport options.
 */
export type FileTransportOptions = {
	/** Filesystem path to write logs to. Records are appended as JSONL. */
	path: string;
	/** Flush every N records. Defaults to 1 (write immediately). */
	batchSize?: number;
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
 * @example
 * ```ts
 * fileTransport({ path: "./logs/app.log" })
 * ```
 */
export function fileTransport(options: FileTransportOptions): Transport {
	const { path, batchSize = 1 } = options;
	let buffer: string[] = [];

	const flush = async (): Promise<void> => {
		if (buffer.length === 0) return;
		const chunk = buffer.join("");
		buffer = [];
		try {
			const { appendFile } = await import("node:fs/promises");
			await appendFile(path, chunk, "utf-8");
		} catch {
			/* noop */
		}
	};

	return {
		name: "file",
		write: (record: LogRecord) => {
			buffer.push(`${JSON.stringify(record)}\n`);
			if (buffer.length >= batchSize) {
				void flush();
			}
		},
		flush,
	};
}
