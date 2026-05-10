import type { Transport } from "../types.js";
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
	/** Hostname; defaults to `os.hostname()` on Node, omitted in browser. */
	hostname?: string;
	/** Additional tags. */
	tags?: string[];
	/** Extra headers to merge. */
	headers?: Record<string, string>;
};

/**
 * Build a transport that ships records to Datadog Logs.
 *
 * This is a thin specialization over {@link httpTransport} - same batching,
 * same fire-and-forget semantics, but with the Datadog endpoint and headers
 * pre-configured and the record envelope adjusted to Datadog's expected
 * `ddsource`/`ddtags`/`service` shape.
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

	const inner = httpTransport({
		...rest,
		url,
		headers: {
			"DD-API-KEY": apiKey,
			...headers,
		},
	});

	// Wrap write to enrich each record with Datadog-required fields.
	const transport: Transport = {
		name: "datadog",
		write: (record) =>
			inner.write({
				...record,
				context: {
					...record.context,
					ddsource: "log-kit",
					ddtags: ddTags.join(","),
					service,
					...(hostname ? { host: hostname } : {}),
				},
			}),
	};
	if (inner.flush) transport.flush = inner.flush;
	return transport;
}
