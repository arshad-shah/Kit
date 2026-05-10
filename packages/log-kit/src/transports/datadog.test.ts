import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LogRecord } from "../types.js";
import { datadogTransport } from "./datadog.js";

function record(): LogRecord {
	return {
		timestamp: "2026-05-10T12:00:00.000Z",
		level: "info",
		message: "test",
		context: {},
	};
}

describe("datadogTransport", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("posts to the Datadog logs intake URL", async () => {
		const fetchSpy = vi.fn(async () => new Response("", { status: 202 }));
		const transport = datadogTransport({
			apiKey: "k",
			service: "my-app",
			batchSize: 1,
			fetch: fetchSpy,
		});

		transport.write(record());
		await vi.runAllTimersAsync();

		const url = fetchSpy.mock.calls[0]?.[0] as string;
		expect(url).toBe("https://http-intake.logs.datadoghq.com/api/v2/logs");
	});

	it("uses EU site when configured", async () => {
		const fetchSpy = vi.fn(async () => new Response("", { status: 202 }));
		const transport = datadogTransport({
			apiKey: "k",
			service: "my-app",
			site: "datadoghq.eu",
			batchSize: 1,
			fetch: fetchSpy,
		});

		transport.write(record());
		await vi.runAllTimersAsync();

		const url = fetchSpy.mock.calls[0]?.[0] as string;
		expect(url).toContain("datadoghq.eu");
	});

	it("includes DD-API-KEY header", async () => {
		const fetchSpy = vi.fn(async () => new Response("", { status: 202 }));
		const transport = datadogTransport({
			apiKey: "secret",
			service: "my-app",
			batchSize: 1,
			fetch: fetchSpy,
		});

		transport.write(record());
		await vi.runAllTimersAsync();

		const headers = (fetchSpy.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
		expect(headers["DD-API-KEY"]).toBe("secret");
	});

	it("enriches records with ddsource, service, and ddtags", async () => {
		const fetchSpy = vi.fn(async () => new Response("", { status: 202 }));
		const transport = datadogTransport({
			apiKey: "k",
			service: "my-app",
			env: "production",
			tags: ["region:eu", "team:platform"],
			batchSize: 1,
			fetch: fetchSpy,
		});

		transport.write(record());
		await vi.runAllTimersAsync();

		const body = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string);
		const sent = body[0];
		expect(sent.context.ddsource).toBe("log-kit");
		expect(sent.context.service).toBe("my-app");
		expect(sent.context.ddtags).toContain("env:production");
		expect(sent.context.ddtags).toContain("region:eu");
	});

	it("includes hostname when provided", async () => {
		const fetchSpy = vi.fn(async () => new Response("", { status: 202 }));
		const transport = datadogTransport({
			apiKey: "k",
			service: "my-app",
			hostname: "host-1",
			batchSize: 1,
			fetch: fetchSpy,
		});

		transport.write(record());
		await vi.runAllTimersAsync();

		const body = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string);
		expect(body[0].context.host).toBe("host-1");
	});
});
