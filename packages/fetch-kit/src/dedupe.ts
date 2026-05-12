/**
 * In-flight request registry used to share identical concurrent requests.
 *
 * The first caller for a given key triggers the actual fetch; concurrent callers
 * with the same key await the same promise. The entry is removed once the
 * promise settles, so subsequent calls trigger a fresh fetch (or hit the cache).
 *
 * @internal
 */
export function createInflight<T = unknown>() {
	const inflight = new Map<string, Promise<T>>();

	return {
		get(key: string): Promise<T> | undefined {
			return inflight.get(key);
		},
		run(key: string, fn: () => Promise<T>): Promise<T> {
			const existing = inflight.get(key);
			if (existing) return existing;
			const promise = fn().finally(() => {
				if (inflight.get(key) === promise) inflight.delete(key);
			});
			inflight.set(key, promise);
			return promise;
		},
		clear() {
			inflight.clear();
		},
		get size() {
			return inflight.size;
		},
	};
}
