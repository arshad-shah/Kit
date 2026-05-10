import { AbortError, HttpError, NetworkError, TimeoutError, ValidationError } from "./errors.js";
import { computeBackoff, defaultRetryOn, sleep } from "./retry.js";
import type { Client, ClientConfig, HttpMethod, RequestOptions, RetryConfig } from "./types.js";
import { buildUrl } from "./url.js";

const DEFAULT_TIMEOUT = 30_000;

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
 * - `application/json` → parsed JSON
 * - `text/*` → string
 * - Empty body or 204/205 → `null`
 * - Anything else → `Blob`
 */
async function parseResponseBody(response: Response): Promise<unknown> {
	if (response.status === 204 || response.status === 205) return null;
	const contentType = response.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
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
 * Create a typed HTTP client.
 *
 * The client is a thin wrapper over `fetch` that adds: timeouts via AbortController,
 * configurable retry with backoff, typed error classes, request/response interceptors,
 * and optional schema validation. It does not cache responses or manage server state -
 * pair it with TanStack Query or `useFetch` (`@arshad-shah/fetch-kit/react`) for that.
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
 * @example With Zod validation
 * ```ts
 * import { z } from "zod";
 * const UserSchema = z.object({ id: z.string(), email: z.string().email() });
 * const user = await api.get("/users/me", { schema: UserSchema });
 * // user is fully typed as { id: string; email: string }
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
	} = config;

	async function executeOnce<T>(
		method: HttpMethod,
		path: string,
		body: unknown,
		options: RequestOptions<T>,
	): Promise<T> {
		const url = buildUrl(baseUrl, path, options.query);
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
		path: string,
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
				return await executeOnce(method, path, body, options);
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

	async function request<T>(
		method: HttpMethod,
		path: string,
		body?: unknown,
		options: RequestOptions<T> = {},
	): Promise<T> {
		try {
			return await executeWithRetry(method, path, body, options);
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
	};
}
