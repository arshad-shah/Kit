/**
 * Base class for all errors thrown by fetch-kit.
 *
 * Use `instanceof FetchKitError` to catch any kit error,
 * or check specific subclasses for fine-grained handling.
 */
export class FetchKitError extends Error {
	override readonly name: string = "FetchKitError";
}

/**
 * Thrown when the network call itself fails (DNS, offline, CORS, refused).
 * The original error is exposed on `cause`.
 */
export class NetworkError extends FetchKitError {
	override readonly name = "NetworkError";
}

/**
 * Thrown when a request exceeds its configured timeout.
 */
export class TimeoutError extends FetchKitError {
	override readonly name = "TimeoutError";

	constructor(public readonly timeoutMs: number) {
		super(`Request timed out after ${timeoutMs}ms`);
	}
}

/**
 * Thrown when a request is aborted via an external AbortSignal
 * (e.g. component unmount or manual cancellation).
 */
export class AbortError extends FetchKitError {
	override readonly name = "AbortError";

	constructor() {
		super("Request was aborted");
	}
}

/**
 * Thrown when the server responds with a non-2xx status.
 *
 * The full Response object is preserved so callers can read headers,
 * stream the body, or re-handle as needed.
 */
export class HttpError extends FetchKitError {
	override readonly name = "HttpError";

	constructor(
		public readonly status: number,
		public readonly statusText: string,
		public readonly response: Response,
		public readonly body: unknown,
	) {
		super(`HTTP ${status} ${statusText}`);
	}

	/** Returns true for 4xx errors (client errors). */
	get isClientError(): boolean {
		return this.status >= 400 && this.status < 500;
	}

	/** Returns true for 5xx errors (server errors). */
	get isServerError(): boolean {
		return this.status >= 500 && this.status < 600;
	}
}

/**
 * Thrown when a response body fails schema validation.
 * The original validation issues are exposed on `issues`.
 */
export class ValidationError extends FetchKitError {
	override readonly name = "ValidationError";

	constructor(
		message: string,
		public readonly issues: unknown,
	) {
		super(message);
	}
}
