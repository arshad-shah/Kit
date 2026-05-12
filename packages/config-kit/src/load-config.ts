import type { LoadConfigOptions } from "./types.js";

/**
 * Load and validate config from one or more sources.
 *
 * Sources are loaded in parallel, then merged in array order - the last source
 * wins on key conflicts. The merged object is passed through the schema, which
 * is responsible for coercion (string → number/boolean), validation, and
 * defaults. Use Zod's `z.coerce.*` helpers for env vars.
 *
 * On validation failure, this function throws. The error message identifies
 * the failing keys but **not their values** by default - environment variables
 * frequently contain secrets, and a thrown error often ends up in logs.
 * Set `includeValuesInErrors: true` if you're sure your env doesn't carry
 * sensitive data.
 *
 * @example
 * ```ts
 * import { z } from "zod";
 * import { loadConfig, processEnvSource, dotenvFileSource } from "@arshad-shah/config-kit";
 *
 * const config = await loadConfig({
 *   schema: z.object({
 *     NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
 *     PORT: z.coerce.number().int().positive().default(3000),
 *     DATABASE_URL: z.string().url(),
 *   }),
 *   sources: [
 *     dotenvFileSource(".env"),
 *     dotenvFileSource(".env.local"),
 *     processEnvSource(),
 *   ],
 * });
 *
 * config.PORT; // number, fully typed
 * ```
 *
 * @example With a logger
 * ```ts
 * import { createLogger } from "@arshad-shah/log-kit";
 *
 * const log = createLogger();
 * const config = await loadConfig({
 *   schema,
 *   sources: [...],
 *   logger: log,
 * });
 * ```
 */
export async function loadConfig<T>(options: LoadConfigOptions<T>): Promise<T> {
	const { schema, sources, logger, includeValuesInErrors = false, onSourceError } = options;

	if (sources.length === 0) {
		throw new Error("loadConfig: at least one source is required");
	}

	// Load all sources in parallel; failures resolve to {} so other sources still merge.
	const loaded = await Promise.all(
		sources.map(async (source) => {
			try {
				const values = await source.load();
				logger?.info(`Loaded source ${source.name}`, { keyCount: Object.keys(values).length });
				return { source: source.name, values };
			} catch (err) {
				logger?.warn(`Source ${source.name} failed`, {
					error: err instanceof Error ? err.message : String(err),
				});
				if (onSourceError) {
					try {
						onSourceError(err, { source: source.name });
					} catch {
						/* a bad onSourceError must not break the load */
					}
				}
				return { source: source.name, values: {} };
			}
		}),
	);

	// Merge in source order; later sources override earlier ones.
	const merged: Record<string, unknown> = {};
	for (const { values } of loaded) {
		for (const [k, v] of Object.entries(values)) {
			if (v !== undefined) merged[k] = v;
		}
	}

	try {
		return schema.parse(merged);
	} catch (err) {
		if (includeValuesInErrors) throw err;

		// Re-throw with values stripped from common Zod-style error messages.
		// We don't introspect the error structure - just provide a safer default
		// message and attach the original for callers who explicitly want it.
		const safeMessage =
			err instanceof Error ? sanitizeErrorMessage(err.message) : "Config validation failed";
		const wrapped = new Error(safeMessage);
		(wrapped as Error & { cause: unknown }).cause = err;
		throw wrapped;
	}
}

/**
 * Replace common patterns where validators echo input values
 * with placeholders, so we don't accidentally log secrets.
 *
 * Zod errors look like `Required` or `Expected string, received number` -
 * those are fine. The risk is custom messages or libraries that include the
 * raw input. We strip anything that looks like a quoted value.
 */
function sanitizeErrorMessage(msg: string): string {
	return msg.replace(/"[^"]{0,200}"/g, '"<redacted>"').replace(/'[^']{0,200}'/g, "'<redacted>'");
}
