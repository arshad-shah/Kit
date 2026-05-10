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
};
