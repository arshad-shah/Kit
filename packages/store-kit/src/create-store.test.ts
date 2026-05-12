import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStore, resetAllStores } from "./create-store.js";

type CounterState = { count: number };
type CounterActions = {
	increment: () => void;
	decrement: () => void;
	set: (n: number) => void;
};

describe("createStore", () => {
	beforeEach(() => {
		localStorage.clear();
		sessionStorage.clear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("basic state", () => {
		it("initializes with the given initial state", () => {
			const useStore = createStore({
				name: "init-test",
				initial: { count: 5 },
			});
			expect(useStore.getState().count).toBe(5);
		});

		it("exposes actions returned from the actions creator", () => {
			const useStore = createStore<CounterState, CounterActions>({
				name: "actions-test",
				initial: { count: 0 },
				actions: (set) => ({
					increment: () => set((s) => ({ count: s.count + 1 })),
					decrement: () => set((s) => ({ count: s.count - 1 })),
					set: (n) => set({ count: n }),
				}),
			});

			useStore.getState().increment();
			expect(useStore.getState().count).toBe(1);
			useStore.getState().increment();
			useStore.getState().decrement();
			expect(useStore.getState().count).toBe(1);
			useStore.getState().set(42);
			expect(useStore.getState().count).toBe(42);
		});

		it("works without an actions creator", () => {
			const useStore = createStore({
				name: "no-actions",
				initial: { value: "hello" },
			});
			expect(useStore.getState().value).toBe("hello");
			useStore.setState({ value: "world" });
			expect(useStore.getState().value).toBe("world");
		});
	});

	describe("persistence", () => {
		it("persists state to localStorage when configured", () => {
			const useStore = createStore<CounterState, CounterActions>({
				name: "persist-local",
				initial: { count: 0 },
				actions: (set) => ({
					increment: () => set((s) => ({ count: s.count + 1 })),
					decrement: () => set((s) => ({ count: s.count - 1 })),
					set: (n) => set({ count: n }),
				}),
				persist: { storage: "local", version: 1 },
			});

			useStore.getState().increment();
			useStore.getState().increment();

			const raw = localStorage.getItem("kit:store:persist-local");
			expect(raw).not.toBeNull();
			const parsed = JSON.parse(raw as string);
			expect(parsed.version).toBe(1);
			expect(parsed.state.count).toBe(2);
		});

		it("hydrates from previously persisted state", () => {
			localStorage.setItem(
				"kit:store:persist-hydrate",
				JSON.stringify({ version: 1, state: { count: 99 } }),
			);

			const useStore = createStore({
				name: "persist-hydrate",
				initial: { count: 0 },
				persist: { storage: "local", version: 1 },
			});

			expect(useStore.getState().count).toBe(99);
		});

		it("ignores corrupt persisted data and uses initial state", () => {
			localStorage.setItem("kit:store:corrupt", "not-json");
			const useStore = createStore({
				name: "corrupt",
				initial: { count: 0 },
				persist: { storage: "local", version: 1 },
			});
			expect(useStore.getState().count).toBe(0);
		});

		it("ignores envelope without version field", () => {
			localStorage.setItem("kit:store:no-version", JSON.stringify({ state: { count: 50 } }));
			const useStore = createStore({
				name: "no-version",
				initial: { count: 0 },
				persist: { storage: "local", version: 1 },
			});
			expect(useStore.getState().count).toBe(0);
		});

		it("applies migrations during hydration", () => {
			localStorage.setItem(
				"kit:store:migrate-hydrate",
				JSON.stringify({ version: 1, state: { name: "old" } }),
			);

			const useStore = createStore<{ name: string; count: number }, never>({
				name: "migrate-hydrate",
				initial: { name: "default", count: 0 },
				persist: {
					storage: "local",
					version: 2,
					migrate: {
						2: (old) => {
							const oldState = old as { name: string };
							return { name: `${oldState.name}-migrated`, count: 1 };
						},
					},
				},
			});

			expect(useStore.getState().name).toBe("old-migrated");
			expect(useStore.getState().count).toBe(1);
		});

		it("falls back to initial state when migration fails", () => {
			localStorage.setItem(
				"kit:store:fail-migrate",
				JSON.stringify({ version: 1, state: { count: 5 } }),
			);

			const useStore = createStore({
				name: "fail-migrate",
				initial: { count: 0 },
				persist: {
					storage: "local",
					version: 2,
					migrate: {
						2: () => {
							throw new Error("nope");
						},
					},
				},
			});

			expect(useStore.getState().count).toBe(0);
		});

		it("partializes state when partialize is provided", () => {
			const useStore = createStore<{ keep: string; drop: string }, never>({
				name: "partialize",
				initial: { keep: "k", drop: "d" },
				persist: {
					storage: "local",
					version: 1,
					partialize: (s) => ({ keep: s.keep }),
				},
			});

			useStore.setState({ keep: "K", drop: "D" });

			const raw = localStorage.getItem("kit:store:partialize");
			const parsed = JSON.parse(raw as string);
			expect(parsed.state.keep).toBe("K");
			expect(parsed.state.drop).toBeUndefined();
		});

		it("uses sessionStorage when configured", () => {
			const useStore = createStore({
				name: "sess",
				initial: { count: 0 },
				persist: { storage: "session", version: 1 },
			});
			useStore.setState({ count: 7 });
			expect(sessionStorage.getItem("kit:store:sess")).not.toBeNull();
			expect(localStorage.getItem("kit:store:sess")).toBeNull();
		});

		it("supports custom serializer/deserializer", () => {
			const useStore = createStore({
				name: "custom-serde",
				initial: { count: 0 },
				persist: {
					storage: "local",
					version: 1,
					serialize: (v) => `__${JSON.stringify(v)}__`,
					deserialize: (v) => JSON.parse(v.slice(2, -2)),
				},
			});

			useStore.setState({ count: 11 });
			const raw = localStorage.getItem("kit:store:custom-serde");
			expect(raw?.startsWith("__")).toBe(true);
		});
	});

	describe("reset", () => {
		it("resets state to initial values", () => {
			const useStore = createStore({
				name: "reset-test",
				initial: { count: 0 },
			});
			useStore.setState({ count: 100 });
			useStore.reset();
			expect(useStore.getState().count).toBe(0);
		});

		it("removes persisted data on reset", () => {
			const useStore = createStore({
				name: "reset-persist",
				initial: { count: 0 },
				persist: { storage: "local", version: 1 },
			});
			useStore.setState({ count: 50 });
			expect(localStorage.getItem("kit:store:reset-persist")).not.toBeNull();
			useStore.reset();
			expect(localStorage.getItem("kit:store:reset-persist")).toBeNull();
		});
	});

	describe("resetAllStores", () => {
		it("resets all registered stores", () => {
			const a = createStore({ name: "all-a", initial: { v: 1 } });
			const b = createStore({ name: "all-b", initial: { v: 10 } });
			a.setState({ v: 99 });
			b.setState({ v: 999 });

			resetAllStores();

			expect(a.getState().v).toBe(1);
			expect(b.getState().v).toBe(10);
		});
	});

	describe("destroy", () => {
		it("removes store from registry so resetAllStores skips it", () => {
			const a = createStore({ name: "destroy-a", initial: { v: 1 } });
			const b = createStore({ name: "destroy-b", initial: { v: 2 } });

			a.setState({ v: 99 });
			b.setState({ v: 99 });

			b.destroy();
			resetAllStores();

			expect(a.getState().v).toBe(1);
			expect(b.getState().v).toBe(99); // not reset because destroyed
		});

		it("unsubscribes the persistence listener so storage isn't written after destroy", () => {
			const setItem = vi.fn();
			const storage = {
				getItem: () => null,
				setItem,
				removeItem: () => undefined,
			};
			const store = createStore({
				name: "destroy-persist",
				initial: { v: 0 },
				persist: { storage, version: 0 },
			});
			store.setState({ v: 1 });
			const setItemCallsBeforeDestroy = setItem.mock.calls.length;
			expect(setItemCallsBeforeDestroy).toBeGreaterThan(0);

			store.destroy();
			setItem.mockClear();

			store.setState({ v: 2 });
			// After destroy, the persistence listener must be detached.
			expect(setItem).not.toHaveBeenCalled();
		});
	});

	describe("async storage", () => {
		it("supports async storage backends", async () => {
			const map = new Map<string, string>();
			const asyncStorage = {
				getItem: async (k: string) => map.get(k) ?? null,
				setItem: async (k: string, v: string) => {
					map.set(k, v);
				},
				removeItem: async (k: string) => {
					map.delete(k);
				},
			};

			const useStore = createStore({
				name: "async-store",
				initial: { count: 0 },
				persist: { storage: asyncStorage, version: 1 },
			});

			useStore.setState({ count: 42 });
			await new Promise((r) => setTimeout(r, 10));

			useStore.reset();
			await new Promise((r) => setTimeout(r, 10));
			expect(useStore.getState().count).toBe(0);
		});

		it("handles async storage that rejects on setItem", async () => {
			const asyncStorage = {
				getItem: async () => null,
				setItem: async () => {
					throw new Error("disk full");
				},
				removeItem: async () => undefined,
			};

			const useStore = createStore({
				name: "async-fail",
				initial: { count: 0 },
				persist: { storage: asyncStorage, version: 1 },
			});

			expect(() => useStore.setState({ count: 1 })).not.toThrow();
			await new Promise((r) => setTimeout(r, 10));
			expect(useStore.getState().count).toBe(1);
		});

		it("handles async storage that rejects on removeItem during reset", async () => {
			const asyncStorage = {
				getItem: async () => null,
				setItem: async () => undefined,
				removeItem: async () => {
					throw new Error("nope");
				},
			};

			const useStore = createStore({
				name: "async-rm-fail",
				initial: { count: 0 },
				persist: { storage: asyncStorage, version: 1 },
			});

			useStore.setState({ count: 5 });
			expect(() => useStore.reset()).not.toThrow();
			await new Promise((r) => setTimeout(r, 10));
			expect(useStore.getState().count).toBe(0);
		});
	});

	describe("error tolerance", () => {
		it("does not crash when storage.setItem throws", () => {
			vi.spyOn(Storage.prototype, "setItem").mockImplementation((key) => {
				if (key.startsWith("kit:store:")) throw new Error("quota");
			});

			const useStore = createStore({
				name: "throw-set",
				initial: { count: 0 },
				persist: { storage: "local", version: 1 },
			});

			expect(() => useStore.setState({ count: 1 })).not.toThrow();
			expect(useStore.getState().count).toBe(1);
		});
	});

	describe("onError diagnostic channel", () => {
		it("fires when persist serialization fails", () => {
			const onError = vi.fn();
			const store = createStore({
				name: "diag-persist",
				initial: { count: 0 },
				persist: {
					storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
					version: 0,
					serialize: () => {
						throw new Error("can't serialize");
					},
				},
				onError,
			});
			store.setState({ count: 1 });
			expect(onError).toHaveBeenCalledOnce();
			const [err, info] = onError.mock.calls[0] ?? [];
			expect((err as Error).message).toBe("can't serialize");
			expect(info).toMatchObject({ op: "persist", name: "diag-persist" });
		});

		it("fires when hydration parsing fails", () => {
			const onError = vi.fn();
			const storage = {
				getItem: () => "not-json{{{",
				setItem: () => undefined,
				removeItem: () => undefined,
			};
			createStore({
				name: "diag-hydrate",
				initial: { count: 0 },
				persist: { storage, version: 0 },
				onError,
			});
			expect(onError).toHaveBeenCalledOnce();
			const [, info] = onError.mock.calls[0] ?? [];
			expect(info).toMatchObject({ op: "hydrate", name: "diag-hydrate" });
		});
	});
});
