import { type StateCreator, create } from "zustand";
import { devtools } from "zustand/middleware";
import { runMigrations } from "./migrations.js";
import { resolveStorage } from "./storage.js";
import type { CreateStoreConfig, KitStorage, KitStore, PersistConfig } from "./types.js";

const STORAGE_KEY_PREFIX = "kit:store:";

type Envelope<TState> = {
	version: number;
	state: Partial<TState>;
};

const isDevelopment = (): boolean => {
	try {
		const env = (typeof process !== "undefined" ? process.env : {}) as { NODE_ENV?: string };
		return env.NODE_ENV !== "production";
	} catch {
		return false;
	}
};

/**
 * Read and parse persisted state, running migrations if needed.
 * Returns `null` on any failure - deliberately fail-soft.
 */
function loadPersistedState<TState>(
	storageKey: string,
	storage: KitStorage,
	currentVersion: number,
	persist: PersistConfig<TState>,
): Partial<TState> | null {
	try {
		const raw = storage.getItem(storageKey);
		// We do not support async storage in the synchronous read path.
		// Async storage hydrates after construction via subscribe().
		if (typeof raw !== "string") return null;

		const deserialize = persist.deserialize ?? JSON.parse;
		const envelope = deserialize(raw) as Envelope<TState>;

		if (typeof envelope !== "object" || envelope === null || typeof envelope.version !== "number") {
			return null;
		}

		return runMigrations(envelope.state, envelope.version, currentVersion, persist.migrate ?? {});
	} catch {
		return null;
	}
}

/**
 * Write state to storage as a versioned envelope.
 */
function persistState<TState>(
	storageKey: string,
	storage: KitStorage,
	state: TState,
	version: number,
	persist: PersistConfig<TState>,
): void {
	try {
		const partial = persist.partialize ? persist.partialize(state) : state;
		const envelope: Envelope<TState> = { version, state: partial as Partial<TState> };
		const serialize = persist.serialize ?? JSON.stringify;
		const result = storage.setItem(storageKey, serialize(envelope));
		// Async storage returns a promise; we don't await here because
		// store updates are synchronous. Rejections are swallowed by design.
		if (result instanceof Promise) {
			result.catch(() => {
				/* noop - persistence failures should not break the app */
			});
		}
	} catch {
		/* noop */
	}
}

const registry = new Set<KitStore<object, object>>();

/**
 * Create a typed Zustand store with persistence, migrations, and devtools.
 *
 * This is a thin factory over Zustand's `create()`. It bakes in conventions:
 * versioned persistence, migration chains, devtools wiring, and a `reset()`
 * method that clears both state and storage. State is frozen in development
 * to catch accidental mutations early.
 *
 * @typeParam TState - Shape of the state slice
 * @typeParam TActions - Shape of the actions object
 *
 * @param config - Store configuration
 * @returns A Zustand hook augmented with `reset()` and `destroy()`
 *
 * @example Basic store
 * ```ts
 * const useCounter = createStore({
 *   name: "counter",
 *   initial: { count: 0 },
 *   actions: (set) => ({
 *     increment: () => set((s) => ({ count: s.count + 1 })),
 *     decrement: () => set((s) => ({ count: s.count - 1 })),
 *   }),
 * });
 *
 * // In a component
 * const count = useCounter((s) => s.count);
 * const { increment } = useCounter.getState();
 * ```
 *
 * @example Persisted store with migration
 * ```ts
 * const useUser = createStore({
 *   name: "user",
 *   initial: { id: null as string | null, prefs: {} },
 *   actions: (set) => ({
 *     setUser: (id: string) => set({ id }),
 *   }),
 *   persist: {
 *     storage: "local",
 *     version: 2,
 *     migrate: {
 *       2: (old: any) => ({ ...old, prefs: old.preferences ?? {} }),
 *     },
 *   },
 * });
 * ```
 */
export function createStore<TState extends object, TActions extends object = Record<string, never>>(
	config: CreateStoreConfig<TState, TActions>,
): KitStore<TState, TActions> {
	const { name, initial, actions, persist, devtools: enableDevtools = isDevelopment() } = config;

	const initialFrozen = isDevelopment() ? Object.freeze({ ...initial }) : initial;
	const storageKey = `${STORAGE_KEY_PREFIX}${name}`;
	const version = persist?.version ?? 0;
	const storage = persist ? resolveStorage(persist.storage) : null;

	const hydrated =
		persist && storage ? loadPersistedState(storageKey, storage, version, persist) : null;

	const initializer: StateCreator<TState & TActions, [], []> = (set, get) => {
		const baseState = { ...initialFrozen, ...hydrated } as TState;
		const actionObj = actions
			? actions(
					set as unknown as Parameters<NonNullable<typeof actions>>[0],
					get as unknown as Parameters<NonNullable<typeof actions>>[1],
				)
			: ({} as TActions);
		return { ...baseState, ...actionObj } as TState & TActions;
	};

	const useStore = (
		enableDevtools
			? create<TState & TActions>()(devtools(initializer, { name, enabled: true }))
			: create<TState & TActions>()(initializer)
	) as KitStore<TState, TActions>;

	if (persist && storage) {
		// Subscribe AFTER construction to avoid persisting the initial hydration write.
		useStore.subscribe((state) => {
			persistState(storageKey, storage, state as TState, version, persist);
		});
	}

	useStore.reset = () => {
		useStore.setState(initialFrozen as TState & TActions, true);
		if (persist && storage) {
			const removed = storage.removeItem(storageKey);
			if (removed instanceof Promise) {
				removed.catch(() => {
					/* noop */
				});
			}
		}
	};

	useStore.destroy = () => {
		registry.delete(useStore as unknown as KitStore<object, object>);
	};

	registry.add(useStore as unknown as KitStore<object, object>);
	return useStore;
}

/**
 * Reset every store created by {@link createStore} to its initial state.
 * Useful for logout flows and test cleanup.
 */
export function resetAllStores(): void {
	for (const store of registry) {
		store.reset();
	}
}
