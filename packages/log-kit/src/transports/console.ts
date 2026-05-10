import type { LogLevel, LogRecord, Transport } from "../types.js";

/**
 * Console transport options.
 */
export type ConsoleTransportOptions = {
	/** When true, uses readable text output instead of JSON. Defaults to false (JSON). */
	pretty?: boolean;
	/** Override the console implementation - useful for tests. */
	console?: Pick<Console, "debug" | "info" | "warn" | "error">;
};

const LEVEL_TO_METHOD: Record<LogLevel, "debug" | "info" | "warn" | "error"> = {
	trace: "debug",
	debug: "debug",
	info: "info",
	warn: "warn",
	error: "error",
	fatal: "error",
};

const ANSI = {
	reset: "\x1b[0m",
	dim: "\x1b[2m",
	red: "\x1b[31m",
	yellow: "\x1b[33m",
	cyan: "\x1b[36m",
	gray: "\x1b[90m",
	bold: "\x1b[1m",
};

const LEVEL_COLOR: Record<LogLevel, string> = {
	trace: ANSI.gray,
	debug: ANSI.dim,
	info: ANSI.cyan,
	warn: ANSI.yellow,
	error: ANSI.red,
	fatal: ANSI.red + ANSI.bold,
};

function formatPretty(record: LogRecord): string {
	const time = record.timestamp.slice(11, 23); // HH:MM:SS.mmm
	const level = record.level.toUpperCase().padEnd(5);
	const color = LEVEL_COLOR[record.level];
	const ctx = Object.keys(record.context).length > 0 ? ` ${JSON.stringify(record.context)}` : "";
	const err = record.error ? `\n${record.error.stack ?? record.error.message}` : "";
	return `${ANSI.gray}${time}${ANSI.reset} ${color}${level}${ANSI.reset} ${record.message}${ANSI.dim}${ctx}${ANSI.reset}${err}`;
}

/**
 * Build a transport that writes records to `console`.
 *
 * Defaults to JSON output (one record per line), suitable for log aggregators.
 * Pass `pretty: true` for human-readable colored output during development.
 *
 * @example
 * ```ts
 * import { createLogger } from "@arshad-shah/log-kit";
 * import { consoleTransport } from "@arshad-shah/log-kit/transports/console";
 *
 * const log = createLogger({
 *   transports: [consoleTransport({ pretty: process.env.NODE_ENV !== "production" })],
 * });
 * ```
 */
export function consoleTransport(options: ConsoleTransportOptions = {}): Transport {
	const { pretty = false, console: con = console } = options;

	return {
		name: "console",
		write: (record) => {
			const method = LEVEL_TO_METHOD[record.level];
			const output = pretty ? formatPretty(record) : JSON.stringify(record);
			con[method](output);
		},
	};
}
