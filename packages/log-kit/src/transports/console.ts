import type { LogLevel, LogRecord, Transport } from "../types.js";

/**
 * Where a record is written.
 *
 * - `"auto"` (default): `warn`/`error`/`fatal` → stderr, everything else →
 *   stdout (the conventional CLI split), using the matching console method.
 * - `"stdout"` / `"stderr"`: force every record to that stream.
 */
export type ConsoleStream = "auto" | "stdout" | "stderr";

/**
 * Console transport options.
 */
export type ConsoleTransportOptions = {
	/** When true, uses readable text output instead of JSON. Defaults to false (JSON). */
	pretty?: boolean;
	/** Stream routing. Defaults to `"auto"` (warn/error → stderr, else stdout). */
	stream?: ConsoleStream;
	/** Override the console implementation - useful for tests. */
	console?: Pick<Console, "debug" | "info" | "warn" | "error">;
};

type ConsoleMethod = "debug" | "info" | "warn" | "error";

// `auto`: conventional CLI routing — debug/info to stdout, warn/error to stderr.
const LEVEL_TO_METHOD: Record<LogLevel, ConsoleMethod> = {
	trace: "debug",
	debug: "debug",
	info: "info",
	warn: "warn",
	error: "error",
	fatal: "error",
};

/**
 * Pick the console method for a record given the routing mode. `stdout` and
 * `stderr` force the stream; the exact method only decides which OS stream the
 * runtime writes to (debug/info → stdout, warn/error → stderr).
 */
function methodFor(level: LogLevel, stream: ConsoleStream): ConsoleMethod {
	if (stream === "stdout") return level === "trace" || level === "debug" ? "debug" : "info";
	if (stream === "stderr") return level === "fatal" || level === "error" ? "error" : "warn";
	return LEVEL_TO_METHOD[level];
}

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

function stringify(value: unknown): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

/**
 * Apply printf-style substitution to a message using `record.args`. Supports
 * `%s %d %i %f %j %o %O %%`; leftover args are appended space-separated, like
 * `console.log`. With no args the message is returned unchanged.
 */
function formatMessage(message: string, args?: unknown[]): string {
	if (!args || args.length === 0) return message;
	let i = 0;
	const out = message.replace(/%[sdifjoO%]/g, (token) => {
		if (token === "%%") return "%";
		if (i >= args.length) return token;
		const arg = args[i++];
		switch (token) {
			case "%s":
				return String(arg);
			case "%d":
			case "%i":
				return String(Math.trunc(Number(arg)));
			case "%f":
				return String(Number(arg));
			default:
				return stringify(arg); // %j %o %O
		}
	});
	const rest = args.slice(i);
	return rest.length > 0 ? `${out} ${rest.map(stringify).join(" ")}` : out;
}

/** Render the timestamp as `HH:MM:SS.mmm` for ISO strings, else show it as-is. */
function formatTime(timestamp: string | number): string {
	if (typeof timestamp === "string" && timestamp.length >= 23 && timestamp[10] === "T") {
		return timestamp.slice(11, 23);
	}
	return String(timestamp);
}

function formatPretty(record: LogRecord): string {
	const time = formatTime(record.timestamp);
	const level = record.level.toUpperCase().padEnd(5);
	const color = LEVEL_COLOR[record.level];
	const scope = record.scope ? ` ${ANSI.bold}[${record.scope}]${ANSI.reset}` : "";
	const kind = record.kind ? ` ${ANSI.dim}(${record.kind})${ANSI.reset}` : "";
	const message = formatMessage(record.message, record.args);
	const ctx = Object.keys(record.context).length > 0 ? ` ${JSON.stringify(record.context)}` : "";
	const err = record.error ? `\n${record.error.stack ?? record.error.message}` : "";
	return `${ANSI.gray}${time}${ANSI.reset} ${color}${level}${ANSI.reset}${scope}${kind} ${message}${ANSI.dim}${ctx}${ANSI.reset}${err}`;
}

/**
 * Build a transport that writes records to `console`.
 *
 * Defaults to JSON output (one record per line), suitable for log aggregators.
 * Pass `pretty: true` for human-readable colored output during development.
 *
 * Routing follows the conventional CLI split by default (`warn`/`error` →
 * stderr, the rest → stdout); override with `stream`.
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
	const { pretty = false, stream = "auto", console: con = console } = options;

	return {
		name: "console",
		write: (record) => {
			const method = methodFor(record.level, stream);
			const output = pretty ? formatPretty(record) : JSON.stringify(record);
			con[method](output);
		},
	};
}
