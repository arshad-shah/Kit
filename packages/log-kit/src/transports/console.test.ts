import { describe, expect, it, vi } from "vitest";
import type { LogRecord } from "../types.js";
import { consoleTransport } from "./console.js";

function record(
	level: LogRecord["level"],
	message: string,
	context: Record<string, unknown> = {},
): LogRecord {
	return {
		timestamp: "2026-05-10T12:00:00.000Z",
		level,
		message,
		context,
	};
}

describe("consoleTransport", () => {
	it("writes JSON by default", () => {
		const con = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
		const transport = consoleTransport({ console: con });

		transport.write(record("info", "hello", { x: 1 }));

		expect(con.info).toHaveBeenCalledOnce();
		const output = con.info.mock.calls[0]?.[0] as string;
		expect(JSON.parse(output)).toMatchObject({ level: "info", message: "hello" });
	});

	it("routes levels to corresponding console methods", () => {
		const con = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
		const transport = consoleTransport({ console: con });

		transport.write(record("trace", "t"));
		transport.write(record("debug", "d"));
		transport.write(record("info", "i"));
		transport.write(record("warn", "w"));
		transport.write(record("error", "e"));
		transport.write(record("fatal", "f"));

		expect(con.debug).toHaveBeenCalledTimes(2); // trace + debug
		expect(con.info).toHaveBeenCalledTimes(1);
		expect(con.warn).toHaveBeenCalledTimes(1);
		expect(con.error).toHaveBeenCalledTimes(2); // error + fatal
	});

	it("uses pretty format when enabled", () => {
		const con = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
		const transport = consoleTransport({ pretty: true, console: con });

		transport.write(record("info", "hello"));

		const output = con.info.mock.calls[0]?.[0] as string;
		expect(output).toContain("INFO");
		expect(output).toContain("hello");
		// Should not be JSON
		expect(() => JSON.parse(output)).toThrow();
	});

	it("includes context in pretty output", () => {
		const con = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
		const transport = consoleTransport({ pretty: true, console: con });

		transport.write(record("info", "msg", { user: "a" }));

		const output = con.info.mock.calls[0]?.[0] as string;
		expect(output).toContain('"user":"a"');
	});

	it("includes error stack in pretty output", () => {
		const con = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
		const transport = consoleTransport({ pretty: true, console: con });

		transport.write({
			...record("error", "boom"),
			error: { name: "Error", message: "boom", stack: "Error: boom\n  at x" },
		});

		const output = con.error.mock.calls[0]?.[0] as string;
		expect(output).toContain("at x");
	});
});
