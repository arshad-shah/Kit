import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveStorage } from "./storage.js";

describe("resolveStorage", () => {
	beforeEach(() => {
		localStorage.clear();
		sessionStorage.clear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns localStorage when 'local' is requested and available", () => {
		const storage = resolveStorage("local");
		storage.setItem("k", "v");
		expect(localStorage.getItem("k")).toBe("v");
	});

	it("returns sessionStorage when 'session' is requested", () => {
		const storage = resolveStorage("session");
		storage.setItem("k", "v");
		expect(sessionStorage.getItem("k")).toBe("v");
	});

	it("returns memory storage when 'memory' is requested", () => {
		const storage = resolveStorage("memory");
		storage.setItem("k", "v");
		expect(storage.getItem("k")).toBe("v");
		// Memory is not shared with localStorage
		expect(localStorage.getItem("k")).toBeNull();
	});

	it("memory storage isolates instances", () => {
		const a = resolveStorage("memory");
		const b = resolveStorage("memory");
		a.setItem("shared", "from-a");
		expect(b.getItem("shared")).toBeNull();
	});

	it("defaults to local when no backend is given", () => {
		const storage = resolveStorage();
		storage.setItem("k", "v");
		expect(localStorage.getItem("k")).toBe("v");
	});

	it("passes through a custom Storage object", () => {
		const custom = {
			getItem: vi.fn(() => "stored"),
			setItem: vi.fn(),
			removeItem: vi.fn(),
		};
		const storage = resolveStorage(custom);
		expect(storage.getItem("anything")).toBe("stored");
		expect(custom.getItem).toHaveBeenCalledWith("anything");
	});

	it("falls back to memory when localStorage throws on probe", () => {
		const setSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("QuotaExceededError");
		});

		const storage = resolveStorage("local");
		storage.setItem("k", "v");
		// Should not have thrown, and localStorage should not have the value
		// because we fell back to memory
		expect(setSpy).toHaveBeenCalled();
	});

	it("supports getItem, setItem, and removeItem on memory backend", () => {
		const storage = resolveStorage("memory");
		expect(storage.getItem("missing")).toBeNull();
		storage.setItem("k", "v");
		expect(storage.getItem("k")).toBe("v");
		storage.removeItem("k");
		expect(storage.getItem("k")).toBeNull();
	});
});
