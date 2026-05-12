import { parseDotenv } from "./parse-dotenv.js";
import type { ConfigSource } from "./types.js";

/**
 * A source that reads from `process.env`. SSR/server-side only;
 * in browsers `process.env` is an empty object after bundling.
 *
 * @example
 * ```ts
 * sources: [processEnvSource()]
 * ```
 */
export function processEnvSource(): ConfigSource {
	return {
		name: "process.env",
		load: () => {
			if (typeof process === "undefined" || !process.env) return {};
			return { ...process.env };
		},
	};
}

/**
 * A source that reads a `.env`-format file from disk.
 *
 * **Node only.** Uses dynamic import of `node:fs/promises` so it doesn't
 * break browser bundles, but actually calling `load()` in a browser will
 * throw — filter sources by environment in your loader.
 *
 * Missing files (`ENOENT`) are treated as empty config so `.env.local` and
 * similar optional files can be listed unconditionally. Other I/O failures
 * (permission denied, "is a directory", etc.) are re-thrown so they surface
 * to `loadConfig`'s `onSourceError` / logger — masking them would just make
 * misconfiguration debug sessions miserable.
 *
 * @example
 * ```ts
 * sources: [dotenvFileSource(".env.local"), dotenvFileSource(".env")]
 * ```
 */
export function dotenvFileSource(path: string): ConfigSource {
	return {
		name: `dotenv:${path}`,
		load: async () => {
			let content: string;
			try {
				const { readFile } = await import("node:fs/promises");
				content = await readFile(path, "utf-8");
			} catch (err) {
				const code = (err as NodeJS.ErrnoException | null)?.code;
				// ENOENT: file just doesn't exist - normal in CI / local-only files.
				if (code === "ENOENT") return {};
				// Everything else (EACCES, EISDIR, EBUSY, ...) is a real problem
				// the developer probably wants to know about.
				throw err;
			}
			return parseDotenv(content);
		},
	};
}

/**
 * A source backed by a static object. Useful for defaults.
 *
 * @example
 * ```ts
 * sources: [
 *   staticSource({ NODE_ENV: "development", PORT: "3000" }),
 *   processEnvSource(),
 * ]
 * ```
 */
export function staticSource(values: Record<string, string | undefined>): ConfigSource {
	return {
		name: "static",
		load: () => ({ ...values }),
	};
}

/**
 * Options for {@link remoteSource}.
 */
export type RemoteSourceOptions = {
	/** URL returning a JSON object of string values. */
	url: string;
	/** Headers merged into the request. */
	headers?: Record<string, string>;
	/** Timeout in ms. Defaults to 5000. */
	timeoutMs?: number;
	/** Custom fetch. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
};

/**
 * A source that fetches a JSON object of config values from an HTTP endpoint.
 *
 * The endpoint must return a flat `Record<string, string>`. Nested objects
 * and arrays are not supported - flatten on the server before sending, or
 * use a more capable secret manager and write a custom source.
 *
 * Failures are soft: a network error returns an empty object so the loader
 * can fall back to other sources. Validate via the schema if a remote value
 * is required.
 *
 * @example
 * ```ts
 * remoteSource({
 *   url: "https://config.internal/app",
 *   headers: { authorization: `Bearer ${token}` },
 * })
 * ```
 */
export function remoteSource(options: RemoteSourceOptions): ConfigSource {
	const {
		url,
		headers = {},
		timeoutMs = 5000,
		fetch: fetchImpl = globalThis.fetch.bind(globalThis),
	} = options;

	return {
		name: `remote:${url}`,
		load: async () => {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), timeoutMs);
			try {
				const res = await fetchImpl(url, { headers, signal: controller.signal });
				if (!res.ok) return {};
				const json = (await res.json()) as Record<string, unknown>;
				const out: Record<string, string> = {};
				for (const [k, v] of Object.entries(json)) {
					// Coerce JSON primitives to strings so downstream schemas
					// (commonly `z.coerce.number()`, `z.coerce.boolean()`) get
					// something useful instead of silently dropping the key.
					// Complex values (objects, arrays, null) are still dropped -
					// they don't have an unambiguous string representation.
					if (typeof v === "string") out[k] = v;
					else if (typeof v === "number" || typeof v === "boolean") out[k] = String(v);
				}
				return out;
			} catch {
				return {};
			} finally {
				clearTimeout(timer);
			}
		},
	};
}
