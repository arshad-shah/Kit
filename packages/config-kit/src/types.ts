/**
 * Schema validator. Compatible with Zod, Valibot, ArkType, or any
 * library exposing a `parse(input) → output` method.
 *
 * Re-uses the same shape as @arshad-shah/fetch-kit to avoid duplication.
 */
export type Schema<T> = {
	parse: (input: unknown) => T;
};

/**
 * A source of raw key/value pairs to merge into the final config.
 *
 * Sources run in array order; later sources override earlier ones.
 * This matches how environment overrides typically work: defaults < .env file < process.env < remote.
 *
 * `load()` returns flat strings — the schema is expected to coerce them via
 * `z.coerce.*`. For config that is a nested object (module-based config files,
 * arrays, functions), use a {@link StructuredSource} instead.
 */
export type ConfigSource = {
	/** Identifier used in diagnostics. */
	name: string;
	/** Read raw values. May be sync or async. */
	load: () => Record<string, string | undefined> | Promise<Record<string, string | undefined>>;
};

/**
 * A source whose `load()` returns an arbitrary, possibly nested value —
 * objects, arrays, functions, sub-objects — rather than a flat string map.
 *
 * This is what unlocks module-based config (e.g. `app.config.ts` whose default
 * export is a nested object). {@link loadConfig} treats structured sources
 * differently from flat {@link ConfigSource}s:
 *
 * - **No string coercion.** The value is merged as-is.
 * - **Deep merge.** Plain objects are merged recursively against earlier
 *   sources; arrays and primitives replace wholesale.
 * - **No value redaction** in validation errors — structured config files are
 *   typically public, not secret-bearing env.
 *
 * `load()` must resolve to a plain object (or `null`/`undefined`, treated as
 * "empty" so defaults apply). Returning any other non-nullish value (array,
 * primitive, function) is a configuration error and throws.
 */
export type StructuredSource = {
	/** Identifier used in diagnostics. */
	name: string;
	/** Discriminator marking this as a structured (nested) source. */
	structured: true;
	/** Read the structured value (typically a module's default export). */
	load: () => unknown | Promise<unknown>;
};

/**
 * Any source accepted by {@link loadConfig} — flat or structured. The two can
 * be mixed in a single `sources` array; each is merged with the strategy
 * appropriate to its kind.
 */
export type AnyConfigSource = ConfigSource | StructuredSource;

/**
 * Optional logger interface compatible with @arshad-shah/log-kit's Logger.
 *
 * Defining the shape locally rather than importing avoids a hard dependency:
 * config-kit can run with or without log-kit. This is a structural type, so
 * any object with these methods works.
 */
export type ConfigLogger = {
	info: (message: string, context?: Record<string, unknown>) => void;
	warn: (message: string, context?: Record<string, unknown>) => void;
	error: (message: string | Error, context?: Record<string, unknown>) => void;
};

/**
 * Information passed to {@link LoadConfigOptions.onSourceError}.
 */
export type SourceErrorInfo = {
	/** The source's `name` (e.g. `"dotenv:.env"`, `"process.env"`). */
	source: string;
};

/**
 * Context passed to {@link LoadConfigOptions.onValidationError}.
 */
export type ValidationErrorContext = {
	/** Names of the sources that contributed, in merge order. */
	sources: string[];
	/**
	 * The merged input that failed validation. Only populated when
	 * `includeValuesInErrors` is true — otherwise omitted so a hook can't
	 * accidentally leak secrets into logs.
	 */
	merged?: Record<string, unknown>;
};

/**
 * How {@link loadConfig} reacts to a schema validation failure.
 *
 * - `"strict"` (default): throw. Matches a build tool that should fail at boot.
 * - `"warn"`: log a warning via the supplied `logger` and return the merged,
 *   **unvalidated** input cast to `T`. Lets a host downgrade hard failures to a
 *   warning (e.g. behind an env flag).
 */
export type ValidationMode = "strict" | "warn";

/**
 * Configuration for {@link loadConfig}.
 */
export type LoadConfigOptions<T> = {
	/** Schema used to validate and shape the merged config. */
	schema: Schema<T>;
	/** Sources merged in order. Later sources override earlier. */
	sources: AnyConfigSource[];
	/** Optional logger for diagnostics. */
	logger?: ConfigLogger;
	/**
	 * If true, the validation error message includes the values that failed,
	 * and {@link ValidationErrorContext.merged} is passed to
	 * {@link LoadConfigOptions.onValidationError}. Off by default to avoid
	 * logging secrets.
	 */
	includeValuesInErrors?: boolean;
	/**
	 * Validation failure behaviour. Defaults to `"strict"` (throw). See
	 * {@link ValidationMode}.
	 */
	mode?: ValidationMode;
	/**
	 * Hook called with the **raw** validation error before config-kit decides
	 * what to do with it. Use it to inspect Zod issues, attach the config file
	 * path, or render a custom message.
	 *
	 * Return an `Error` to use it instead of config-kit's default (redacted)
	 * error — that Error is thrown in `strict` mode or logged in `warn` mode.
	 * Return nothing to keep the default behaviour.
	 */
	// biome-ignore lint/suspicious/noConfusingVoidType: `Error | void` is the intended optional-return shape — return an Error to override, or nothing.
	onValidationError?: (error: unknown, context: ValidationErrorContext) => Error | void;
	/**
	 * Diagnostic hook called when a source's `load()` throws. The error is
	 * still soft-handled (treated as an empty source) so other sources
	 * continue to load — this hook is purely for observability.
	 */
	onSourceError?: (error: unknown, info: SourceErrorInfo) => void;
};
