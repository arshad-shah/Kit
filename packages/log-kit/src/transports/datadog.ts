import { createRequire } from "node:module";
import type { LogLevel, LogRecord, Transport } from "../types.js";
import { type HttpTransportOptions, httpTransport } from "./http.js";

/**
 * Datadog transport options.
 */
export type DatadogTransportOptions = Omit<HttpTransportOptions, "url" | "headers"> & {
	/** Datadog API key. */
	apiKey: string;
	/** Datadog site. Defaults to `"datadoghq.com"`. Use `"datadoghq.eu"` for EU. */
	site?: string;
	/** Service name attached to every record. */
	service: string;
	/** Environment name (e.g. `"production"`, `"staging"`). */
	env?: string;
	/**
	 * Hostname attached to every record. Defaults to `os.hostname()` on Node,
	 * and is omitted in browsers (where the OS hostname isn't available).
	 *
	 * Pass `null` to suppress the auto-default (useful for tests or when you
	 * deliberately don't want the hostname in your telemetry).
	 */
	hostname?: string | null;
	/** Additional tags. */
	tags?: string[];
	/** Extra headers to merge. */
	headers?: Record<string, string>;
};

/**
 * Datadog Logs has fewer severity levels than log-kit. Map our 6 levels onto
 * Datadog's 5: `trace` → `debug`, `fatal` → `error`. Everything else maps 1:1.
 */
const LEVEL_TO_DD_STATUS: Record<LogLevel, "debug" | "info" | "warn" | "error"> = {
	trace: "debug",
	debug: "debug",
	info: "info",
	warn: "warn",
	error: "error",
	fatal: "error",
};

/**
 * Resolve the default hostname for Node environments.
 *
 * Uses `os.hostname()` via a synchronous `createRequire` so the transport's
 * write path stays sync, and the `node:module` / `node:os` imports are kept
 * external in the bundle (browsers tree-shake them via `sideEffects: false`).
 * Falls back to `HOSTNAME` / `COMPUTERNAME` env vars and finally `null`.
 */
function resolveDefaultHostname(): string | null {
	if (typeof process === "undefined" || !process.versions?.node) return null;
	try {
		const req = createRequire(import.meta.url);
		const os = req("node:os") as { hostname?: () => string };
		if (typeof os.hostname === "function") return os.hostname();
	} catch {
		/* fall through to env vars */
	}
	// POSIX shells set HOSTNAME; Windows uses COMPUTERNAME. Bracket access
	// is intentional - TS's noPropertyAccessFromIndexSignature forbids dot
	// notation on process.env.
	// biome-ignore lint/complexity/useLiteralKeys: see comment above
	const hostnameEnv = process.env["HOSTNAME"];
	// biome-ignore lint/complexity/useLiteralKeys: see comment above
	const computerNameEnv = process.env["COMPUTERNAME"];
	return hostnameEnv ?? computerNameEnv ?? null;
}

/**
 * Build a transport that ships records to Datadog Logs.
 *
 * Thin specialization over {@link httpTransport} — same batching and
 * fire-and-forget semantics, with the Datadog endpoint and headers
 * pre-configured. Each record is enriched with Datadog's expected
 * `ddsource`/`ddtags`/`service` fields, the canonical `status` field
 * mapped from log-kit's `level` (Datadog has no `fatal`, so it collapses
 * to `error`), and a default `host` from `os.hostname()` on Node.
 *
 * @example
 * ```ts
 * datadogTransport({
 *   apiKey: process.env.DD_API_KEY!,
 *   service: "my-app",
 *   env: process.env.NODE_ENV,
 * })
 * ```
 */
export function datadogTransport(options: DatadogTransportOptions): Transport {
	const {
		apiKey,
		site = "datadoghq.com",
		service,
		env,
		hostname,
		tags = [],
		headers = {},
		...rest
	} = options;

	const url = `https://http-intake.logs.${site}/api/v2/logs`;
	const ddTags = [...tags];
	if (env) ddTags.push(`env:${env}`);

	// Resolve once at transport construction so we don't pay the cost per write.
	// `hostname === null` opts out; `hostname === undefined` triggers the default.
	const resolvedHost = hostname === null ? null : (hostname ?? resolveDefaultHostname());

	const inner = httpTransport({
		...rest,
		url,
		headers: {
			"DD-API-KEY": apiKey,
			...headers,
		},
	});

	const transport: Transport = {
		name: "datadog",
		write: (record) => {
			const enriched: LogRecord & { status: string } = {
				...record,
				// Datadog's canonical severity field. `level` is left in place
				// so downstream consumers can still see both shapes.
				status: LEVEL_TO_DD_STATUS[record.level],
				context: {
					...record.context,
					ddsource: "log-kit",
					ddtags: ddTags.join(","),
					service,
					...(resolvedHost ? { host: resolvedHost } : {}),
				},
			};
			return inner.write(enriched);
		},
	};
	if (inner.flush) transport.flush = inner.flush;
	return transport;
}
