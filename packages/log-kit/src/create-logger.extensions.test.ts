import { describe, expect, it } from "vitest";
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

describe("log() structured input", () => {
	it("carries meta, kind, and args as first-class record fields (#1, #3, #5)", () => {
		const { records, transport } = makeRecorder();
		const log = createLogger({ transports: [transport], now: fixedNow });

		const entry = { hostShape: true };
		log.log({
			level: "info",
			message: "built %s",
			args: ["index.js"],
			kind: "success",
			meta: { entry },
			context: { count: 1 },
		});

		expect(records[0]).toMatchObject({
			level: "info",
			message: "built %s",
			kind: "success",
			args: ["index.js"],
			context: { count: 1 },
		});
		// meta is passed through untouched, by reference.
		expect(records[0]?.meta?.entry).toBe(entry);
	});

	it("captures Error instances passed via log()", () => {
		const { records, transport } = makeRecorder();
		const log = createLogger({ transports: [transport], now: fixedNow });
		log.log({ level: "error", message: new Error("boom") });
		expect(records[0]?.message).toBe("boom");
		expect(records[0]?.error?.name).toBe("Error");
	});

	it("respects the level threshold", () => {
		const { records, transport } = makeRecorder();
		const log = createLogger({ level: "warn", transports: [transport], now: fixedNow });
		log.log({ level: "info", message: "dropped" });
		log.log({ level: "warn", message: "kept" });
		expect(records.map((r) => r.message)).toEqual(["kept"]);
	});

	it("omits optional fields when not provided (record stays minimal)", () => {
		const { records, transport } = makeRecorder();
		const log = createLogger({ transports: [transport], now: fixedNow });
		log.info("plain");
		expect(records[0]).toEqual({
			timestamp: "2026-05-10T12:00:00.000Z",
			level: "info",
			message: "plain",
			context: {},
		});
	});

	it("attaches kind even when empty string is meaningful, but skips undefined", () => {
		const { records, transport } = makeRecorder();
		const log = createLogger({ transports: [transport], now: fixedNow });
		log.log({ level: "info", message: "a", kind: "success" });
		log.log({ level: "info", message: "b" });
		expect(records[0]?.kind).toBe("success");
		expect(records[1]).not.toHaveProperty("kind");
	});
});

describe("named / scoped child loggers (#2)", () => {
	it("nests string scopes with the default separator", () => {
		const { records, transport } = makeRecorder();
		const root = createLogger({ scope: "app", transports: [transport], now: fixedNow });
		const manifest = root.child("manifest");
		const deep = manifest.child("write");

		root.info("a");
		manifest.info("b");
		deep.info("c");

		expect(records.map((r) => r.scope)).toEqual(["app", "app:manifest", "app:manifest:write"]);
	});

	it("starts a scope when the root has none", () => {
		const { records, transport } = makeRecorder();
		const root = createLogger({ transports: [transport], now: fixedNow });
		root.child("build").info("x");
		expect(records[0]?.scope).toBe("build");
	});

	it("supports a custom separator", () => {
		const { records, transport } = makeRecorder();
		const root = createLogger({
			scope: "app",
			scopeSeparator: "/",
			transports: [transport],
			now: fixedNow,
		});
		root.child("sub").info("x");
		expect(records[0]?.scope).toBe("app/sub");
	});

	it("child(name, context) sets scope and context together", () => {
		const { records, transport } = makeRecorder();
		const root = createLogger({ scope: "app", transports: [transport], now: fixedNow });
		root.child("db", { pool: 5 }).info("x");
		expect(records[0]?.scope).toBe("app:db");
		expect(records[0]?.context).toEqual({ pool: 5 });
	});

	it("object-form child still merges context and leaves scope unchanged", () => {
		const { records, transport } = makeRecorder();
		const root = createLogger({ scope: "app", transports: [transport], now: fixedNow });
		root.child({ requestId: "r1" }).info("x");
		expect(records[0]?.scope).toBe("app");
		expect(records[0]?.context).toEqual({ requestId: "r1" });
	});
});

describe("configurable timestamp serialization (#4)", () => {
	it("emits epoch milliseconds when timestamp is 'epoch'", () => {
		const { records, transport } = makeRecorder();
		const log = createLogger({ timestamp: "epoch", transports: [transport], now: fixedNow });
		log.info("x");
		expect(records[0]?.timestamp).toBe(new Date("2026-05-10T12:00:00.000Z").getTime());
	});

	it("accepts a custom formatter that receives the raw Date", () => {
		const { records, transport } = makeRecorder();
		const log = createLogger({
			timestamp: (d) => `t=${d.getUTCFullYear()}`,
			transports: [transport],
			now: fixedNow,
		});
		log.info("x");
		expect(records[0]?.timestamp).toBe("t=2026");
	});

	it("defaults to ISO 8601 string", () => {
		const { records, transport } = makeRecorder();
		const log = createLogger({ transports: [transport], now: fixedNow });
		log.info("x");
		expect(records[0]?.timestamp).toBe("2026-05-10T12:00:00.000Z");
	});

	it("child inherits the timestamp format", () => {
		const { records, transport } = makeRecorder();
		const log = createLogger({ timestamp: "epoch", transports: [transport], now: fixedNow });
		log.child("c").info("x");
		expect(typeof records[0]?.timestamp).toBe("number");
	});
});

describe("silent level (#6)", () => {
	it("emits nothing and disables every level", () => {
		const { records, transport } = makeRecorder();
		const log = createLogger({ level: "silent", transports: [transport], now: fixedNow });
		log.trace("a");
		log.info("b");
		log.error("c");
		log.fatal("d");
		log.log({ level: "fatal", message: "e" });
		expect(records).toHaveLength(0);
		expect(log.isLevelEnabled("fatal")).toBe(false);
		expect(log.isLevelEnabled("trace")).toBe(false);
	});
});

describe("mark returns the duration (#8)", () => {
	it("returns the measured ms and logs it", () => {
		const { records, transport } = makeRecorder();
		const log = createLogger({ transports: [transport], now: fixedNow });
		const ms = log.mark("op")({ count: 1 });
		expect(ms).toBeTypeOf("number");
		expect(ms).toBeGreaterThanOrEqual(0);
		expect(records[0]?.context.durationMs).toBe(ms);
	});

	it("still returns the duration when the level is disabled (no record)", () => {
		const { records, transport } = makeRecorder();
		const log = createLogger({ level: "error", transports: [transport], now: fixedNow });
		const ms = log.mark("op", { level: "info" })();
		expect(ms).toBeTypeOf("number");
		expect(records).toHaveLength(0);
	});
});

describe("dynamic transport management (#9)", () => {
	it("addTransport routes subsequent records to the new transport", () => {
		const a = makeRecorder();
		const b = makeRecorder();
		const log = createLogger({ transports: [a.transport], now: fixedNow });
		log.info("first");
		log.addTransport(b.transport);
		log.info("second");
		expect(a.records.map((r) => r.message)).toEqual(["first", "second"]);
		expect(b.records.map((r) => r.message)).toEqual(["second"]);
	});

	it("removeTransport(name) removes matching transports and returns the count", () => {
		const a = makeRecorder();
		const log = createLogger({ transports: [a.transport], now: fixedNow });
		expect(log.removeTransport("test")).toBe(1);
		log.info("dropped");
		expect(a.records).toHaveLength(0);
	});

	it("removeTransport() with no name clears all", () => {
		const a = makeRecorder();
		const b = makeRecorder();
		const log = createLogger({ transports: [a.transport, b.transport], now: fixedNow });
		expect(log.removeTransport()).toBe(2);
		log.info("dropped");
		expect(a.records).toHaveLength(0);
		expect(b.records).toHaveLength(0);
	});

	it("does not mutate the caller's transports array", () => {
		const a = makeRecorder();
		const original = [a.transport];
		const log = createLogger({ transports: original, now: fixedNow });
		log.addTransport(makeRecorder().transport);
		expect(original).toHaveLength(1);
	});

	it("children share the parent's transports, including ones added later", () => {
		const a = makeRecorder();
		const b = makeRecorder();
		const root = createLogger({ transports: [a.transport], now: fixedNow });
		const child = root.child("c");
		root.addTransport(b.transport);
		child.info("x");
		expect(b.records.map((r) => r.message)).toEqual(["x"]);
	});
});
