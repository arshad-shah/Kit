import { describe, expect, it, vi } from "vitest";
import type { LogRecord } from "../types.js";
import { fileTransport } from "./file.js";

vi.mock("node:fs/promises", () => ({
	appendFile: vi.fn(async () => undefined),
}));

function record(message = "test"): LogRecord {
	return {
		timestamp: "2026-05-10T12:00:00.000Z",
		level: "info",
		message,
		context: {},
	};
}

describe("fileTransport", () => {
	it("writes JSON Lines to the configured path", async () => {
		const { appendFile } = await import("node:fs/promises");
		vi.mocked(appendFile).mockClear();
		const transport = fileTransport({ path: "/tmp/test.log" });

		transport.write(record("a"));
		// Wait for the implicit flush triggered at batchSize=1
		await new Promise((r) => setTimeout(r, 10));

		expect(appendFile).toHaveBeenCalledWith(
			"/tmp/test.log",
			expect.stringMatching(/^\{.*\}\n$/),
			"utf-8",
		);
	});

	it("buffers writes when batchSize > 1", async () => {
		const { appendFile } = await import("node:fs/promises");
		vi.mocked(appendFile).mockClear();

		const transport = fileTransport({ path: "/tmp/test.log", batchSize: 3 });
		transport.write(record("a"));
		transport.write(record("b"));
		expect(appendFile).not.toHaveBeenCalled();

		transport.write(record("c"));
		await new Promise((r) => setTimeout(r, 10));
		expect(appendFile).toHaveBeenCalledOnce();
	});

	it("flush() is a no-op on empty buffer", async () => {
		const { appendFile } = await import("node:fs/promises");
		vi.mocked(appendFile).mockClear();

		const transport = fileTransport({ path: "/tmp/test.log", batchSize: 100 });
		await transport.flush?.();
		expect(appendFile).not.toHaveBeenCalled();
	});

	it("each record is on its own line", async () => {
		const { appendFile } = await import("node:fs/promises");
		vi.mocked(appendFile).mockClear();

		const transport = fileTransport({ path: "/tmp/test.log", batchSize: 2 });
		transport.write(record("a"));
		transport.write(record("b"));
		await new Promise((r) => setTimeout(r, 10));

		const written = vi.mocked(appendFile).mock.calls[0]?.[1] as string;
		const lines = written.trim().split("\n");
		expect(lines).toHaveLength(2);
		expect(JSON.parse(lines[0] as string).message).toBe("a");
		expect(JSON.parse(lines[1] as string).message).toBe("b");
	});
});
