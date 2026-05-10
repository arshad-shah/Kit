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
 */
export type ConfigSource = {
	/** Identifier used in diagnostics. */
	name: string;
	/** Read raw values. May be sync or async. */
	load: () => Record<string, string | undefined> | Promise<Record<string, string | undefined>>;
};

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
 * Configuration for {@link loadConfig}.
 */
export type LoadConfigOptions<T> = {
	/** Schema used to validate and shape the merged config. */
	schema: Schema<T>;
	/** Sources merged in order. Later sources override earlier. */
	sources: ConfigSource[];
	/** Optional logger for diagnostics. */
	logger?: ConfigLogger;
	/**
	 * If true, the validation error message includes the values that failed.
	 * Off by default to avoid logging secrets.
	 */
	includeValuesInErrors?: boolean;
};
