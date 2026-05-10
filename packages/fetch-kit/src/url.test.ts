import { describe, expect, it } from "vitest";
import { buildUrl } from "./url.js";

describe("buildUrl", () => {
	it("returns path as-is when no baseUrl is given", () => {
		expect(buildUrl(undefined, "/users", undefined)).toBe("/users");
	});

	it("joins baseUrl and path with a single slash", () => {
		expect(buildUrl("https://api.com", "/users", undefined)).toBe("https://api.com/users");
		expect(buildUrl("https://api.com", "users", undefined)).toBe("https://api.com/users");
		expect(buildUrl("https://api.com/", "/users", undefined)).toBe("https://api.com/users");
		expect(buildUrl("https://api.com/", "users", undefined)).toBe("https://api.com/users");
	});

	it("treats absolute paths as overrides", () => {
		expect(buildUrl("https://api.com", "https://other.com/users", undefined)).toBe(
			"https://other.com/users",
		);
		expect(buildUrl("https://api.com", "http://other.com/users", undefined)).toBe(
			"http://other.com/users",
		);
	});

	it("appends query parameters", () => {
		expect(buildUrl("https://api.com", "/users", { page: 1, limit: 10 })).toBe(
			"https://api.com/users?page=1&limit=10",
		);
	});

	it("preserves an existing query string", () => {
		expect(buildUrl("https://api.com", "/users?sort=name", { page: 1 })).toBe(
			"https://api.com/users?sort=name&page=1",
		);
	});

	it("omits undefined query values", () => {
		expect(
			buildUrl("https://api.com", "/users", {
				page: 1,
				filter: undefined,
				active: true,
			}),
		).toBe("https://api.com/users?page=1&active=true");
	});

	it("returns base URL unchanged when query is empty", () => {
		expect(buildUrl("https://api.com", "/users", {})).toBe("https://api.com/users");
	});

	it("handles boolean query values", () => {
		expect(buildUrl(undefined, "/x", { a: true, b: false })).toBe("/x?a=true&b=false");
	});

	it("URL-encodes special characters in query", () => {
		const url = buildUrl(undefined, "/x", { q: "a b&c" });
		expect(url).toContain("q=a+b%26c");
	});
});
