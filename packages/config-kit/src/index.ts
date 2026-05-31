export { loadConfig } from "./load-config.js";
export { deepMerge, isPlainObject } from "./merge.js";
export {
	configFileSource,
	dotenvFileSource,
	objectSource,
	processEnvSource,
	remoteSource,
	staticSource,
} from "./sources.js";
export type {
	ConfigFileLoader,
	ConfigFileSourceOptions,
	RemoteSourceOptions,
} from "./sources.js";
export type {
	AnyConfigSource,
	ConfigLogger,
	ConfigSource,
	LoadConfigOptions,
	Schema,
	SourceErrorInfo,
	StructuredSource,
	ValidationErrorContext,
	ValidationMode,
} from "./types.js";
