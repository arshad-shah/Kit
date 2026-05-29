import { describe, expect, it } from "vitest";
import { parseDotenv } from "./parse-dotenv.js";

describe("parseDotenv", () => {
	it("parses simple KEY=value pairs", () => {
		expect(parseDotenv("FOO=bar\nBAZ=qux")).toEqual({ FOO: "bar", BAZ: "qux" });
	});

	it("ignores blank lines", () => {
		expect(parseDotenv("\nFOO=bar\n\nBAZ=qux\n")).toEqual({ FOO: "bar", BAZ: "qux" });
	});

	it("ignores comments", () => {
		expect(parseDotenv("# this is a comment\nFOO=bar\n#BAZ=ignored")).toEqual({ FOO: "bar" });
	});

	it("supports the `export ` prefix common in shell-sourced .env files", () => {
		expect(parseDotenv("export FOO=bar\nexport BAZ=qux")).toEqual({ FOO: "bar", BAZ: "qux" });
	});

	it("treats `export` as a prefix, not part of the key", () => {
		expect(parseDotenv('export TOKEN="a b c"')).toEqual({ TOKEN: "a b c" });
	});

	it("does not strip `export` when it is part of the key name", () => {
		// `exportFOO` (no space) is a legitimate variable name, not the keyword.
		expect(parseDotenv("exportFOO=bar")).toEqual({ exportFOO: "bar" });
	});

	it("handles inline comments after unquoted values", () => {
		expect(parseDotenv("FOO=bar # trailing comment")).toEqual({ FOO: "bar" });
	});

	it("preserves # inside quoted values", () => {
		expect(parseDotenv('FOO="bar # not a comment"')).toEqual({ FOO: "bar # not a comment" });
	});

	it("strips double quotes", () => {
		expect(parseDotenv('FOO="hello world"')).toEqual({ FOO: "hello world" });
	});

	it("strips single quotes", () => {
		expect(parseDotenv("FOO='hello world'")).toEqual({ FOO: "hello world" });
	});

	it("interprets escapes only in double-quoted strings", () => {
		expect(parseDotenv('FOO="line1\\nline2"')).toEqual({ FOO: "line1\nline2" });
		expect(parseDotenv("FOO='line1\\nline2'")).toEqual({ FOO: "line1\\nline2" });
	});

	it("interprets \\t and \\r escapes", () => {
		expect(parseDotenv('FOO="a\\tb"')).toEqual({ FOO: "a\tb" });
		expect(parseDotenv('FOO="a\\rb"')).toEqual({ FOO: "a\rb" });
	});

	it("rejects invalid key names", () => {
		expect(parseDotenv("1FOO=bar")).toEqual({});
		expect(parseDotenv("foo-bar=baz")).toEqual({});
	});

	it("accepts keys with underscores and digits", () => {
		expect(parseDotenv("MY_VAR_2=ok")).toEqual({ MY_VAR_2: "ok" });
	});

	it("ignores lines without =", () => {
		expect(parseDotenv("just a line\nFOO=bar")).toEqual({ FOO: "bar" });
	});

	it("trims whitespace around key and value", () => {
		expect(parseDotenv("  FOO  =  bar  ")).toEqual({ FOO: "bar" });
	});

	it("handles = inside quoted values", () => {
		expect(parseDotenv('CONN="a=1;b=2"')).toEqual({ CONN: "a=1;b=2" });
	});

	it("handles empty values", () => {
		expect(parseDotenv("EMPTY=")).toEqual({ EMPTY: "" });
	});
});
