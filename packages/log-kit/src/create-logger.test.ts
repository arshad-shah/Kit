import { describe, expect, it, vi } from "vitest";
import { createLogger } from "./create-logger.js";
import type { LogRecord, Transport } from "./types.js";

function makeRecorder(): { records: LogRecord[]; transport: Transport } {
	const records: LogRecord[] = [];
	return {
		records,
		transport: {
			name: "test",
			write: (r) => {
				records.push(r);
			},
		},
	};
}

const fixedNow = (): Date => new Date("2026-05-10T12:00:00.000Z");

describe("createLogger", () => {
	describe("levels", () => {
		it("emits records at or above the configured level", () => {
			const { records, transport } = makeRecorder();
			const log = createLogger({ level: "warn", transports: [transport], now: fixedNow });

			log.trace("trace");
			log.debug("debug");
			log.info("info");
			log.warn("warn");
			log.error("error");
			log.fatal("fatal");

			expect(records.map((r) => r.level)).toEqual(["warn", "error", "fatal"]);
		});

		it("isLevelEnabled mirrors the threshold", () => {
			const log = createLogger({ level: "info", transports: [] });
			expect(log.isLevelEnabled("trace")).toBe(false);
			expect(log.isLevelEnabled("debug")).toBe(false);
			expect(log.isLevelEnabled("info")).toBe(true);
			expect(log.isLevelEnabled("error")).toBe(true);
		});

		it("defaults to info level", () => {
			const { records, transport } = makeRecorder();
			const log = createLogger({ transports: [transport], now: fixedNow });
			log.debug("dropped");
			log.info("kept");
			expect(records.map((r) => r.message)).toEqual(["kept"]);
		});
	});

	describe("record shape", () => {
		it("includes timestamp, level, message, and context", () => {
			const { records, transport } = makeRecorder();
			const log = createLogger({ transports: [transport], now: fixedNow });
			log.info("hello", { user: "arshad" });

			expect(records[0]).toEqual({
				timestamp: "2026-05-10T12:00:00.000Z",
				level: "info",
				message: "hello",
				context: { user: "arshad" },
			});
		});

		it("merges base context into every record", () => {
			const { records, transport } = makeRecorder();
			const log = createLogger({
				transports: [transport],
				context: { app: "kit" },
				now: fixedNow,
			});
			log.info("test", { user: "a" });

			expect(records[0]?.context).toEqual({ app: "kit", user: "a" });
		});

		it("call context overrides base context on key conflict", () => {
			const { records, transport } = makeRecorder();
			const log = createLogger({
				transports: [transport],
				context: { stage: "base" },
				now: fixedNow,
			});
			log.info("test", { stage: "override" });

			expect(records[0]?.context.stage).toBe("override");
		});

		it("captures Error instances passed to error/fatal", () => {
			const { records, transport } = makeRecorder();
			const log = createLogger({ transports: [transport], now: fixedNow });
			const err = new Error("boom");
			log.error(err);

			expect(records[0]?.message).toBe("boom");
			expect(records[0]?.error?.name).toBe("Error");
			expect(records[0]?.error?.message).toBe("boom");
			expect(records[0]?.error?.stack).toBeDefined();
		});

		it("error with string message has no error field", () => {
			const { records, transport } = makeRecorder();
			const log = createLogger({ transports: [transport], now: fixedNow });
			log.error("plain message");
			expect(records[0]?.error).toBeUndefined();
		});
	});

	describe("child loggers", () => {
		it("merges parent and child context", () => {
			const { records, transport } = makeRecorder();
			const log = createLogger({
				transports: [transport],
				context: { app: "kit" },
				now: fixedNow,
			});
			const child = log.child({ requestId: "r-123" });
			child.info("test");

			expect(records[0]?.context).toEqual({ app: "kit", requestId: "r-123" });
		});

		it("child does not affect parent context", () => {
			const { records, transport } = makeRecorder();
			const log = createLogger({ transports: [transport], now: fixedNow });
			log.child({ scoped: true });
			log.info("parent");
			expect(records[0]?.context).toEqual({});
		});

		it("child inherits level threshold", () => {
			const { records, transport } = makeRecorder();
			const log = createLogger({
				level: "warn",
				transports: [transport],
				now: fixedNow,
			});
			const child = log.child({ scope: "x" });
			child.info("dropped");
			child.warn("kept");
			expect(records.map((r) => r.message)).toEqual(["kept"]);
		});
	});

	describe("performance markers", () => {
		it("measures duration and emits on end", () => {
			const { records, transport } = makeRecorder();
			const log = createLogger({ transports: [transport], now: fixedNow });
			const end = log.mark("op");
			end({ count: 5 });

			expect(records[0]?.message).toBe("op");
			expect(records[0]?.context.durationMs).toBeTypeOf("number");
			expect(records[0]?.context.count).toBe(5);
		});

		it("supports custom level for marks", () => {
			const { records, transport } = makeRecorder();
			const log = createLogger({ level: "trace", transports: [transport], now: fixedNow });
			const end = log.mark("op", { level: "debug" });
			end();
			expect(records[0]?.level).toBe("debug");
		});
	});

	describe("transport isolation", () => {
		it("a throwing transport does not break other transports", () => {
			const good = makeRecorder();
			const bad: Transport = {
				name: "bad",
				write: () => {
					throw new Error("transport failure");
				},
			};
			const log = createLogger({ transports: [bad, good.transport], now: fixedNow });
			expect(() => log.info("test")).not.toThrow();
			expect(good.records).toHaveLength(1);
		});

		it("an async transport that rejects does not propagate", async () => {
			const log = createLogger({
				transports: [
					{
						name: "async-bad",
						write: async () => {
							throw new Error("nope");
						},
					},
				],
				now: fixedNow,
			});
			expect(() => log.info("x")).not.toThrow();
			// Wait a tick for the rejected promise to settle
			await new Promise((r) => setTimeout(r, 5));
		});
	});

	describe("flush", () => {
		it("calls flush on every transport that has one", async () => {
			const flushA = vi.fn();
			const flushB = vi.fn();
			const log = createLogger({
				transports: [
					{ name: "a", write: () => undefined, flush: flushA },
					{ name: "b", write: () => undefined, flush: flushB },
					{ name: "c", write: () => undefined }, // no flush method
				],
				now: fixedNow,
			});
			await log.flush();
			expect(flushA).toHaveBeenCalled();
			expect(flushB).toHaveBeenCalled();
		});

		it("a flush that throws does not break others", async () => {
			const flushOk = vi.fn();
			const log = createLogger({
				transports: [
					{
						name: "throws",
						write: () => undefined,
						flush: () => {
							throw new Error("nope");
						},
					},
					{ name: "ok", write: () => undefined, flush: flushOk },
				],
				now: fixedNow,
			});
			// flush returns a TransportStatus[] instead of swallowing failures.
			const result = await log.flush();
			expect(flushOk).toHaveBeenCalled();
			expect(result).toEqual([
				{ name: "throws", ok: false, error: expect.any(Error) },
				{ name: "ok", ok: true },
			]);
		});

		it("reports per-transport status so callers can detect drains that failed", async () => {
			const log = createLogger({
				transports: [
					{ name: "a", write: () => undefined, flush: async () => undefined },
					{
						name: "b",
						write: () => undefined,
						flush: async () => {
							throw new Error("network down");
						},
					},
				],
				now: fixedNow,
			});
			const result = await log.flush();
			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({ name: "a", ok: true });
			expect(result[1]?.ok).toBe(false);
			expect((result[1] as { error: Error }).error.message).toBe("network down");
		});

		it("returns ok: true for transports without a flush method", async () => {
			const log = createLogger({
				transports: [{ name: "noflush", write: () => undefined }],
				now: fixedNow,
			});
			const result = await log.flush();
			expect(result).toEqual([{ name: "noflush", ok: true }]);
		});
	});

	describe("onTransportError diagnostic channel", () => {
		it("fires when a synchronous write throws", () => {
			const onTransportError = vi.fn();
			const log = createLogger({
				transports: [
					{
						name: "broken",
						write: () => {
							throw new Error("write blew up");
						},
					},
				],
				now: fixedNow,
				onTransportError,
			});
			log.info("hi");
			expect(onTransportError).toHaveBeenCalledOnce();
			const [err, info] = onTransportError.mock.calls[0] ?? [];
			expect(err).toBeInstanceOf(Error);
			expect((err as Error).message).toBe("write blew up");
			expect(info).toMatchObject({ transport: "broken", op: "write" });
		});

		it("fires when an async write rejects", async () => {
			const onTransportError = vi.fn();
			const log = createLogger({
				transports: [
					{
						name: "asyncBroken",
						write: async () => {
							throw new Error("async fail");
						},
					},
				],
				now: fixedNow,
				onTransportError,
			});
			log.info("hi");
			await new Promise((r) => setTimeout(r, 5));
			expect(onTransportError).toHaveBeenCalledOnce();
			const [err, info] = onTransportError.mock.calls[0] ?? [];
			expect((err as Error).message).toBe("async fail");
			expect(info).toMatchObject({ transport: "asyncBroken", op: "write" });
		});

		it("fires when flush throws", async () => {
			const onTransportError = vi.fn();
			const log = createLogger({
				transports: [
					{
						name: "flushBroken",
						write: () => undefined,
						flush: () => {
							throw new Error("flush boom");
						},
					},
				],
				now: fixedNow,
				onTransportError,
			});
			await log.flush();
			expect(onTransportError).toHaveBeenCalledOnce();
			const [err, info] = onTransportError.mock.calls[0] ?? [];
			expect((err as Error).message).toBe("flush boom");
			expect(info).toMatchObject({ transport: "flushBroken", op: "flush" });
		});
	});

	describe("error serialization", () => {
		it("captures the cause chain", () => {
			const records: import("./types.js").LogRecord[] = [];
			const log = createLogger({
				transports: [{ name: "cap", write: (r) => records.push(r) }],
				now: fixedNow,
			});
			const inner = new Error("DB down");
			const outer = new Error("user save failed", { cause: inner });
			log.error(outer);
			expect(records).toHaveLength(1);
			expect(records[0]?.error?.message).toBe("user save failed");
			expect(records[0]?.error?.cause).toEqual(
				expect.objectContaining({ name: "Error", message: "DB down" }),
			);
		});

		it("captures Node-style err.code", () => {
			const records: import("./types.js").LogRecord[] = [];
			const log = createLogger({
				transports: [{ name: "cap", write: (r) => records.push(r) }],
				now: fixedNow,
			});
			const err = Object.assign(new Error("not found"), { code: "ENOENT" });
			log.error(err);
			expect(records[0]?.error?.code).toBe("ENOENT");
		});
	});
});
