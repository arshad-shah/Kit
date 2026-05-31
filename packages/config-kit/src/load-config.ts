import { deepMerge, isPlainObject } from "./merge.js";
import type {
	AnyConfigSource,
	LoadConfigOptions,
	StructuredSource,
	ValidationErrorContext,
} from "./types.js";

/**
 * Load and validate config from one or more sources.
 *
 * Sources are loaded in parallel, then merged in array order. Flat
 * {@link ConfigSource}s merge key-by-key (last wins); {@link StructuredSource}s
 * deep-merge their nested object (plain objects merge recursively, arrays and
 * primitives replace). The merged object is passed through the schema, which is
 * responsible for coercion (string → number/boolean), validation, and defaults.
 * Use Zod's `z.coerce.*` helpers for env vars.
 *
 * On validation failure, this function throws by default. Pass `mode: "warn"`
 * to downgrade to a logged warning and receive the unvalidated merged input.
 * The error message identifies the failing keys but **not their values** by
 * default — environment variables frequently contain secrets, and a thrown
 * error often ends up in logs. Set `includeValuesInErrors: true` if you're sure
 * your config doesn't carry sensitive data, or pass `onValidationError` to
 * render your own message.
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
 * @example Module-based config (structured sources)
 * ```ts
 * import { loadConfig, configFileSource, objectSource } from "@arshad-shah/config-kit";
 *
 * const config = await loadConfig({
 *   schema: ConfigSchema,
 *   sources: [
 *     objectSource(defaults),            // deep-merged defaults layer
 *     configFileSource({ name: "app" }), // app.config.{ts,js,mjs,cjs,json}
 *   ],
 *   mode: process.env.STRICT === "0" ? "warn" : "strict",
 *   onValidationError: (err) => formatConfigError(err),
 * });
 * ```
 */
export async function loadConfig<T>(options: LoadConfigOptions<T>): Promise<T> {
	const {
		schema,
		sources,
		logger,
		includeValuesInErrors = false,
		mode = "strict",
		onValidationError,
		onSourceError,
	} = options;

	if (sources.length === 0) {
		throw new Error("loadConfig: at least one source is required");
	}

	// Load all sources in parallel; failures resolve to a "not ok" marker so
	// other sources still merge. Normalisation (shape-checking structured
	// values) happens after, in source order, so a bad shape surfaces as a
	// hard error rather than being swallowed by the soft per-source catch.
	const loaded = await Promise.all(
		sources.map(async (source) => {
			try {
				const raw = await source.load();
				return { source: source.name, structured: isStructured(source), raw, ok: true as const };
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
				return {
					source: source.name,
					structured: isStructured(source),
					raw: {},
					ok: false as const,
				};
			}
		}),
	);

	// Merge in source order; later sources override earlier ones.
	let merged: Record<string, unknown> = {};
	for (const entry of loaded) {
		const values = entry.ok ? normalizeSourceValue(entry.raw, entry.structured, entry.source) : {};
		if (entry.ok) {
			logger?.info(`Loaded source ${entry.source}`, { keyCount: Object.keys(values).length });
		}
		merged = deepMerge(merged, values);
	}

	try {
		return schema.parse(merged);
	} catch (err) {
		return handleValidationError<T>(err, merged, {
			sources,
			mode,
			logger,
			includeValuesInErrors,
			onValidationError,
		});
	}
}

function isStructured(source: AnyConfigSource): source is StructuredSource {
	return (source as Partial<StructuredSource>).structured === true;
}

/**
 * Turn a source's raw `load()` result into a plain object ready to merge.
 *
 * Flat sources already return a `Record<string, string | undefined>`; we hand
 * it straight to `deepMerge` (string values replace, `undefined` is skipped).
 *
 * Structured sources must return a plain object — or `null`/`undefined`, which
 * mean "empty" so earlier layers (defaults) win, mirroring a missing config
 * file. Any other non-nullish value (array, primitive, function) is a
 * configuration error and throws.
 */
function normalizeSourceValue(
	raw: unknown,
	structured: boolean,
	name: string,
): Record<string, unknown> {
	if (!structured) {
		return (raw ?? {}) as Record<string, unknown>;
	}
	if (raw === null || raw === undefined) return {};
	if (isPlainObject(raw)) return raw;
	throw new Error(
		`Structured source "${name}" must resolve to an object (or null/undefined), but got ${describe(raw)}`,
	);
}

function describe(value: unknown): string {
	if (Array.isArray(value)) return "an array";
	return `a ${typeof value}`;
}

type ValidationHandlingOptions<T> = {
	sources: AnyConfigSource[];
	mode: "strict" | "warn";
	logger: LoadConfigOptions<T>["logger"];
	includeValuesInErrors: boolean;
	onValidationError: LoadConfigOptions<T>["onValidationError"];
};

function handleValidationError<T>(
	err: unknown,
	merged: Record<string, unknown>,
	options: ValidationHandlingOptions<T>,
): T {
	const { sources, mode, logger, includeValuesInErrors, onValidationError } = options;

	const context: ValidationErrorContext = {
		sources: sources.map((s) => s.name),
		...(includeValuesInErrors ? { merged } : {}),
	};

	let error: Error | undefined;
	if (onValidationError) {
		const formatted = onValidationError(err, context);
		if (formatted instanceof Error) error = formatted;
	}
	if (!error) error = defaultValidationError(err, includeValuesInErrors);

	if (mode === "warn") {
		logger?.warn(`Config validation failed (mode=warn): ${error.message}`, {
			error: error.message,
		});
		// Best-effort: hand back the merged input so a host can keep going with
		// a downgraded warning instead of a hard failure.
		return merged as T;
	}

	throw error;
}

/**
 * config-kit's default validation error: a (by default) value-redacted message
 * with the original error attached as `cause`.
 */
function defaultValidationError(err: unknown, includeValuesInErrors: boolean): Error {
	if (includeValuesInErrors) {
		return err instanceof Error ? err : new Error(String(err));
	}

	// Re-throw with values stripped from common Zod-style error messages.
	// We don't introspect the error structure - just provide a safer default
	// message and attach the original for callers who explicitly want it.
	const safeMessage =
		err instanceof Error ? sanitizeErrorMessage(err.message) : "Config validation failed";
	const wrapped = new Error(safeMessage);
	(wrapped as Error & { cause: unknown }).cause = err;
	return wrapped;
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
