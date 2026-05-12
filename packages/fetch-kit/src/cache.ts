import type { CacheEntry, CacheStore, HttpMethod } from "./types.js";

/**
 * In-memory LRU cache used as the default response cache store.
 *
 * Combines time-based expiry with size-based eviction. Reads of an expired
 * entry remove it eagerly. Inserts past `maxSize` evict the least-recently-used
 * entry. Implemented on top of `Map` whose iteration order is insertion order;
 * re-inserting a key on hit moves it to the most-recently-used position.
 *
 * Exposed so callers can compose it with their own logic (e.g. wrap with
 * persistence, or pre-warm the cache).
 */
export function createMemoryCache(maxSize: number, now: () => number = Date.now): CacheStore {
	const store = new Map<string, CacheEntry>();

	return {
		get(key) {
			const entry = store.get(key);
			if (!entry) return undefined;
			if (entry.expiresAt <= now()) {
				store.delete(key);
				return undefined;
			}
			// Touch: move to the most-recently-used position.
			store.delete(key);
			store.set(key, entry);
			return entry;
		},
		set(key, entry) {
			if (store.has(key)) {
				store.delete(key);
			} else if (store.size >= maxSize) {
				const oldest = store.keys().next().value;
				if (oldest !== undefined) store.delete(oldest);
			}
			store.set(key, entry);
		},
		delete(key) {
			store.delete(key);
		},
		clear() {
			store.clear();
		},
	};
}

/**
 * Build a stable cache key from a request signature.
 *
 * - Method is uppercased.
 * - URL is taken as-is (caller is responsible for any normalization).
 * - For body-bearing methods, an opaque body fingerprint is appended so that
 *   different payloads don't collide on the same URL.
 *
 * Exposed so callers can reuse the default keying strategy when composing
 * their own `keyFn`.
 */
export function defaultCacheKey(method: HttpMethod | string, url: string, body?: unknown): string {
	const upper = method.toUpperCase();
	if (body === undefined || body === null) return `${upper} ${url}`;
	let fingerprint: string;
	try {
		fingerprint = typeof body === "string" ? body : JSON.stringify(body);
	} catch {
		// Non-serializable bodies (FormData, Blob, etc.) - dedupe is best-effort.
		fingerprint = Object.prototype.toString.call(body);
	}
	return `${upper} ${url} ${fingerprint}`;
}
