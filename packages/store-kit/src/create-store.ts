import { type StateCreator, create } from "zustand";
import { devtools } from "zustand/middleware";
import { runMigrations } from "./migrations.js";
import { resolveStorage } from "./storage.js";
import type {
	CreateStoreConfig,
	KitStorage,
	KitStore,
	PersistConfig,
	StoreErrorInfo,
} from "./types.js";

const STORAGE_KEY_PREFIX = "kit:store:";

type Envelope<TState> = {
	version: number;
	state: Partial<TState>;
};

const isDevelopment = (() => {
	let cached: boolean | undefined;
	return (): boolean => {
		if (cached !== undefined) return cached;
		try {
			const env = (typeof process !== "undefined" ? process.env : {}) as { NODE_ENV?: string };
			cached = env.NODE_ENV !== "production";
		} catch {
			cached = false;
		}
		return cached;
	};
})();

type ReportError = (err: unknown, op: StoreErrorInfo["op"]) => void;

/**
 * Read and parse persisted state, running migrations if needed.
 * Returns `null` on any failure - deliberately fail-soft, with the cause
 * surfaced to `onError` for diagnostics.
 */
function loadPersistedState<TState>(
	storageKey: string,
	storage: KitStorage,
	currentVersion: number,
	persist: PersistConfig<TState>,
	reportError: ReportError,
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
	} catch (err) {
		reportError(err, "hydrate");
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
	reportError: ReportError,
): void {
	try {
		const partial = persist.partialize ? persist.partialize(state) : state;
		const envelope: Envelope<TState> = { version, state: partial as Partial<TState> };
		const serialize = persist.serialize ?? JSON.stringify;
		const result = storage.setItem(storageKey, serialize(envelope));
		// Async storage returns a promise; we don't await here because
		// store updates are synchronous. Rejections surface via reportError.
		if (result instanceof Promise) {
			result.catch((err) => reportError(err, "persist"));
		}
	} catch (err) {
		reportError(err, "persist");
	}
}

const registry = new Set<KitStore<object, object>>();

/**
 * Create a typed Zustand store with persistence, migrations, and devtools.
 *
 * This is a thin factory over Zustand's `create()`. It bakes in conventions:
 * versioned persistence, migration chains, devtools wiring, and a `reset()`
 * method that clears both state and storage. State is shallow-frozen in
 * development to catch accidental top-level mutations early — nested
 * mutations are not detected.
 *
 * Failures during hydration, persistence, migration, or reset are reported
 * via the optional `onError` hook. They never throw to the caller — losing
 * persistence is preferable to crashing the app, but you almost certainly
 * want to know when it happens.
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
 * @example Persisted store with migration and diagnostics
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
 *   onError: (err, info) => console.warn(`[store:user:${info.op}]`, err),
 * });
 * ```
 */
export function createStore<TState extends object, TActions extends object = Record<string, never>>(
	config: CreateStoreConfig<TState, TActions>,
): KitStore<TState, TActions> {
	const {
		name,
		initial,
		actions,
		persist,
		devtools: enableDevtools = isDevelopment(),
		onError,
	} = config;

	const reportError = (err: unknown, op: StoreErrorInfo["op"]): void => {
		if (!onError) return;
		try {
			onError(err, { op, name });
		} catch {
			// A bad onError must not crash the store.
		}
	};

	const initialFrozen = isDevelopment() ? Object.freeze({ ...initial }) : initial;
	const storageKey = `${STORAGE_KEY_PREFIX}${name}`;
	const version = persist?.version ?? 0;
	const storage = persist ? resolveStorage(persist.storage) : null;

	const hydrated =
		persist && storage
			? loadPersistedState(storageKey, storage, version, persist, reportError)
			: null;

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

	// Capture the unsubscribe so destroy() can detach the persistence listener.
	// Without this, the closure (and the storage handle it captures) lives for
	// the rest of the process - a real leak in tests and SSR-per-request flows.
	let unsubscribePersist: (() => void) | null = null;
	if (persist && storage) {
		unsubscribePersist = useStore.subscribe((state) => {
			persistState(storageKey, storage, state as TState, version, persist, reportError);
		});
	}

	useStore.reset = () => {
		// Detach the persistence subscription around the reset write so the
		// subscription doesn't race with removeItem and rewrite the just-cleared
		// slot. We re-attach immediately afterwards.
		const restore = unsubscribePersist;
		if (restore) {
			restore();
			unsubscribePersist = null;
		}
		useStore.setState(initialFrozen as TState & TActions, true);
		if (persist && storage) {
			try {
				const removed = storage.removeItem(storageKey);
				if (removed instanceof Promise) {
					removed.catch((err) => reportError(err, "reset"));
				}
			} catch (err) {
				reportError(err, "reset");
			}
			// Re-attach for future state changes.
			unsubscribePersist = useStore.subscribe((state) => {
				persistState(storageKey, storage, state as TState, version, persist, reportError);
			});
		}
	};

	useStore.destroy = () => {
		if (unsubscribePersist) {
			unsubscribePersist();
			unsubscribePersist = null;
		}
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
