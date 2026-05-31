import { parseDotenv } from "./parse-dotenv.js";
import type { ConfigSource, StructuredSource } from "./types.js";

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

/**
 * A {@link StructuredSource} backed by a static, possibly nested object.
 *
 * This is the structured counterpart to {@link staticSource}: where
 * `staticSource` carries flat string defaults, `objectSource` carries a nested
 * object (sub-objects, arrays, even functions) that participates in
 * {@link loadConfig}'s deep merge. Use it as the **defaults** layer beneath a
 * {@link configFileSource}, so a user's config file only overrides the keys it
 * sets:
 *
 * @example
 * ```ts
 * sources: [
 *   objectSource({ dev: { port: 3000 }, build: { minify: true } }),
 *   configFileSource({ name: "app" }),
 * ]
 * ```
 *
 * The top-level object is shallow-copied so later callers can't mutate your
 * defaults; nested values are shared by reference (and may include functions,
 * which a deep clone could not preserve).
 */
export function objectSource(values: Record<string, unknown>, name = "object"): StructuredSource {
	return {
		name,
		structured: true,
		load: () => ({ ...values }),
	};
}

/**
 * Loads and evaluates a config file, returning its default export. Used by
 * {@link configFileSource} when no custom `load` is supplied.
 */
export type ConfigFileLoader = (filePath: string) => unknown | Promise<unknown>;

/**
 * Options for {@link configFileSource}.
 */
export type ConfigFileSourceOptions = {
	/**
	 * Base name of the config file. `name: "app"` looks for
	 * `app.config.<ext>`. Also used (prefixed) as the source's diagnostic name.
	 */
	name: string;
	/** Directory to start the search from. Defaults to `process.cwd()`. */
	cwd?: string;
	/**
	 * Extensions to try, in priority order — first match wins. Defaults to
	 * `["ts", "js", "mjs", "cjs", "json"]`.
	 */
	extensions?: string[];
	/**
	 * Walk up parent directories until a match is found (like how tools locate
	 * a config from a nested working directory). Defaults to `true`.
	 */
	searchParents?: boolean;
	/**
	 * Custom loader for the discovered file. Receives the absolute path and
	 * returns the evaluated module (or its default export). Supply this to
	 * compile TypeScript/ESM on the fly (esbuild, jiti, …) so config-kit
	 * doesn't hard-depend on a compiler. If it returns a module namespace, the
	 * `default` export is unwrapped automatically.
	 *
	 * When omitted, the file is loaded with a native dynamic `import()` (and
	 * `.json` is read + parsed directly). That handles `.js`/`.mjs`/`.cjs`/
	 * `.json` on any modern runtime; `.ts` needs a custom loader unless your
	 * runtime imports TypeScript natively.
	 */
	load?: ConfigFileLoader;
};

/**
 * A {@link StructuredSource} that discovers, imports, and returns the default
 * export of a `*.config.*` file — the building block for module-based config
 * (`app.config.ts`, `app.config.json`, …).
 *
 * Resolution walks up from `cwd` (unless `searchParents` is `false`); within
 * each directory the configured `extensions` are tried in order and the first
 * existing file wins. A missing config file is **soft** — `load()` returns `{}`
 * so earlier layers (e.g. an {@link objectSource} of defaults) apply, mirroring
 * {@link dotenvFileSource}'s ENOENT handling.
 *
 * **Node only.** Uses dynamic imports of `node:fs`/`node:path`/`node:url`.
 *
 * @example
 * ```ts
 * configFileSource({
 *   name: "app",                                  // → app.config.*
 *   extensions: ["ts", "js", "mjs", "cjs", "json"],
 *   // Compile TS/ESM on the fly so config-kit needs no compiler of its own:
 *   load: async (file) => (await import("jiti")).createJiti(import.meta.url)(file),
 * })
 * ```
 */
export function configFileSource(options: ConfigFileSourceOptions): StructuredSource {
	const {
		name,
		extensions = ["ts", "js", "mjs", "cjs", "json"],
		searchParents = true,
		load: customLoad,
	} = options;

	return {
		name: `config-file:${name}`,
		structured: true,
		load: async () => {
			const path = await import("node:path");
			const { stat } = await import("node:fs/promises");

			const cwd = options.cwd ?? (typeof process !== "undefined" ? process.cwd() : ".");

			const isFile = async (candidate: string): Promise<boolean> => {
				try {
					return (await stat(candidate)).isFile();
				} catch {
					return false;
				}
			};

			let dir = path.resolve(cwd);
			// Walk up the directory tree; stop once `dirname` stops changing (root).
			for (;;) {
				for (const ext of extensions) {
					const candidate = path.join(dir, `${name}.config.${ext}`);
					if (await isFile(candidate)) {
						const mod = customLoad
							? extractDefault(await customLoad(candidate))
							: await defaultConfigFileLoad(candidate);
						return mod;
					}
				}
				if (!searchParents) break;
				const parent = path.dirname(dir);
				if (parent === dir) break;
				dir = parent;
			}

			// No config file found — soft, so defaults apply.
			return {};
		},
	};
}

/**
 * Default file loader: parse `.json` directly, otherwise dynamic-import the
 * file (resolving CJS/ESM) and unwrap the `default` export.
 */
async function defaultConfigFileLoad(filePath: string): Promise<unknown> {
	const path = await import("node:path");
	if (path.extname(filePath).toLowerCase() === ".json") {
		const { readFile } = await import("node:fs/promises");
		return JSON.parse(await readFile(filePath, "utf-8"));
	}
	const { pathToFileURL } = await import("node:url");
	return extractDefault(await import(pathToFileURL(filePath).href));
}

/**
 * Unwrap a module namespace to its default export. A dynamic `import()` of a
 * config file yields `{ default: config }` (ESM) or `{ default: module.exports }`
 * (CJS interop); plain objects without a `default` key pass through unchanged.
 */
function extractDefault(mod: unknown): unknown {
	if (mod && typeof mod === "object" && "default" in mod) {
		return (mod as { default: unknown }).default;
	}
	return mod;
}
