import { describe, expect, it } from "vitest";
import { deepMerge, isPlainObject } from "./merge.js";

describe("isPlainObject", () => {
	it("accepts object literals", () => {
		expect(isPlainObject({})).toBe(true);
		expect(isPlainObject({ a: 1 })).toBe(true);
	});

	it("accepts null-prototype objects", () => {
		expect(isPlainObject(Object.create(null))).toBe(true);
	});

	it("rejects arrays, null, primitives, functions, and class instances", () => {
		expect(isPlainObject([])).toBe(false);
		expect(isPlainObject(null)).toBe(false);
		expect(isPlainObject(undefined)).toBe(false);
		expect(isPlainObject(42)).toBe(false);
		expect(isPlainObject("s")).toBe(false);
		expect(isPlainObject(() => {})).toBe(false);
		expect(isPlainObject(new Date())).toBe(false);
		expect(isPlainObject(new (class Foo {})())).toBe(false);
	});
});

describe("deepMerge", () => {
	it("merges nested plain objects recursively", () => {
		const result = deepMerge(
			{ dev: { port: 3000, host: "localhost" }, build: { minify: true } },
			{ dev: { port: 4000 } },
		);
		expect(result).toEqual({
			dev: { port: 4000, host: "localhost" },
			build: { minify: true },
		});
	});

	it("replaces arrays wholesale instead of concatenating", () => {
		const result = deepMerge({ browsers: ["chrome", "firefox"] }, { browsers: ["safari"] });
		expect(result).toEqual({ browsers: ["safari"] });
	});

	it("replaces primitives", () => {
		expect(deepMerge({ a: 1, b: "x" }, { a: 2 })).toEqual({ a: 2, b: "x" });
	});

	it("replaces a primitive with an object and vice versa", () => {
		expect(deepMerge({ a: 1 }, { a: { nested: true } })).toEqual({ a: { nested: true } });
		expect(deepMerge({ a: { nested: true } }, { a: 1 })).toEqual({ a: 1 });
	});

	it("skips undefined source values so earlier layers survive", () => {
		expect(deepMerge({ a: "keep" }, { a: undefined })).toEqual({ a: "keep" });
	});

	it("preserves functions by reference (replace, not merge)", () => {
		const fn = () => "plugin";
		const result = deepMerge({ plugins: [] }, { plugins: [fn] });
		expect((result.plugins as unknown[])[0]).toBe(fn);
	});

	it("does not mutate either argument", () => {
		const target = { dev: { port: 3000 } };
		const source = { dev: { host: "x" } };
		const result = deepMerge(target, source);
		expect(target).toEqual({ dev: { port: 3000 } });
		expect(source).toEqual({ dev: { host: "x" } });
		expect(result).toEqual({ dev: { port: 3000, host: "x" } });
		// new object graph for merged keys
		expect(result.dev).not.toBe(target.dev);
	});
});
