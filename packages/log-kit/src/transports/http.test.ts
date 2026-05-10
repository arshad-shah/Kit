import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LogRecord } from "../types.js";
import { httpTransport } from "./http.js";

function record(level: LogRecord["level"] = "info"): LogRecord {
	return {
		timestamp: "2026-05-10T12:00:00.000Z",
		level,
		message: "test",
		context: {},
	};
}

describe("httpTransport", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("flushes when batchSize is reached", async () => {
		const fetchSpy = vi.fn(async () => new Response("", { status: 200 }));
		const transport = httpTransport({
			url: "https://example.com/logs",
			batchSize: 3,
			fetch: fetchSpy,
		});

		transport.write(record());
		transport.write(record());
		expect(fetchSpy).not.toHaveBeenCalled();

		transport.write(record());
		await vi.runAllTimersAsync();
		expect(fetchSpy).toHaveBeenCalledOnce();

		const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
		expect(init.method).toBe("POST");
		const body = JSON.parse(init.body as string);
		expect(body).toHaveLength(3);
	});

	it("flushes after flushIntervalMs even if batch not full", async () => {
		const fetchSpy = vi.fn(async () => new Response("", { status: 200 }));
		const transport = httpTransport({
			url: "https://example.com/logs",
			batchSize: 100,
			flushIntervalMs: 1000,
			fetch: fetchSpy,
		});

		transport.write(record());
		expect(fetchSpy).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1000);
		expect(fetchSpy).toHaveBeenCalledOnce();
	});

	it("flush() forces an immediate send", async () => {
		const fetchSpy = vi.fn(async () => new Response("", { status: 200 }));
		const transport = httpTransport({
			url: "https://example.com/logs",
			batchSize: 100,
			fetch: fetchSpy,
		});

		transport.write(record());
		await transport.flush?.();
		expect(fetchSpy).toHaveBeenCalledOnce();
	});

	it("flush() on empty buffer is a no-op", async () => {
		const fetchSpy = vi.fn(async () => new Response("", { status: 200 }));
		const transport = httpTransport({ url: "https://x.com", fetch: fetchSpy });
		await transport.flush?.();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("drops records on fetch failure without throwing", async () => {
		const fetchSpy = vi.fn(async () => {
			throw new Error("network error");
		});
		const transport = httpTransport({
			url: "https://x.com",
			batchSize: 1,
			fetch: fetchSpy,
		});

		expect(() => transport.write(record())).not.toThrow();
		await vi.runAllTimersAsync();
	});

	it("filters records below the transport-level threshold", async () => {
		const fetchSpy = vi.fn(async () => new Response("", { status: 200 }));
		const transport = httpTransport({
			url: "https://x.com",
			level: "warn",
			batchSize: 10,
			fetch: fetchSpy,
		});

		transport.write(record("debug"));
		transport.write(record("info"));
		transport.write(record("warn"));
		transport.write(record("error"));
		await transport.flush?.();

		const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
		expect(body).toHaveLength(2);
		expect(body.map((r: LogRecord) => r.level)).toEqual(["warn", "error"]);
	});

	it("merges custom headers", async () => {
		const fetchSpy = vi.fn(async () => new Response("", { status: 200 }));
		const transport = httpTransport({
			url: "https://x.com",
			headers: { "x-api-key": "secret" },
			batchSize: 1,
			fetch: fetchSpy,
		});

		transport.write(record());
		await vi.runAllTimersAsync();

		const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
		const headers = init.headers as Record<string, string>;
		expect(headers["x-api-key"]).toBe("secret");
		expect(headers["Content-Type"]).toBe("application/json");
	});
});
