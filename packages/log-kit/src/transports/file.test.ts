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

	it("serializes concurrent appendFile calls so writes never interleave", async () => {
		const { appendFile } = await import("node:fs/promises");
		vi.mocked(appendFile).mockReset();

		// Track active concurrent appendFile calls. If a second call starts
		// while the first is still running, the writes can interleave on disk
		// past PIPE_BUF. We assert max 1 in-flight at a time.
		let active = 0;
		let maxActive = 0;
		vi.mocked(appendFile).mockImplementation(async () => {
			active += 1;
			maxActive = Math.max(maxActive, active);
			// Yield to give a concurrent call a chance to start.
			await new Promise<void>((resolve) => setTimeout(resolve, 5));
			active -= 1;
		});

		const transport = fileTransport({ path: "/tmp/test.log" }); // batchSize=1
		// Fire 5 writes synchronously - each triggers an immediate flush.
		for (const m of ["a", "b", "c", "d", "e"]) transport.write(record(m));
		// Wait long enough for all appends to drain.
		await new Promise((r) => setTimeout(r, 80));

		expect(maxActive).toBe(1);
		// All five records still get persisted in order.
		expect(vi.mocked(appendFile)).toHaveBeenCalledTimes(5);
		const order = vi.mocked(appendFile).mock.calls.map((call) => {
			const chunk = call[1] as string;
			return JSON.parse(chunk.trim()).message;
		});
		expect(order).toEqual(["a", "b", "c", "d", "e"]);
	});

	it("reports write failures through the onError diagnostic channel", async () => {
		const { appendFile } = await import("node:fs/promises");
		vi.mocked(appendFile).mockReset();
		vi.mocked(appendFile).mockRejectedValue(new Error("disk full"));

		const onError = vi.fn();
		const transport = fileTransport({ path: "/tmp/test.log", onError });
		transport.write(record("a"));
		await new Promise((r) => setTimeout(r, 10));

		expect(onError).toHaveBeenCalledOnce();
		const [err, info] = onError.mock.calls[0] ?? [];
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toBe("disk full");
		expect(info).toMatchObject({ op: "flush", path: "/tmp/test.log" });
	});
});
