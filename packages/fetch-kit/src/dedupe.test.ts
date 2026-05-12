import { describe, expect, it, vi } from "vitest";
import { createInflight } from "./dedupe.js";

describe("createInflight", () => {
	it("shares concurrent calls with the same key", async () => {
		const inflight = createInflight<number>();
		const fn = vi.fn(async () => 42);
		const [a, b] = await Promise.all([inflight.run("k", fn), inflight.run("k", fn)]);
		expect(a).toBe(42);
		expect(b).toBe(42);
		expect(fn).toHaveBeenCalledOnce();
	});

	it("runs separately for different keys", async () => {
		const inflight = createInflight<number>();
		const fn = vi.fn(async (n: number) => n);
		const [a, b] = await Promise.all([
			inflight.run("a", () => fn(1)),
			inflight.run("b", () => fn(2)),
		]);
		expect([a, b]).toEqual([1, 2]);
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it("re-runs after the previous call settles", async () => {
		const inflight = createInflight<number>();
		const fn = vi.fn(async () => 1);
		await inflight.run("k", fn);
		await inflight.run("k", fn);
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it("propagates rejections to all sharers", async () => {
		const inflight = createInflight<number>();
		const fn = vi.fn(async () => {
			throw new Error("boom");
		});
		const p1 = inflight.run("k", fn);
		const p2 = inflight.run("k", fn);
		await expect(p1).rejects.toThrow("boom");
		await expect(p2).rejects.toThrow("boom");
		expect(fn).toHaveBeenCalledOnce();
	});

	it("clears the registry on demand", async () => {
		const inflight = createInflight<number>();
		let resolve!: (n: number) => void;
		const fn = (): Promise<number> =>
			new Promise((r) => {
				resolve = r;
			});
		void inflight.run("k", fn);
		expect(inflight.size).toBe(1);
		inflight.clear();
		expect(inflight.size).toBe(0);
		resolve(1);
	});

	it("get reports whether a key has an in-flight request", () => {
		const inflight = createInflight<number>();
		let resolve!: (n: number) => void;
		void inflight.run(
			"k",
			() =>
				new Promise<number>((r) => {
					resolve = r;
				}),
		);
		expect(inflight.get("k")).toBeDefined();
		expect(inflight.get("missing")).toBeUndefined();
		resolve(0);
	});

	it("isolates per-caller AbortSignals from the shared runner", async () => {
		const inflight = createInflight<number>();
		const aController = new AbortController();
		const bController = new AbortController();
		let downstreamAborted = false;

		const runner = (shared: AbortController): Promise<number> => {
			return new Promise((resolve, reject) => {
				const onAbort = (): void => {
					downstreamAborted = true;
					reject(new Error("inner aborted"));
				};
				shared.signal.addEventListener("abort", onAbort, { once: true });
				setTimeout(() => {
					shared.signal.removeEventListener("abort", onAbort);
					resolve(42);
				}, 30);
			});
		};

		const a = inflight.run("k", runner, aController.signal);
		const b = inflight.run("k", runner, bController.signal);

		aController.abort();
		await expect(a).rejects.toThrow();
		// Inner fetch must not have been cancelled - b is still listening.
		expect(downstreamAborted).toBe(false);
		const bResult = await b;
		expect(bResult).toBe(42);
	});

	it("cancels the shared runner only when every sharer aborts", async () => {
		const inflight = createInflight<number>();
		const aController = new AbortController();
		const bController = new AbortController();
		let downstreamAborted = false;

		const runner = (shared: AbortController): Promise<number> => {
			return new Promise((_resolve, reject) => {
				shared.signal.addEventListener(
					"abort",
					() => {
						downstreamAborted = true;
						reject(new Error("aborted"));
					},
					{ once: true },
				);
			});
		};

		const a = inflight.run("k", runner, aController.signal);
		const b = inflight.run("k", runner, bController.signal);

		aController.abort();
		await expect(a).rejects.toThrow();
		expect(downstreamAborted).toBe(false);

		bController.abort();
		await expect(b).rejects.toThrow();
		expect(downstreamAborted).toBe(true);
	});
});
