import { HttpError, NetworkError } from "./errors.js";
import type { BackoffStrategy } from "./types.js";

const MAX_BACKOFF_MS = 30_000;

/**
 * Compute the delay before the next retry attempt.
 *
 * `attempt` is 1-indexed: the first retry is attempt 1.
 *
 * @internal
 */
export function computeBackoff(attempt: number, strategy: BackoffStrategy): number {
	if (typeof strategy === "function") {
		return Math.max(0, strategy(attempt));
	}
	if (strategy === "linear") {
		return Math.min(attempt * 100, MAX_BACKOFF_MS);
	}
	// exponential: 100, 200, 400, 800, ...
	return Math.min(2 ** (attempt - 1) * 100, MAX_BACKOFF_MS);
}

/**
 * Default retry predicate: retry on transient failures only.
 *
 * - Network errors (offline, DNS, connection refused) → retry
 * - 5xx server errors → retry
 * - 408 Request Timeout, 429 Too Many Requests → retry
 * - 4xx client errors (other) → do not retry, they are deterministic
 *
 * @internal
 */
export function defaultRetryOn(error: unknown): boolean {
	if (error instanceof NetworkError) return true;
	if (error instanceof HttpError) {
		if (error.status === 408 || error.status === 429) return true;
		return error.isServerError;
	}
	return false;
}

/**
 * Sleep for `ms` milliseconds, respecting an optional abort signal.
 *
 * @internal
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason);
			return;
		}
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timer);
			reject(signal?.reason);
		};
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}
