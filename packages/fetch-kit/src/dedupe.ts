import { AbortError } from "./errors.js";

/**
 * Per-sharer wait: subscribe to a shared in-flight request.
 *
 * Each sharer's promise rejects with `AbortError` if **their own** signal
 * aborts, independently of the underlying fetch. The underlying request is
 * cancelled only when every sharer's signal has aborted — that way a single
 * unmount can't yank the response out from under any other caller.
 *
 * @internal
 */
type SharedRequest<T> = {
	/** Subscribers' AbortController, used to surface caller-side aborts. */
	subscribers: number;
	/** AbortController passed to the actual fetch. Aborts when all sharers leave. */
	requestController: AbortController;
	/** The single in-flight promise produced by the runner. */
	promise: Promise<T>;
};

/**
 * In-flight request registry that shares identical concurrent requests while
 * keeping each caller's `AbortSignal` isolated from the others'.
 *
 * - First caller for a given key triggers `run(controller)`.
 * - Concurrent callers with the same key await the same underlying promise
 *   *but* receive a wrapper that rejects with `AbortError` if their own
 *   signal aborts, leaving the shared fetch alive for the rest.
 * - The shared fetch's `AbortController` only aborts once every subscriber
 *   has unsubscribed (i.e. all of their signals aborted).
 *
 * @internal
 */
export function createInflight<T = unknown>() {
	const inflight = new Map<string, SharedRequest<T>>();

	function subscribe(key: string, signal: AbortSignal | undefined): Promise<T> {
		const entry = inflight.get(key);
		if (!entry) throw new Error("subscribe called without an active entry");
		entry.subscribers += 1;

		return new Promise<T>((resolve, reject) => {
			let settled = false;
			const onCallerAbort = (): void => {
				if (settled) return;
				settled = true;
				signal?.removeEventListener("abort", onCallerAbort);
				reject(new AbortError());
				entry.subscribers -= 1;
				if (entry.subscribers === 0) {
					// Everyone has bailed: tear down the underlying fetch and
					// drop the entry eagerly so subsequent callers issue a
					// fresh request instead of subscribing to a dead one. The
					// runner's own `finally` is idempotent because of the
					// `inflight.get(key) === entry` guard.
					if (inflight.get(key) === entry) inflight.delete(key);
					entry.requestController.abort(new AbortError());
				}
			};
			if (signal) {
				if (signal.aborted) {
					onCallerAbort();
					return;
				}
				signal.addEventListener("abort", onCallerAbort, { once: true });
			}
			entry.promise.then(
				(value) => {
					if (settled) return;
					settled = true;
					signal?.removeEventListener("abort", onCallerAbort);
					entry.subscribers -= 1;
					resolve(value);
				},
				(err) => {
					if (settled) return;
					settled = true;
					signal?.removeEventListener("abort", onCallerAbort);
					entry.subscribers -= 1;
					reject(err);
				},
			);
		});
	}

	return {
		get(key: string): Promise<T> | undefined {
			return inflight.get(key)?.promise;
		},
		/**
		 * Run a request through the dedupe layer.
		 *
		 * `signal` is the caller's signal. It only affects the caller's view of
		 * the shared promise. The `runner` receives a dedicated `AbortController`
		 * whose signal it should pipe into the underlying fetch — aborting it
		 * tears down the shared work.
		 */
		run(
			key: string,
			runner: (sharedController: AbortController) => Promise<T>,
			signal?: AbortSignal,
		): Promise<T> {
			const existing = inflight.get(key);
			if (existing) return subscribe(key, signal);
			const sharedController = new AbortController();
			const entry: SharedRequest<T> = {
				subscribers: 0,
				requestController: sharedController,
				promise: runner(sharedController).finally(() => {
					if (inflight.get(key) === entry) inflight.delete(key);
				}),
			};
			inflight.set(key, entry);
			return subscribe(key, signal);
		},
		clear() {
			inflight.clear();
		},
		get size() {
			return inflight.size;
		},
	};
}
