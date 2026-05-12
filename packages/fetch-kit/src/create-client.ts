import { createMemoryCache, defaultCacheKey } from "./cache.js";
import { createInflight } from "./dedupe.js";
import {
	AbortError,
	GraphQLError,
	HttpError,
	NetworkError,
	TimeoutError,
	ValidationError,
} from "./errors.js";
import { computeBackoff, defaultRetryOn, sleep } from "./retry.js";
import type {
	CacheConfig,
	CacheStore,
	Client,
	ClientConfig,
	GraphQLOptions,
	GraphQLResponse,
	HttpMethod,
	RequestOptions,
	RetryConfig,
} from "./types.js";
import { buildUrl } from "./url.js";

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_CACHE_TTL = 60_000;
const DEFAULT_CACHE_MAX = 100;

type ResolvedCache = {
	ttl: number;
	store: CacheStore;
	keyFn: (method: HttpMethod, url: string, body: unknown) => string;
	autoCacheGet: boolean;
};

/**
 * Combine an external signal with our internal timeout/abort signal.
 * If either fires, the returned signal aborts.
 */
function combineSignals(...signals: (AbortSignal | undefined)[]): AbortController {
	const controller = new AbortController();
	for (const signal of signals) {
		if (!signal) continue;
		if (signal.aborted) {
			controller.abort(signal.reason);
			break;
		}
		signal.addEventListener(
			"abort",
			() => {
				controller.abort(signal.reason);
			},
			{ once: true },
		);
	}
	return controller;
}

/**
 * Read and parse a response body based on its Content-Type.
 *
 * - `application/json` or `application/graphql-response+json` → parsed JSON
 * - `text/*` → string
 * - Empty body or 204/205 → `null`
 * - Anything else → `Blob`
 */
async function parseResponseBody(response: Response): Promise<unknown> {
	if (response.status === 204 || response.status === 205) return null;
	const contentType = response.headers.get("content-type") ?? "";
	if (contentType.includes("application/json") || contentType.includes("graphql-response+json")) {
		const text = await response.text();
		return text.length === 0 ? null : JSON.parse(text);
	}
	if (contentType.startsWith("text/")) return response.text();
	return response.blob();
}

/**
 * Encode a request body for transmission.
 *
 * Returns `[body, headers]`. `headers` may include `Content-Type` if it
 * was inferred (e.g. JSON encoding); explicit user-provided headers win
 * via shallow-merge upstream.
 */
function encodeBody(body: unknown): [BodyInit | null, Record<string, string>] {
	if (body === undefined || body === null) return [null, {}];
	if (
		body instanceof FormData ||
		body instanceof URLSearchParams ||
		body instanceof Blob ||
		body instanceof ArrayBuffer ||
		typeof body === "string"
	) {
		return [body as BodyInit, {}];
	}
	return [JSON.stringify(body), { "Content-Type": "application/json" }];
}

/**
 * Resolve the user-supplied `cache` config into a normalized internal shape,
 * or `null` when caching is disabled.
 */
function resolveCacheConfig(cache: ClientConfig["cache"]): ResolvedCache | null {
	if (!cache) return null;
	const cfg: CacheConfig = cache === true ? {} : cache;
	const ttl = cfg.ttl ?? DEFAULT_CACHE_TTL;
	const store = cfg.store ?? createMemoryCache(cfg.maxSize ?? DEFAULT_CACHE_MAX);
	const keyFn = cfg.keyFn ?? defaultCacheKey;
	const autoCacheGet = cfg.autoCacheGet ?? true;
	return { ttl, store, keyFn, autoCacheGet };
}

/**
 * Create a typed HTTP client.
 *
 * Built on `fetch`, it adds: timeouts via AbortController, configurable retry
 * with backoff, typed error classes, request/response interceptors, optional
 * schema validation, response caching, in-flight request deduplication, and
 * GraphQL support.
 *
 * @example Basic usage
 * ```ts
 * const api = createClient({ baseUrl: "https://api.example.com" });
 * const user = await api.get<User>("/users/me");
 * ```
 *
 * @example With auth and retry
 * ```ts
 * const api = createClient({
 *   baseUrl: "/api",
 *   timeout: 10_000,
 *   retry: { attempts: 3, backoff: "exponential" },
 *   auth: () => localStorage.getItem("token"),
 *   onError: (err) => logger.error(err),
 * });
 * ```
 *
 * @example With caching + dedupe + GraphQL
 * ```ts
 * const api = createClient({
 *   baseUrl: "https://api.example.com",
 *   cache: { ttl: 30_000 },          // 30s default TTL, in-memory LRU
 *   dedupe: true,                    // share in-flight identical requests
 *   graphqlEndpoint: "/graphql",
 * });
 *
 * const me = await api.graphql<{ me: User }>(`query { me { id name } }`);
 * ```
 *
 * @example With Zod validation
 * ```ts
 * import { z } from "zod";
 * const UserSchema = z.object({ id: z.string(), email: z.string().email() });
 * const user = await api.get("/users/me", { schema: UserSchema });
 * ```
 */
export function createClient(config: ClientConfig = {}): Client {
	const {
		baseUrl,
		timeout = DEFAULT_TIMEOUT,
		retry: defaultRetry,
		headers: defaultHeaders = {},
		auth,
		onError,
		requestInterceptors = [],
		responseInterceptors = [],
		fetch: fetchImpl = globalThis.fetch.bind(globalThis),
		cache: cacheOption,
		dedupe: dedupeEnabled = true,
		graphqlEndpoint,
	} = config;

	const cacheConfig = resolveCacheConfig(cacheOption);
	const inflight = createInflight<unknown>();

	async function executeOnce<T>(
		method: HttpMethod,
		url: string,
		body: unknown,
		options: RequestOptions<T>,
	): Promise<T> {
		const requestTimeout = options.timeout ?? timeout;

		const timeoutController = new AbortController();
		const timeoutId = setTimeout(() => {
			timeoutController.abort(new TimeoutError(requestTimeout));
		}, requestTimeout);

		const combined = combineSignals(options.signal, timeoutController.signal);

		try {
			const headers: Record<string, string> = { ...defaultHeaders, ...options.headers };
			const [encodedBody, bodyHeaders] = encodeBody(body);
			Object.assign(headers, bodyHeaders, options.headers);

			if (auth) {
				const token = await auth();
				if (token) {
					Object.assign(headers, { Authorization: `Bearer ${token}` });
				}
			}

			let init: RequestInit = {
				method,
				headers,
				body: encodedBody,
				signal: combined.signal,
			};

			for (const interceptor of requestInterceptors) {
				const result = await interceptor(url, init);
				if (result) init = result;
			}

			let response: Response;
			try {
				response = await fetchImpl(url, init);
			} catch (err) {
				if (combined.signal.aborted) {
					const reason = combined.signal.reason;
					if (reason instanceof TimeoutError) throw reason;
					throw new AbortError();
				}
				throw new NetworkError(err instanceof Error ? err.message : "Network request failed", {
					cause: err,
				});
			}

			for (const interceptor of responseInterceptors) {
				const result = await interceptor(response);
				if (result) response = result;
			}

			const parsedBody = await parseResponseBody(response);

			if (!response.ok) {
				throw new HttpError(response.status, response.statusText, response, parsedBody);
			}

			if (options.schema) {
				try {
					return options.schema.parse(parsedBody);
				} catch (err) {
					throw new ValidationError(
						err instanceof Error ? err.message : "Schema validation failed",
						err,
					);
				}
			}

			return parsedBody as T;
		} finally {
			clearTimeout(timeoutId);
		}
	}

	async function executeWithRetry<T>(
		method: HttpMethod,
		url: string,
		body: unknown,
		options: RequestOptions<T>,
	): Promise<T> {
		const retry: RetryConfig | undefined = options.retry ?? defaultRetry;
		const attempts = retry?.attempts ?? 0;
		const backoff = retry?.backoff ?? "exponential";
		const retryOn = retry?.retryOn ?? defaultRetryOn;

		let lastError: unknown;
		for (let attempt = 0; attempt <= attempts; attempt++) {
			try {
				return await executeOnce(method, url, body, options);
			} catch (err) {
				lastError = err;
				if (err instanceof AbortError || err instanceof ValidationError) {
					// Aborts and validation errors are never retried.
					throw err;
				}
				if (attempt >= attempts || !retryOn(err, attempt + 1)) {
					throw err;
				}
				const delay = computeBackoff(attempt + 1, backoff);
				await sleep(delay, options.signal);
			}
		}
		throw lastError;
	}

	/**
	 * Run a request through the optional cache + dedupe pipeline.
	 *
	 * `isReadOp` controls whether the request is *eligible* for caching/dedupe
	 * by default; explicit per-request `cache` / `dedupe` overrides still win.
	 * For HTTP this maps to "is GET"; for GraphQL it maps to "is a query".
	 */
	async function runCached<T>(
		method: HttpMethod,
		url: string,
		body: unknown,
		options: RequestOptions<T>,
		isReadOp: boolean,
		cacheKeyOverride?: string,
	): Promise<T> {
		const useCache = (() => {
			if (!cacheConfig) return false;
			if (options.cache === false) return false;
			if (options.cache === undefined) return isReadOp && cacheConfig.autoCacheGet;
			return true;
		})();

		const useDedupe = (() => {
			if (options.dedupe === false) return false;
			if (!dedupeEnabled && options.dedupe !== true) return false;
			if (options.dedupe === undefined) return isReadOp;
			return true;
		})();

		const computeKey = (): string => {
			if (cacheKeyOverride) return cacheKeyOverride;
			if (typeof options.cache === "object" && options.cache?.key) return options.cache.key;
			const keyFn = cacheConfig?.keyFn ?? defaultCacheKey;
			return keyFn(method, url, body);
		};

		const key = useCache || useDedupe ? computeKey() : "";

		if (useCache && cacheConfig) {
			const opt = typeof options.cache === "object" ? options.cache : undefined;
			const bypass = opt?.bypass === true;
			if (!bypass) {
				const entry = await cacheConfig.store.get(key);
				if (entry) return entry.data as T;
			}
		}

		const run = (): Promise<T> => executeWithRetry(method, url, body, options);
		const result = useDedupe ? ((await inflight.run(key, run as never)) as T) : await run();

		if (useCache && cacheConfig) {
			const opt = typeof options.cache === "object" ? options.cache : undefined;
			const ttl = opt?.ttl ?? cacheConfig.ttl;
			await cacheConfig.store.set(key, {
				data: result,
				expiresAt: Date.now() + ttl,
			});
		}

		return result;
	}

	async function request<T>(
		method: HttpMethod,
		path: string,
		body?: unknown,
		options: RequestOptions<T> = {},
	): Promise<T> {
		try {
			const url = buildUrl(baseUrl, path, options.query);
			return await runCached(method, url, body, options, method === "GET");
		} catch (err) {
			onError?.(err);
			throw err;
		}
	}

	async function graphql<TData, TVariables>(
		query: string,
		options: GraphQLOptions<TData, TVariables> = {} as GraphQLOptions<TData, TVariables>,
	): Promise<TData> {
		const {
			variables,
			operationName,
			url: urlOverride,
			operation = "query",
			schema,
			...rest
		} = options;
		const endpoint = urlOverride ?? graphqlEndpoint;
		if (!endpoint) {
			throw new Error(
				"graphql: no endpoint configured. Pass `graphqlEndpoint` to createClient() or `url` per request.",
			);
		}
		const url = buildUrl(baseUrl, endpoint, undefined);
		const body = { query, variables, operationName };
		const isReadOp = operation === "query";

		const cacheKey = `GQL ${url} ${operationName ?? ""} ${query} ${
			variables ? JSON.stringify(variables) : ""
		}`;

		try {
			const envelope = await runCached<GraphQLResponse<TData>>(
				"POST",
				url,
				body,
				rest as RequestOptions<GraphQLResponse<TData>>,
				isReadOp,
				cacheKey,
			);

			if (envelope?.errors && envelope.errors.length > 0) {
				throw new GraphQLError(envelope.errors, envelope.data);
			}
			const data = (envelope?.data ?? null) as TData;
			if (schema) {
				try {
					return schema.parse(data);
				} catch (err) {
					throw new ValidationError(
						err instanceof Error ? err.message : "GraphQL schema validation failed",
						err,
					);
				}
			}
			return data;
		} catch (err) {
			onError?.(err);
			throw err;
		}
	}

	return {
		get: (path, options) => request("GET", path, undefined, options),
		post: (path, body, options) => request("POST", path, body, options),
		put: (path, body, options) => request("PUT", path, body, options),
		patch: (path, body, options) => request("PATCH", path, body, options),
		delete: (path, options) => request("DELETE", path, undefined, options),
		request,
		graphql,
		invalidate: (key) => cacheConfig?.store.delete(key),
		clearCache: () => cacheConfig?.store.clear(),
	};
}
