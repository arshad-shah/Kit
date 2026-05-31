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

	describe("stream routing", () => {
		it("forces every record to stdout when stream is 'stdout'", () => {
			const con = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
			const transport = consoleTransport({ stream: "stdout", console: con });

			transport.write(record("warn", "w"));
			transport.write(record("error", "e"));
			transport.write(record("info", "i"));

			expect(con.warn).not.toHaveBeenCalled();
			expect(con.error).not.toHaveBeenCalled();
			expect(con.info).toHaveBeenCalledTimes(3); // warn + error + info all to stdout
		});

		it("forces every record to stderr when stream is 'stderr'", () => {
			const con = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
			const transport = consoleTransport({ stream: "stderr", console: con });

			transport.write(record("info", "i"));
			transport.write(record("error", "e"));

			expect(con.info).not.toHaveBeenCalled();
			expect(con.warn).toHaveBeenCalledTimes(1); // info forced to stderr
			expect(con.error).toHaveBeenCalledTimes(1);
		});
	});

	describe("printf-style args", () => {
		it("substitutes %s/%d/%j and appends leftover args", () => {
			const con = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
			const transport = consoleTransport({ pretty: true, console: con });

			transport.write({ ...record("info", "built %s in %dms"), args: ["index.js", 12.7] });

			const output = con.info.mock.calls[0]?.[0] as string;
			expect(output).toContain("built index.js in 12ms");
		});

		it("appends extra args beyond the placeholders", () => {
			const con = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
			const transport = consoleTransport({ pretty: true, console: con });

			transport.write({ ...record("info", "done %s"), args: ["a", { extra: 1 }] });

			const output = con.info.mock.calls[0]?.[0] as string;
			expect(output).toContain("done a");
			expect(output).toContain('{"extra":1}');
		});
	});

	it("renders scope and kind in pretty output", () => {
		const con = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
		const transport = consoleTransport({ pretty: true, console: con });

		transport.write({ ...record("info", "ok"), scope: "app:manifest", kind: "success" });

		const output = con.info.mock.calls[0]?.[0] as string;
		expect(output).toContain("[app:manifest]");
		expect(output).toContain("(success)");
	});

	it("handles a numeric (epoch) timestamp in pretty output", () => {
		const con = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
		const transport = consoleTransport({ pretty: true, console: con });

		transport.write({ ...record("info", "x"), timestamp: 1715342400000 });

		const output = con.info.mock.calls[0]?.[0] as string;
		expect(output).toContain("1715342400000");
		expect(output).toContain("x");
	});

	it("serializes new fields in JSON output", () => {
		const con = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
		const transport = consoleTransport({ console: con });

		transport.write({ ...record("info", "x"), scope: "app", kind: "success", meta: { a: 1 } });

		const output = con.info.mock.calls[0]?.[0] as string;
		expect(JSON.parse(output)).toMatchObject({ scope: "app", kind: "success", meta: { a: 1 } });
	});
});
