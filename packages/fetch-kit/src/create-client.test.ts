import { describe, expect, it, vi } from "vitest";
import { createClient } from "./create-client.js";
import {
	AbortError,
	FetchKitError,
	HttpError,
	NetworkError,
	TimeoutError,
	ValidationError,
} from "./errors.js";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
	return new Response(JSON.stringify(body), {
		...init,
		headers: { "content-type": "application/json", ...init?.headers },
	});
}

describe("createClient", () => {
	describe("basic methods", () => {
		it("performs GET requests", async () => {
			const fetchSpy = vi.fn(async () => jsonResponse({ ok: true }));
			const api = createClient({ fetch: fetchSpy });
			const result = await api.get("/users");
			expect(result).toEqual({ ok: true });
			expect(fetchSpy).toHaveBeenCalledOnce();
			const [url, init] = fetchSpy.mock.calls[0] ?? [];
			expect(url).toBe("/users");
			expect((init as RequestInit).method).toBe("GET");
		});

		it("performs POST requests with JSON body", async () => {
			const fetchSpy = vi.fn(async () => jsonResponse({ id: 1 }));
			const api = createClient({ fetch: fetchSpy });
			await api.post("/users", { name: "Arshad" });
			const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
			expect(init.method).toBe("POST");
			expect(init.body).toBe(JSON.stringify({ name: "Arshad" }));
			expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
		});

		it("lets a client-level default Content-Type win over the inferred JSON type", async () => {
			// A consumer configured a default Content-Type. Encoding a JSON body
			// must not silently override that explicit choice.
			const fetchSpy = vi.fn(async () => jsonResponse({ ok: true }));
			const api = createClient({
				fetch: fetchSpy,
				headers: { "Content-Type": "application/merge-patch+json" },
			});
			await api.patch("/x", { a: 1 });
			const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
			expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
				"application/merge-patch+json",
			);
		});

		it("performs PUT, PATCH, DELETE", async () => {
			const fetchSpy = vi.fn(async () => jsonResponse({ ok: true }));
			const api = createClient({ fetch: fetchSpy });
			await api.put("/x", { a: 1 });
			await api.patch("/x", { a: 1 });
			await api.delete("/x");
			expect(fetchSpy.mock.calls.map((c) => (c[1] as RequestInit).method)).toEqual([
				"PUT",
				"PATCH",
				"DELETE",
			]);
		});
	});

	describe("baseUrl", () => {
		it("prepends baseUrl to relative paths", async () => {
			const fetchSpy = vi.fn(async () => jsonResponse({}));
			const api = createClient({ fetch: fetchSpy, baseUrl: "https://api.com" });
			await api.get("/users");
			expect(fetchSpy.mock.calls[0]?.[0]).toBe("https://api.com/users");
		});
	});

	describe("auth", () => {
		it("uses the returned string as the Authorization header verbatim", async () => {
			const fetchSpy = vi.fn(async () => jsonResponse({}));
			const api = createClient({ fetch: fetchSpy, auth: () => "Bearer abc123" });
			await api.get("/x");
			const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
			expect((init.headers as Record<string, string>).Authorization).toBe("Bearer abc123");
		});

		it("does not prefix Bearer (caller controls the scheme)", async () => {
			const fetchSpy = vi.fn(async () => jsonResponse({}));
			const api = createClient({ fetch: fetchSpy, auth: () => "Token xyz" });
			await api.get("/x");
			const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
			expect((init.headers as Record<string, string>).Authorization).toBe("Token xyz");
		});

		it("supports raw API-key values (no scheme prefix)", async () => {
			const fetchSpy = vi.fn(async () => jsonResponse({}));
			const api = createClient({ fetch: fetchSpy, auth: () => "raw-api-key" });
			await api.get("/x");
			const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
			expect((init.headers as Record<string, string>).Authorization).toBe("raw-api-key");
		});

		it("supports custom header names via the object form", async () => {
			const fetchSpy = vi.fn(async () => jsonResponse({}));
			const api = createClient({
				fetch: fetchSpy,
				auth: () => ({ header: "X-Api-Key", token: "key123" }),
			});
			await api.get("/x");
			const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
			expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe("key123");
			expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
		});

		it("supports scheme + token via the object form", async () => {
			const fetchSpy = vi.fn(async () => jsonResponse({}));
			const api = createClient({
				fetch: fetchSpy,
				auth: () => ({ scheme: "Bearer", token: "abc" }),
			});
			await api.get("/x");
			const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
			expect((init.headers as Record<string, string>).Authorization).toBe("Bearer abc");
		});

		it("omits the header when auth returns null", async () => {
			const fetchSpy = vi.fn(async () => jsonResponse({}));
			const api = createClient({ fetch: fetchSpy, auth: () => null });
			await api.get("/x");
			const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
			expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
		});

		it("omits the header when auth returns undefined", async () => {
			const fetchSpy = vi.fn(async () => jsonResponse({}));
			const api = createClient({ fetch: fetchSpy, auth: () => undefined });
			await api.get("/x");
			const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
			expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
		});

		it("supports an async auth function", async () => {
			const fetchSpy = vi.fn(async () => jsonResponse({}));
			const api = createClient({
				fetch: fetchSpy,
				auth: async () => "Bearer refreshed",
			});
			await api.get("/x");
			const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
			expect((init.headers as Record<string, string>).Authorization).toBe("Bearer refreshed");
		});
	});

	describe("errors", () => {
		it("throws HttpError on non-2xx responses", async () => {
			const fetchSpy = vi.fn(async () =>
				jsonResponse({ message: "not found" }, { status: 404, statusText: "Not Found" }),
			);
			const api = createClient({ fetch: fetchSpy });
			await expect(api.get("/x")).rejects.toBeInstanceOf(HttpError);
		});

		it("preserves response body in HttpError", async () => {
			const fetchSpy = vi.fn(async () => jsonResponse({ message: "denied" }, { status: 403 }));
			const api = createClient({ fetch: fetchSpy });
			try {
				await api.get("/x");
				expect.fail("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(HttpError);
				const httpErr = err as HttpError;
				expect(httpErr.status).toBe(403);
				expect(httpErr.body).toEqual({ message: "denied" });
				expect(httpErr.isClientError).toBe(true);
				expect(httpErr.isServerError).toBe(false);
			}
		});

		it("throws HttpError (not a JSON SyntaxError) when an error body is malformed JSON", async () => {
			// Server returns an error status with a JSON content-type but a body
			// that isn't valid JSON (e.g. an HTML error page from a proxy). The
			// typed HttpError must survive - a raw SyntaxError would hide the status.
			const fetchSpy = vi.fn(
				async () =>
					new Response("<html>502 Bad Gateway</html>", {
						status: 502,
						statusText: "Bad Gateway",
						headers: { "content-type": "application/json" },
					}),
			);
			const api = createClient({ fetch: fetchSpy });
			try {
				await api.get("/x");
				expect.fail("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(HttpError);
				const httpErr = err as HttpError;
				expect(httpErr.status).toBe(502);
				// The unparseable body is surfaced as raw text rather than dropped.
				expect(httpErr.body).toBe("<html>502 Bad Gateway</html>");
			}
		});

		it("classifies 5xx as server errors", async () => {
			const fetchSpy = vi.fn(async () => jsonResponse({}, { status: 500 }));
			const api = createClient({ fetch: fetchSpy });
			try {
				await api.get("/x");
			} catch (err) {
				expect((err as HttpError).isServerError).toBe(true);
			}
		});

		it("throws NetworkError when fetch rejects", async () => {
			const fetchSpy = vi.fn(async () => {
				throw new TypeError("Failed to fetch");
			});
			const api = createClient({ fetch: fetchSpy });
			await expect(api.get("/x")).rejects.toBeInstanceOf(NetworkError);
		});

		it("all errors extend FetchKitError", async () => {
			const fetchSpy = vi.fn(async () => jsonResponse({}, { status: 500 }));
			const api = createClient({ fetch: fetchSpy });
			try {
				await api.get("/x");
			} catch (err) {
				expect(err).toBeInstanceOf(FetchKitError);
			}
		});

		it("calls onError when a request fails", async () => {
			const onError = vi.fn();
			const fetchSpy = vi.fn(async () => jsonResponse({}, { status: 500 }));
			const api = createClient({ fetch: fetchSpy, onError });
			await expect(api.get("/x")).rejects.toThrow();
			expect(onError).toHaveBeenCalledOnce();
		});
	});

	describe("timeout", () => {
		it("throws TimeoutError when request exceeds timeout", async () => {
			vi.useFakeTimers();
			const fetchSpy = vi.fn(
				(_url: string, init?: RequestInit) =>
					new Promise<Response>((_resolve, reject) => {
						init?.signal?.addEventListener("abort", () => {
							reject(init.signal?.reason);
						});
					}),
			);
			const api = createClient({ fetch: fetchSpy, timeout: 100 });
			const promise = api.get("/x");
			vi.advanceTimersByTime(100);
			await expect(promise).rejects.toBeInstanceOf(TimeoutError);
			vi.useRealTimers();
		});
	});

	describe("abort", () => {
		it("throws AbortError when external signal aborts", async () => {
			const controller = new AbortController();
			const fetchSpy = vi.fn(
				(_url: string, init?: RequestInit) =>
					new Promise<Response>((_resolve, reject) => {
						init?.signal?.addEventListener("abort", () => {
							reject(new DOMException("aborted", "AbortError"));
						});
					}),
			);
			const api = createClient({ fetch: fetchSpy });
			const promise = api.get("/x", { signal: controller.signal });
			controller.abort();
			await expect(promise).rejects.toBeInstanceOf(AbortError);
		});
	});

	describe("retry", () => {
		it("retries on 5xx errors when configured", async () => {
			let calls = 0;
			const fetchSpy = vi.fn(async () => {
				calls++;
				if (calls < 3) return jsonResponse({}, { status: 500 });
				return jsonResponse({ ok: true });
			});
			const api = createClient({
				fetch: fetchSpy,
				retry: { attempts: 3, backoff: () => 0 },
			});
			const result = await api.get("/x");
			expect(result).toEqual({ ok: true });
			expect(calls).toBe(3);
		});

		it("does not retry on 4xx errors by default", async () => {
			let calls = 0;
			const fetchSpy = vi.fn(async () => {
				calls++;
				return jsonResponse({}, { status: 404 });
			});
			const api = createClient({
				fetch: fetchSpy,
				retry: { attempts: 3, backoff: () => 0 },
			});
			await expect(api.get("/x")).rejects.toBeInstanceOf(HttpError);
			expect(calls).toBe(1);
		});

		it("respects custom retryOn predicate", async () => {
			let calls = 0;
			const fetchSpy = vi.fn(async () => {
				calls++;
				return jsonResponse({}, { status: 404 });
			});
			const api = createClient({
				fetch: fetchSpy,
				retry: {
					attempts: 2,
					backoff: () => 0,
					retryOn: (err) => err instanceof HttpError && err.status === 404,
				},
			});
			await expect(api.get("/x")).rejects.toBeInstanceOf(HttpError);
			expect(calls).toBe(3);
		});

		it("never retries validation errors", async () => {
			let calls = 0;
			const fetchSpy = vi.fn(async () => {
				calls++;
				return jsonResponse({ bad: true });
			});
			const schema = {
				parse: () => {
					throw new Error("invalid");
				},
			};
			const api = createClient({
				fetch: fetchSpy,
				retry: { attempts: 3, backoff: () => 0 },
			});
			await expect(api.get("/x", { schema })).rejects.toBeInstanceOf(ValidationError);
			expect(calls).toBe(1);
		});
	});

	describe("schema validation", () => {
		it("validates response against schema", async () => {
			const fetchSpy = vi.fn(async () => jsonResponse({ id: "abc" }));
			const schema = {
				parse: (input: unknown) => {
					const obj = input as { id: string };
					if (typeof obj.id !== "string") throw new Error("invalid");
					return { id: obj.id };
				},
			};
			const api = createClient({ fetch: fetchSpy });
			const result = await api.get("/x", { schema });
			expect(result).toEqual({ id: "abc" });
		});

		it("throws ValidationError on bad payloads", async () => {
			const fetchSpy = vi.fn(async () => jsonResponse({ wrong: true }));
			const schema = {
				parse: () => {
					throw new Error("expected id");
				},
			};
			const api = createClient({ fetch: fetchSpy });
			await expect(api.get("/x", { schema })).rejects.toBeInstanceOf(ValidationError);
		});
	});

	describe("interceptors", () => {
		it("runs request interceptors in order", async () => {
			const order: string[] = [];
			const fetchSpy = vi.fn(async () => jsonResponse({}));
			const api = createClient({
				fetch: fetchSpy,
				requestInterceptors: [
					() => {
						order.push("a");
					},
					() => {
						order.push("b");
					},
				],
			});
			await api.get("/x");
			expect(order).toEqual(["a", "b"]);
		});

		it("allows interceptor to modify request init", async () => {
			const fetchSpy = vi.fn(async () => jsonResponse({}));
			const api = createClient({
				fetch: fetchSpy,
				requestInterceptors: [
					(_url, init) => ({
						...init,
						headers: { ...init.headers, "x-trace-id": "123" },
					}),
				],
			});
			await api.get("/x");
			const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
			expect((init.headers as Record<string, string>)["x-trace-id"]).toBe("123");
		});

		it("runs response interceptors", async () => {
			const seen: number[] = [];
			const fetchSpy = vi.fn(async () => jsonResponse({}, { status: 201 }));
			const api = createClient({
				fetch: fetchSpy,
				responseInterceptors: [
					(res) => {
						seen.push(res.status);
					},
				],
			});
			await api.get("/x");
			expect(seen).toEqual([201]);
		});
	});

	describe("body parsing", () => {
		it("returns null for 204 No Content", async () => {
			const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
			const api = createClient({ fetch: fetchSpy });
			const result = await api.delete("/x");
			expect(result).toBeNull();
		});

		it("returns text for text/plain responses", async () => {
			const fetchSpy = vi.fn(
				async () => new Response("hello", { headers: { "content-type": "text/plain" } }),
			);
			const api = createClient({ fetch: fetchSpy });
			const result = await api.get("/x");
			expect(result).toBe("hello");
		});
	});
});
