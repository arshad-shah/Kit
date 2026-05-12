import { describe, expect, it, vi } from "vitest";
import { createClient } from "./create-client.js";
import { GraphQLError, ValidationError } from "./errors.js";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
	return new Response(JSON.stringify(body), {
		...init,
		headers: { "content-type": "application/json", ...init?.headers },
	});
}

function deferredFetch(value: unknown): {
	fetchSpy: ReturnType<typeof vi.fn>;
	resolve: () => void;
} {
	let release!: () => void;
	const gate = new Promise<void>((r) => {
		release = r;
	});
	const fetchSpy = vi.fn(async () => {
		await gate;
		return jsonResponse(value);
	});
	return { fetchSpy, resolve: release };
}

describe("response cache", () => {
	it("does not cache by default", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({ n: 1 }));
		const api = createClient({ fetch: fetchSpy });
		await api.get("/x");
		await api.get("/x");
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});

	it("caches GET responses when cache is enabled", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({ n: 1 }));
		const api = createClient({ fetch: fetchSpy, cache: true });
		await api.get("/x");
		await api.get("/x");
		expect(fetchSpy).toHaveBeenCalledOnce();
	});

	it("does not cache mutations by default even when cache is enabled", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({ n: 1 }));
		const api = createClient({ fetch: fetchSpy, cache: true });
		await api.post("/x", { a: 1 });
		await api.post("/x", { a: 1 });
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});

	it("respects per-request cache: false to bypass caching", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({ n: 1 }));
		const api = createClient({ fetch: fetchSpy, cache: true });
		await api.get("/x");
		await api.get("/x", { cache: false });
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});

	it("per-request cache: true opts in even for mutations", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({ n: 1 }));
		const api = createClient({ fetch: fetchSpy, cache: true });
		await api.post("/x", { a: 1 }, { cache: true });
		await api.post("/x", { a: 1 }, { cache: true });
		expect(fetchSpy).toHaveBeenCalledOnce();
	});

	it("expires cache entries after TTL", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({ n: 1 }));
		const api = createClient({ fetch: fetchSpy, cache: { ttl: 1 } });
		await api.get("/x");
		await new Promise((r) => setTimeout(r, 5));
		await api.get("/x");
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});

	it("supports per-request TTL override", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({ n: 1 }));
		const api = createClient({ fetch: fetchSpy, cache: { ttl: 60_000 } });
		await api.get("/x", { cache: { ttl: 1 } });
		await new Promise((r) => setTimeout(r, 5));
		await api.get("/x");
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});

	it("supports bypass to fetch fresh while still updating cache", async () => {
		let count = 0;
		const fetchSpy = vi.fn(async () => jsonResponse({ n: ++count }));
		const api = createClient({ fetch: fetchSpy, cache: true });
		expect(await api.get<{ n: number }>("/x")).toEqual({ n: 1 });
		expect(await api.get<{ n: number }>("/x", { cache: { bypass: true } })).toEqual({ n: 2 });
		// Subsequent GET hits the refreshed cache.
		expect(await api.get<{ n: number }>("/x")).toEqual({ n: 2 });
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});

	it("invalidate() drops a cached entry", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({ n: 1 }));
		const api = createClient({ fetch: fetchSpy, cache: true });
		await api.get("/x");
		await api.invalidate("GET /x");
		await api.get("/x");
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});

	it("clearCache() drops all cached entries", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({ n: 1 }));
		const api = createClient({ fetch: fetchSpy, cache: true });
		await api.get("/x");
		await api.get("/y");
		await api.clearCache();
		await api.get("/x");
		await api.get("/y");
		expect(fetchSpy).toHaveBeenCalledTimes(4);
	});

	it("invalidate and clearCache are no-ops when cache is disabled", async () => {
		const api = createClient();
		await expect(Promise.resolve(api.invalidate("k"))).resolves.toBeUndefined();
		await expect(Promise.resolve(api.clearCache())).resolves.toBeUndefined();
	});

	it("supports a custom store", async () => {
		const data = new Map<string, { data: unknown; expiresAt: number }>();
		const fetchSpy = vi.fn(async () => jsonResponse({ ok: true }));
		const api = createClient({
			fetch: fetchSpy,
			cache: {
				store: {
					get: (k) => data.get(k),
					set: (k, v) => {
						data.set(k, v);
					},
					delete: (k) => {
						data.delete(k);
					},
					clear: () => data.clear(),
				},
			},
		});
		await api.get("/x");
		expect(data.size).toBe(1);
		await api.get("/x");
		expect(fetchSpy).toHaveBeenCalledOnce();
	});

	it("supports a custom keyFn", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({ ok: true }));
		const api = createClient({
			fetch: fetchSpy,
			cache: { keyFn: () => "static-key" },
		});
		await api.get("/x");
		await api.get("/y"); // collides because keyFn returns the same key
		expect(fetchSpy).toHaveBeenCalledOnce();
	});

	it("autoCacheGet: false requires per-request opt-in", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({ ok: true }));
		const api = createClient({ fetch: fetchSpy, cache: { autoCacheGet: false } });
		await api.get("/x");
		await api.get("/x");
		expect(fetchSpy).toHaveBeenCalledTimes(2);
		// Plain GETs still bypass; only explicit cache:true requests use the cache.
		await api.get("/x", { cache: true });
		await api.get("/x", { cache: true });
		expect(fetchSpy).toHaveBeenCalledTimes(3);
	});
});

describe("request deduplication", () => {
	it("dedupes concurrent identical GETs by default", async () => {
		const { fetchSpy, resolve } = deferredFetch({ ok: true });
		const api = createClient({ fetch: fetchSpy });
		const [a, b] = [api.get("/x"), api.get("/x")];
		resolve();
		await Promise.all([a, b]);
		expect(fetchSpy).toHaveBeenCalledOnce();
	});

	it("does not dedupe mutations by default", async () => {
		const { fetchSpy, resolve } = deferredFetch({ ok: true });
		const api = createClient({ fetch: fetchSpy });
		const [a, b] = [api.post("/x", { a: 1 }), api.post("/x", { a: 1 })];
		resolve();
		await Promise.all([a, b]);
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});

	it("can be disabled per request via dedupe: false", async () => {
		const { fetchSpy, resolve } = deferredFetch({ ok: true });
		const api = createClient({ fetch: fetchSpy });
		const [a, b] = [api.get("/x"), api.get("/x", { dedupe: false })];
		resolve();
		await Promise.all([a, b]);
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});

	it("can be disabled globally and re-enabled per request", async () => {
		const { fetchSpy, resolve } = deferredFetch({ ok: true });
		const api = createClient({ fetch: fetchSpy, dedupe: false });
		const [a, b] = [api.get("/x"), api.get("/x")];
		resolve();
		await Promise.all([a, b]);
		expect(fetchSpy).toHaveBeenCalledTimes(2);

		fetchSpy.mockClear();
		const { fetchSpy: spy2, resolve: r2 } = deferredFetch({ ok: true });
		const api2 = createClient({ fetch: spy2, dedupe: false });
		const [c, d] = [api2.get("/x", { dedupe: true }), api2.get("/x", { dedupe: true })];
		r2();
		await Promise.all([c, d]);
		expect(spy2).toHaveBeenCalledOnce();
	});

	it("releases the inflight slot after the promise settles", async () => {
		let count = 0;
		const fetchSpy = vi.fn(async () => jsonResponse({ n: ++count }));
		const api = createClient({ fetch: fetchSpy });
		await api.get("/x");
		await api.get("/x");
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});
});

describe("graphql", () => {
	it("POSTs to the configured endpoint with query/variables", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({ data: { me: { id: "1" } } }));
		const api = createClient({
			fetch: fetchSpy,
			baseUrl: "https://api.example.com",
			graphqlEndpoint: "/graphql",
		});
		const data = await api.graphql<{ me: { id: string } }>(
			"query Me($id: ID!) { me(id: $id) { id } }",
			{ variables: { id: "1" }, operationName: "Me" },
		);
		expect(data).toEqual({ me: { id: "1" } });
		const [url, init] = fetchSpy.mock.calls[0] ?? [];
		expect(url).toBe("https://api.example.com/graphql");
		expect((init as RequestInit).method).toBe("POST");
		const parsed = JSON.parse((init as RequestInit).body as string);
		expect(parsed).toEqual({
			query: "query Me($id: ID!) { me(id: $id) { id } }",
			variables: { id: "1" },
			operationName: "Me",
		});
	});

	it("throws GraphQLError when the response contains errors", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({ data: null, errors: [{ message: "boom" }] }));
		const api = createClient({ fetch: fetchSpy, graphqlEndpoint: "/graphql" });
		await expect(api.graphql("query { x }")).rejects.toBeInstanceOf(GraphQLError);
	});

	it("preserves partial data alongside errors", async () => {
		const fetchSpy = vi.fn(async () =>
			jsonResponse({ data: { x: 1 }, errors: [{ message: "partial" }] }),
		);
		const api = createClient({ fetch: fetchSpy, graphqlEndpoint: "/graphql" });
		await api.graphql("query { x }").catch((err: unknown) => {
			expect(err).toBeInstanceOf(GraphQLError);
			expect((err as GraphQLError).data).toEqual({ x: 1 });
			expect((err as GraphQLError).errors[0]?.message).toBe("partial");
		});
	});

	it("throws when no endpoint is configured", async () => {
		const api = createClient();
		await expect(api.graphql("query { x }")).rejects.toThrow(/no endpoint/);
	});

	it("allows per-request url override", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({ data: { x: 1 } }));
		const api = createClient({ fetch: fetchSpy });
		const data = await api.graphql<{ x: number }>("query { x }", {
			url: "https://other.example/graphql",
		});
		expect(data).toEqual({ x: 1 });
		expect(fetchSpy.mock.calls[0]?.[0]).toBe("https://other.example/graphql");
	});

	it("caches queries when caching is enabled", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({ data: { x: 1 } }));
		const api = createClient({
			fetch: fetchSpy,
			graphqlEndpoint: "/graphql",
			cache: true,
		});
		await api.graphql("query { x }");
		await api.graphql("query { x }");
		expect(fetchSpy).toHaveBeenCalledOnce();
	});

	it("differentiates cached queries by variables", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({ data: { x: 1 } }));
		const api = createClient({
			fetch: fetchSpy,
			graphqlEndpoint: "/graphql",
			cache: true,
		});
		await api.graphql("query Q($id: ID!) { x(id: $id) }", { variables: { id: "1" } });
		await api.graphql("query Q($id: ID!) { x(id: $id) }", { variables: { id: "2" } });
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});

	it("does not cache mutations by default", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({ data: { ok: true } }));
		const api = createClient({
			fetch: fetchSpy,
			graphqlEndpoint: "/graphql",
			cache: true,
		});
		await api.graphql("mutation { ok }", { operation: "mutation" });
		await api.graphql("mutation { ok }", { operation: "mutation" });
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});

	it("dedupes concurrent identical queries", async () => {
		const { fetchSpy, resolve } = deferredFetch({ data: { x: 1 } });
		const api = createClient({ fetch: fetchSpy, graphqlEndpoint: "/graphql" });
		const [a, b] = [api.graphql("query { x }"), api.graphql("query { x }")];
		resolve();
		await Promise.all([a, b]);
		expect(fetchSpy).toHaveBeenCalledOnce();
	});

	it("validates response data against a provided schema", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({ data: { name: 42 } }));
		const api = createClient({ fetch: fetchSpy, graphqlEndpoint: "/graphql" });
		await expect(
			api.graphql("query { name }", {
				schema: {
					parse: (input: unknown) => {
						const obj = input as { name: unknown };
						if (typeof obj.name !== "string") throw new Error("expected string");
						return obj as { name: string };
					},
				},
			}),
		).rejects.toBeInstanceOf(ValidationError);
	});

	it("accepts graphql-response+json content type", async () => {
		const fetchSpy = vi.fn(
			async () =>
				new Response(JSON.stringify({ data: { x: 1 } }), {
					headers: { "content-type": "application/graphql-response+json" },
				}),
		);
		const api = createClient({ fetch: fetchSpy, graphqlEndpoint: "/graphql" });
		expect(await api.graphql("query { x }")).toEqual({ x: 1 });
	});
});
