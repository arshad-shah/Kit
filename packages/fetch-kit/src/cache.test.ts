import { describe, expect, it } from "vitest";
import { createMemoryCache, defaultCacheKey } from "./cache.js";

describe("createMemoryCache", () => {
	it("stores and retrieves entries", () => {
		const cache = createMemoryCache(10);
		cache.set("a", { data: 1, expiresAt: Date.now() + 1000 });
		expect(cache.get("a")?.data).toBe(1);
	});

	it("returns undefined for unknown keys", () => {
		const cache = createMemoryCache(10);
		expect(cache.get("missing")).toBeUndefined();
	});

	it("expires entries past their expiresAt", () => {
		let now = 0;
		const cache = createMemoryCache(10, () => now);
		cache.set("a", { data: 1, expiresAt: 100 });
		now = 50;
		expect(cache.get("a")?.data).toBe(1);
		now = 200;
		expect(cache.get("a")).toBeUndefined();
	});

	it("treats entries reaching expiresAt as expired", () => {
		let now = 0;
		const cache = createMemoryCache(10, () => now);
		cache.set("a", { data: 1, expiresAt: 100 });
		now = 100;
		expect(cache.get("a")).toBeUndefined();
	});

	it("evicts the least-recently-used entry when full", () => {
		const cache = createMemoryCache(2);
		cache.set("a", { data: 1, expiresAt: Date.now() + 1000 });
		cache.set("b", { data: 2, expiresAt: Date.now() + 1000 });
		// Touch a so b is now LRU.
		cache.get("a");
		cache.set("c", { data: 3, expiresAt: Date.now() + 1000 });
		expect(cache.get("b")).toBeUndefined();
		expect(cache.get("a")?.data).toBe(1);
		expect(cache.get("c")?.data).toBe(3);
	});

	it("re-inserting an existing key does not evict others", () => {
		const cache = createMemoryCache(2);
		cache.set("a", { data: 1, expiresAt: Date.now() + 1000 });
		cache.set("b", { data: 2, expiresAt: Date.now() + 1000 });
		cache.set("a", { data: 11, expiresAt: Date.now() + 1000 });
		expect(cache.get("a")?.data).toBe(11);
		expect(cache.get("b")?.data).toBe(2);
	});

	it("delete removes an entry", () => {
		const cache = createMemoryCache(10);
		cache.set("a", { data: 1, expiresAt: Date.now() + 1000 });
		cache.delete("a");
		expect(cache.get("a")).toBeUndefined();
	});

	it("clear empties the cache", () => {
		const cache = createMemoryCache(10);
		cache.set("a", { data: 1, expiresAt: Date.now() + 1000 });
		cache.set("b", { data: 2, expiresAt: Date.now() + 1000 });
		cache.clear();
		expect(cache.get("a")).toBeUndefined();
		expect(cache.get("b")).toBeUndefined();
	});
});

describe("defaultCacheKey", () => {
	it("uppercases the method", () => {
		expect(defaultCacheKey("get", "/x")).toBe("GET /x");
	});

	it("returns method + url for body-less requests", () => {
		expect(defaultCacheKey("GET", "/users")).toBe("GET /users");
		expect(defaultCacheKey("GET", "/users", null)).toBe("GET /users");
		expect(defaultCacheKey("GET", "/users", undefined)).toBe("GET /users");
	});

	it("appends a JSON fingerprint for object bodies", () => {
		expect(defaultCacheKey("POST", "/x", { a: 1 })).toBe('POST /x {"a":1}');
	});

	it("appends string bodies as-is", () => {
		expect(defaultCacheKey("POST", "/x", "hello")).toBe("POST /x hello");
	});

	it("handles non-serializable bodies without throwing", () => {
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		expect(() => defaultCacheKey("POST", "/x", circular)).not.toThrow();
	});
});
