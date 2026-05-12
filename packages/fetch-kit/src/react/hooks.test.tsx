import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createClient } from "../create-client.js";
import { useFetch } from "./use-fetch.js";
import { useGraphQL } from "./use-graphql.js";
import { useMutation } from "./use-mutation.js";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
	return new Response(JSON.stringify(body), {
		...init,
		headers: { "content-type": "application/json", ...init?.headers },
	});
}

describe("useFetch", () => {
	it("loads data on mount", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({ id: 1 }));
		const client = createClient({ fetch: fetchSpy });

		const { result } = renderHook(() => useFetch<{ id: number }>(client, "/x"));

		expect(result.current.loading).toBe(true);
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.data).toEqual({ id: 1 });
		expect(result.current.error).toBeUndefined();
	});

	it("captures errors", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({}, { status: 500 }));
		const client = createClient({ fetch: fetchSpy });

		const { result } = renderHook(() => useFetch(client, "/x"));
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.error).toBeDefined();
		expect(result.current.data).toBeUndefined();
	});

	it("does not run when enabled is false", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({}));
		const client = createClient({ fetch: fetchSpy });

		const { result } = renderHook(() => useFetch(client, "/x", { enabled: false }));
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("refetches when refetch is called", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({ count: 1 }));
		const client = createClient({ fetch: fetchSpy });

		const { result } = renderHook(() => useFetch(client, "/x"));
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(fetchSpy).toHaveBeenCalledTimes(1);

		await act(async () => {
			await result.current.refetch();
		});
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});

	it("does not setState after unmount", async () => {
		let resolveResponse: ((res: Response) => void) | undefined;
		const fetchSpy = vi.fn(
			() =>
				new Promise<Response>((r) => {
					resolveResponse = r;
				}),
		);
		const client = createClient({ fetch: fetchSpy as typeof fetch });

		const { result, unmount } = renderHook(() => useFetch(client, "/x"));
		unmount();
		// Resolve after unmount; should not throw or warn
		resolveResponse?.(jsonResponse({ ok: true }));
		// Give microtasks a chance
		await new Promise((r) => setTimeout(r, 10));
		expect(result.current.data).toBeUndefined();
	});
});

describe("useMutation", () => {
	it("does not run on mount", () => {
		const fetchSpy = vi.fn(async () => jsonResponse({}));
		const client = createClient({ fetch: fetchSpy });

		renderHook(() => useMutation(client, "/x"));
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("runs the mutation when mutate is called", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({ id: 7 }));
		const client = createClient({ fetch: fetchSpy });

		const { result } = renderHook(() =>
			useMutation<{ id: number }, { name: string }>(client, "/x"),
		);

		await act(async () => {
			await result.current.mutate({ name: "test" });
		});

		expect(result.current.data).toEqual({ id: 7 });
		expect(fetchSpy).toHaveBeenCalledOnce();
		const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
		expect(init.method).toBe("POST");
		expect(init.body).toBe(JSON.stringify({ name: "test" }));
	});

	it("supports custom HTTP methods", async () => {
		const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
		const client = createClient({ fetch: fetchSpy });

		const { result } = renderHook(() => useMutation(client, "/x", { method: "DELETE" }));
		await act(async () => {
			await result.current.mutate({});
		});
		expect((fetchSpy.mock.calls[0]?.[1] as RequestInit).method).toBe("DELETE");
	});

	it("invokes onSuccess on success", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({ ok: true }));
		const client = createClient({ fetch: fetchSpy });
		const onSuccess = vi.fn();

		const { result } = renderHook(() => useMutation(client, "/x", { onSuccess }));
		await act(async () => {
			await result.current.mutate({ a: 1 });
		});
		expect(onSuccess).toHaveBeenCalledWith({ ok: true }, { a: 1 });
	});

	it("invokes onError on failure", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({}, { status: 500 }));
		const client = createClient({ fetch: fetchSpy });
		const onError = vi.fn();

		const { result } = renderHook(() => useMutation(client, "/x", { onError }));
		await act(async () => {
			await expect(result.current.mutate({})).rejects.toThrow();
		});
		expect(onError).toHaveBeenCalledOnce();
	});

	it("invokes onSettled regardless of outcome", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({}, { status: 500 }));
		const client = createClient({ fetch: fetchSpy });
		const onSettled = vi.fn();

		const { result } = renderHook(() => useMutation(client, "/x", { onSettled }));
		await act(async () => {
			await expect(result.current.mutate({})).rejects.toThrow();
		});
		expect(onSettled).toHaveBeenCalledOnce();
	});

	it("reset clears data and error", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({ ok: true }));
		const client = createClient({ fetch: fetchSpy });

		const { result } = renderHook(() => useMutation(client, "/x"));
		await act(async () => {
			await result.current.mutate({});
		});
		expect(result.current.data).toBeDefined();

		act(() => {
			result.current.reset();
		});
		expect(result.current.data).toBeUndefined();
		expect(result.current.error).toBeUndefined();
	});
});

describe("useGraphQL", () => {
	it("loads data on mount", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({ data: { me: { id: "1" } } }));
		const client = createClient({ fetch: fetchSpy, graphqlEndpoint: "/graphql" });

		const { result } = renderHook(() =>
			useGraphQL<{ me: { id: string } }>(client, "query Me { me { id } }"),
		);

		expect(result.current.loading).toBe(true);
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.data).toEqual({ me: { id: "1" } });
		expect(result.current.error).toBeUndefined();
	});

	it("does not run when enabled is false", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({ data: { x: 1 } }));
		const client = createClient({ fetch: fetchSpy, graphqlEndpoint: "/graphql" });

		const { result } = renderHook(() => useGraphQL(client, "query { x }", { enabled: false }));
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("refetches when refetch is called", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({ data: { x: 1 } }));
		const client = createClient({ fetch: fetchSpy, graphqlEndpoint: "/graphql" });

		const { result } = renderHook(() => useGraphQL(client, "query { x }"));
		await waitFor(() => expect(result.current.loading).toBe(false));
		await act(async () => {
			await result.current.refetch();
		});
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});

	it("captures graphql errors as error state", async () => {
		const fetchSpy = vi.fn(async () =>
			jsonResponse({ data: null, errors: [{ message: "denied" }] }),
		);
		const client = createClient({ fetch: fetchSpy, graphqlEndpoint: "/graphql" });

		const { result } = renderHook(() => useGraphQL(client, "query { x }"));
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.error).toBeDefined();
		expect(result.current.data).toBeUndefined();
	});
});

describe("hook race conditions on deps change", () => {
	function makeFetchSpy(wrap: (payload: { id: number }) => unknown = (p) => p) {
		// Per-call resolver lets the test interleave responses out of order.
		// Mirrors real fetch's behavior of rejecting when the AbortSignal fires.
		const resolvers: Array<(payload: { id: number }) => void> = [];
		const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
			const payload = await new Promise<{ id: number }>((resolve, reject) => {
				const signal = init?.signal;
				if (signal?.aborted) {
					reject(signal.reason ?? new DOMException("aborted", "AbortError"));
					return;
				}
				let captured = false;
				const onAbort = (): void => {
					if (captured) return;
					reject(signal?.reason ?? new DOMException("aborted", "AbortError"));
				};
				signal?.addEventListener("abort", onAbort, { once: true });
				const wrappedResolve = (value: { id: number }): void => {
					captured = true;
					signal?.removeEventListener("abort", onAbort);
					resolve(value);
				};
				resolvers.push(wrappedResolve);
			});
			return new Response(JSON.stringify(wrap(payload)), {
				headers: { "content-type": "application/json" },
			});
		});
		return { fetchSpy, resolvers };
	}

	it("useFetch ignores a stale response that resolves after deps change", async () => {
		const { fetchSpy, resolvers } = makeFetchSpy();
		const client = createClient({ fetch: fetchSpy });

		const { result, rerender } = renderHook(
			({ id }: { id: number }) => useFetch<{ id: number }>(client, "/x", { deps: [id] }),
			{ initialProps: { id: 1 } },
		);

		// Change deps before the first fetch resolves.
		rerender({ id: 2 });

		await waitFor(() => expect(resolvers.length).toBe(2));

		// Resolve the SECOND request first, then the stale first request.
		await act(async () => {
			resolvers[1]?.({ id: 2 });
			await Promise.resolve();
			resolvers[0]?.({ id: 1 });
			await Promise.resolve();
			await Promise.resolve();
		});

		await waitFor(() => expect(result.current.loading).toBe(false));
		// data must reflect the latest deps, not the stale request that landed second.
		expect(result.current.data?.id).toBe(2);
	});

	it("useGraphQL ignores a stale response that resolves after deps change", async () => {
		const { fetchSpy, resolvers } = makeFetchSpy((p) => ({ data: { id: p.id } }));
		const client = createClient({ fetch: fetchSpy, graphqlEndpoint: "/graphql" });

		const { result, rerender } = renderHook(
			({ id }: { id: number }) =>
				useGraphQL<{ id: number }>(client, "query Q($id: ID!) { id }", {
					variables: { id },
					deps: [id],
				}),
			{ initialProps: { id: 1 } },
		);

		rerender({ id: 2 });

		await waitFor(() => expect(resolvers.length).toBe(2));

		await act(async () => {
			resolvers[1]?.({ id: 2 });
			await Promise.resolve();
			resolvers[0]?.({ id: 1 });
			await Promise.resolve();
			await Promise.resolve();
		});

		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.data?.id).toBe(2);
	});
});
