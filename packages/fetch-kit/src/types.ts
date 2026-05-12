/**
 * A schema validator. Compatible with Zod, Valibot, ArkType, or any
 * library exposing a `parse(input) → output` method.
 */
export type Schema<T> = {
	parse: (input: unknown) => T;
};

/** HTTP methods supported by the client. */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Backoff strategy for retries.
 *
 * - `"exponential"`: 100ms, 200ms, 400ms, 800ms, ... (capped at 30s)
 * - `"linear"`: 100ms, 200ms, 300ms, 400ms, ...
 * - A function `(attempt) => milliseconds` for custom strategies
 */
export type BackoffStrategy = "exponential" | "linear" | ((attempt: number) => number);

/**
 * Retry configuration for failed requests.
 */
export type RetryConfig = {
	/** Maximum number of retry attempts (excluding the initial request). */
	attempts: number;
	/** Backoff between attempts. Defaults to `"exponential"`. */
	backoff?: BackoffStrategy;
	/**
	 * Predicate deciding whether an error is retryable.
	 * Defaults to retrying on network errors and 5xx responses.
	 */
	retryOn?: (error: unknown, attempt: number) => boolean;
};

/**
 * A function that runs before the request is sent.
 * Receives the request init and may modify it (return new init or undefined to leave unchanged).
 */
export type RequestInterceptor = (
	url: string,
	init: RequestInit,
) => RequestInit | undefined | Promise<RequestInit | undefined>;

/**
 * A function that runs after a response is received but before the body is parsed.
 * Receives the response and may return a different response or undefined to leave unchanged.
 */
export type ResponseInterceptor = (
	response: Response,
) => Response | undefined | Promise<Response | undefined>;

/**
 * A single entry in the response cache.
 */
export type CacheEntry<T = unknown> = {
	/** The cached payload (post-parse, post-schema-validation). */
	data: T;
	/** Epoch millis at which the entry expires. */
	expiresAt: number;
};

/**
 * Pluggable storage for the response cache.
 *
 * The default implementation is an in-memory LRU. Implement this interface to
 * back the cache with `sessionStorage`, IndexedDB, Redis, etc. All methods may
 * be synchronous or return a `Promise`.
 */
export type CacheStore = {
	get: (key: string) => CacheEntry | undefined | Promise<CacheEntry | undefined>;
	set: (key: string, entry: CacheEntry) => void | Promise<void>;
	delete: (key: string) => void | Promise<void>;
	clear: () => void | Promise<void>;
};

/**
 * Default-cache configuration applied at client creation.
 */
export type CacheConfig = {
	/** Default time-to-live for cache entries in milliseconds. Defaults to 60_000. */
	ttl?: number;
	/** Maximum entries kept in the default in-memory store. Defaults to 100. */
	maxSize?: number;
	/** Custom store (e.g. localStorage-backed, Redis). Overrides `maxSize`. */
	store?: CacheStore;
	/** Compute the cache key. Defaults to `"<METHOD> <url> [body fingerprint]"`. */
	keyFn?: (method: HttpMethod, url: string, body: unknown) => string;
	/**
	 * When `true`, GET requests (and GraphQL queries) are cached automatically.
	 * Defaults to `true` when a `CacheConfig` is supplied. Set explicitly to
	 * `false` to require per-request opt-in.
	 */
	autoCacheGet?: boolean;
};

/**
 * Per-request cache override.
 *
 * - `false`: bypass cache, do not read or write.
 * - `true`: read+write using the client's default TTL.
 * - Object: read+write, but override TTL or key, or skip reads with `bypass`.
 */
export type CacheOption =
	| boolean
	| {
			/** Override the default TTL for this request. */
			ttl?: number;
			/** Override the computed cache key. */
			key?: string;
			/**
			 * When `true`, ignore any cached value and fetch fresh. The fresh
			 * response is still written back to the cache.
			 */
			bypass?: boolean;
	  };

/**
 * Configuration for {@link createClient}.
 */
export type ClientConfig = {
	/** Base URL prepended to relative paths. e.g. `"https://api.example.com"` */
	baseUrl?: string;
	/** Default request timeout in milliseconds. Defaults to 30000. */
	timeout?: number;
	/** Default retry configuration. */
	retry?: RetryConfig;
	/** Default headers merged into every request. */
	headers?: Record<string, string>;
	/**
	 * Function that returns an auth token, called for each request.
	 * Result is appended as `Authorization: Bearer <token>` if non-null.
	 */
	auth?: () => string | null | undefined | Promise<string | null | undefined>;
	/** Hook called when any request errors. Useful for telemetry. */
	onError?: (error: unknown) => void;
	/** Request interceptors run in order. */
	requestInterceptors?: RequestInterceptor[];
	/** Response interceptors run in order. */
	responseInterceptors?: ResponseInterceptor[];
	/** Custom fetch implementation. Defaults to global `fetch`. */
	fetch?: typeof fetch;
	/**
	 * Enable response caching. Pass `true` to use defaults, an object to tune,
	 * or omit to disable. Caching applies to GET requests and GraphQL queries
	 * by default; mutations are never cached.
	 */
	cache?: boolean | CacheConfig;
	/**
	 * Enable in-flight request deduplication. When two identical GET or query
	 * requests fire concurrently, both await a single underlying fetch.
	 * Defaults to `true`.
	 */
	dedupe?: boolean;
	/**
	 * GraphQL endpoint path or absolute URL. Required for {@link Client.graphql}
	 * unless an explicit `url` is passed per request.
	 */
	graphqlEndpoint?: string;
};

/**
 * Per-request options. Merge into the client's defaults.
 */
export type RequestOptions<TSchema = unknown> = {
	/** Override the timeout for this request. */
	timeout?: number;
	/** Override retry config for this request. */
	retry?: RetryConfig;
	/** Additional headers merged into the request. */
	headers?: Record<string, string>;
	/** Query parameters appended to the URL. */
	query?: Record<string, string | number | boolean | undefined>;
	/** Optional schema to validate the response body. */
	schema?: Schema<TSchema>;
	/** External AbortSignal to cancel the request. */
	signal?: AbortSignal;
	/** Per-request cache override. See {@link CacheOption}. */
	cache?: CacheOption;
	/** Per-request dedupe override. Defaults to the client setting. */
	dedupe?: boolean;
};

/**
 * A GraphQL request body, as transported over HTTP.
 *
 * @typeParam TVariables - Shape of the `variables` map; defaults to a loose record.
 */
export type GraphQLRequest<TVariables = Record<string, unknown>> = {
	query: string;
	variables?: TVariables;
	operationName?: string;
};

/**
 * Single error entry in a GraphQL response.
 *
 * See https://spec.graphql.org/draft/#sec-Errors.
 */
export type GraphQLFormattedError = {
	message: string;
	locations?: ReadonlyArray<{ line: number; column: number }>;
	path?: ReadonlyArray<string | number>;
	extensions?: Record<string, unknown>;
};

/**
 * Raw response envelope returned by a GraphQL server.
 */
export type GraphQLResponse<TData = unknown> = {
	data?: TData | null;
	errors?: ReadonlyArray<GraphQLFormattedError>;
	extensions?: Record<string, unknown>;
};

/**
 * Per-GraphQL-request options.
 *
 * @typeParam TData - Shape of `data` in the response.
 * @typeParam TVariables - Shape of the variables map.
 */
export type GraphQLOptions<TData = unknown, TVariables = Record<string, unknown>> = Omit<
	RequestOptions<TData>,
	"query"
> & {
	/** Variables sent with the operation. */
	variables?: TVariables;
	/** Operation name; recommended for observability and persisted queries. */
	operationName?: string;
	/** Override the configured GraphQL endpoint URL for this request. */
	url?: string;
	/**
	 * Operation kind. Queries are cached + deduped by default; mutations and
	 * subscriptions are not. Defaults to `"query"` for backward compatibility.
	 */
	operation?: "query" | "mutation" | "subscription";
};

/**
 * The HTTP client returned by {@link createClient}.
 */
export type Client = {
	get: <T = unknown>(path: string, options?: RequestOptions<T>) => Promise<T>;
	post: <T = unknown>(path: string, body?: unknown, options?: RequestOptions<T>) => Promise<T>;
	put: <T = unknown>(path: string, body?: unknown, options?: RequestOptions<T>) => Promise<T>;
	patch: <T = unknown>(path: string, body?: unknown, options?: RequestOptions<T>) => Promise<T>;
	delete: <T = unknown>(path: string, options?: RequestOptions<T>) => Promise<T>;
	/** Generic request for cases where the helpers don't fit. */
	request: <T = unknown>(
		method: HttpMethod,
		path: string,
		body?: unknown,
		options?: RequestOptions<T>,
	) => Promise<T>;
	/**
	 * Execute a GraphQL operation against the configured endpoint.
	 *
	 * On success the `data` field of the GraphQL response is returned; any
	 * `errors` array is thrown as a {@link GraphQLError}.
	 */
	graphql: <TData = unknown, TVariables = Record<string, unknown>>(
		query: string,
		options?: GraphQLOptions<TData, TVariables>,
	) => Promise<TData>;
	/** Drop a cached response (if a cache is configured). No-op otherwise. */
	invalidate: (key: string) => void | Promise<void>;
	/** Clear the entire cache (if configured). No-op otherwise. */
	clearCache: () => void | Promise<void>;
};
