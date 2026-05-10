import { describe, expect, it } from "vitest";
import { runMigrations } from "./migrations.js";

type State = { name: string; count: number };

describe("runMigrations", () => {
	it("returns persisted state unchanged when versions match", () => {
		const result = runMigrations({ name: "a", count: 1 }, 3, 3, {});
		expect(result).toEqual({ name: "a", count: 1 });
	});

	it("applies a single migration step", () => {
		const result = runMigrations<State>({ name: "a" }, 0, 1, {
			1: (s) => ({ ...(s as object), count: 0 }) as Partial<State>,
		});
		expect(result).toEqual({ name: "a", count: 0 });
	});

	it("chains migrations in version order", () => {
		const result = runMigrations<State>({ legacy: true }, 0, 3, {
			1: () => ({ name: "v1" }),
			2: (s) => ({ ...(s as object), count: 10 }) as Partial<State>,
			3: (s) =>
				({
					...(s as object),
					name: `${(s as State).name}-final`,
				}) as Partial<State>,
		});
		expect(result).toEqual({ name: "v1-final", count: 10 });
	});

	it("skips missing intermediate versions without error", () => {
		const result = runMigrations<State>({ name: "a", count: 0 }, 0, 5, {
			3: (s) =>
				({
					...(s as object),
					name: `${(s as State).name}-jumped`,
				}) as Partial<State>,
		});
		expect(result).toEqual({ name: "a-jumped", count: 0 });
	});

	it("returns null when persisted version is newer than current (downgrade)", () => {
		const result = runMigrations({ name: "a" }, 5, 2, {});
		expect(result).toBeNull();
	});

	it("returns null when a migration throws", () => {
		const result = runMigrations<State>({ name: "a" }, 0, 1, {
			1: () => {
				throw new Error("boom");
			},
		});
		expect(result).toBeNull();
	});

	it("aborts the chain when a middle migration throws", () => {
		let v3Ran = false;
		const result = runMigrations<State>({ name: "a" }, 0, 3, {
			1: (s) => s as Partial<State>,
			2: () => {
				throw new Error("boom");
			},
			3: (s) => {
				v3Ran = true;
				return s as Partial<State>;
			},
		});
		expect(result).toBeNull();
		expect(v3Ran).toBe(false);
	});
});
