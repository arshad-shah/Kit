import type { KitStorage, StorageBackend } from "./types.js";

/**
 * In-memory storage. Used as a fallback in non-browser environments
 * and for tests. Per-instance, not shared across calls.
 */
function createMemoryStorage(): KitStorage {
	const map = new Map<string, string>();
	return {
		getItem: (key) => map.get(key) ?? null,
		setItem: (key, value) => {
			map.set(key, value);
		},
		removeItem: (key) => {
			map.delete(key);
		},
	};
}

/**
 * Detect whether a Web Storage API is available and usable.
 *
 * Storage may exist but throw on access in some environments
 * (Safari private mode, disabled cookies, sandboxed iframes).
 * We probe with a write/read/delete cycle.
 */
function isStorageAvailable(storage: Storage | undefined): storage is Storage {
	if (!storage) return false;
	try {
		const testKey = "__kit_probe__";
		storage.setItem(testKey, "1");
		storage.removeItem(testKey);
		return true;
	} catch {
		return false;
	}
}

/**
 * Resolve a {@link StorageBackend} identifier to a usable storage implementation.
 *
 * Falls back to memory storage when the requested backend is unavailable
 * (SSR, private mode, disabled storage). This is a deliberate
 * fail-soft choice: a missing storage should not crash the app.
 *
 * @internal
 */
export function resolveStorage(backend: StorageBackend = "local"): KitStorage {
	if (typeof backend === "object") return backend;

	if (backend === "memory") return createMemoryStorage();

	if (typeof globalThis === "undefined" || typeof window === "undefined") {
		return createMemoryStorage();
	}

	const target = backend === "session" ? window.sessionStorage : window.localStorage;
	if (!isStorageAvailable(target)) return createMemoryStorage();

	return target;
}
