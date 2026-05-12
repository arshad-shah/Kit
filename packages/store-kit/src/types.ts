import type { StoreApi, UseBoundStore } from "zustand";

/**
 * A function that updates store state.
 * Accepts either a partial state object or a function returning one.
 */
export type SetState<TState> = StoreApi<TState>["setState"];

/**
 * A function that reads current store state.
 */
export type GetState<TState> = StoreApi<TState>["getState"];

/**
 * A function that defines store actions given access to set/get.
 *
 * @typeParam TState - The shape of the store's state slice
 * @typeParam TActions - The shape of the actions object returned
 */
export type ActionsCreator<TState, TActions> = (
	set: SetState<TState>,
	get: GetState<TState>,
) => TActions;

/**
 * Storage backend identifier or a custom Storage implementation.
 *
 * - `"local"` uses `window.localStorage`
 * - `"session"` uses `window.sessionStorage`
 * - `"memory"` uses an in-memory map (useful for SSR and tests)
 * - A custom object implementing the {@link KitStorage} interface
 */
export type StorageBackend = "local" | "session" | "memory" | KitStorage;

/**
 * Minimal storage interface compatible with Web Storage and custom backends.
 */
export type KitStorage = {
	getItem: (key: string) => string | null | Promise<string | null>;
	setItem: (key: string, value: string) => void | Promise<void>;
	removeItem: (key: string) => void | Promise<void>;
};

/**
 * A migration step that transforms persisted state from one version to the next.
 *
 * Migrations run in order from the persisted version up to the current version.
 * Each migration must return state shaped for its target version.
 *
 * @example
 * ```ts
 * const migrations: MigrationMap<UserState> = {
 *   2: (oldState) => ({ ...oldState, prefs: oldState.preferences }),
 * };
 * ```
 */
export type MigrationMap<TState> = Record<number, (persistedState: unknown) => Partial<TState>>;

/**
 * Configuration for persisting store state to a storage backend.
 */
export type PersistConfig<TState> = {
	/** Storage backend. Defaults to `"local"` in browsers, `"memory"` in Node. */
	storage?: StorageBackend;
	/** Schema version. Increment when state shape changes. */
	version?: number;
	/** Migrations from older versions to the current version. */
	migrate?: MigrationMap<TState>;
	/** Keys to include in persistence. If omitted, the entire state is persisted. */
	partialize?: (state: TState) => Partial<TState>;
	/** Custom serializer. Defaults to `JSON.stringify`. */
	serialize?: (value: unknown) => string;
	/** Custom deserializer. Defaults to `JSON.parse`. */
	deserialize?: (value: string) => unknown;
};

/**
 * Information passed to {@link CreateStoreConfig.onError}.
 */
export type StoreErrorInfo = {
	/** Where in the store lifecycle the failure occurred. */
	op: "hydrate" | "persist" | "reset";
	/** The store's `name`, set after construction. */
	name?: string;
};

/**
 * Configuration object for {@link createStore}.
 */
export type CreateStoreConfig<TState extends object, TActions extends object> = {
	/** Unique store name. Used as storage key and devtools label. */
	name: string;
	/**
	 * Initial state. Shallow-frozen at runtime in development to catch
	 * top-level mutations — nested mutations are NOT detected.
	 */
	initial: TState;
	/** Action creator. Receives `set` and `get` from Zustand. */
	actions?: ActionsCreator<TState, TActions>;
	/** Persistence configuration. Omit to disable persistence. */
	persist?: PersistConfig<TState>;
	/** Enable Redux DevTools integration. Defaults to `true` in development. */
	devtools?: boolean;
	/**
	 * Diagnostic hook fired when hydration parsing, persistence writes,
	 * migrations, or reset cleanup fail. Failures are still swallowed (losing
	 * persistence is preferable to crashing) — this hook is purely for
	 * observability.
	 */
	onError?: (error: unknown, info: StoreErrorInfo) => void;
};

/**
 * The combined state and actions exposed by a kit store.
 */
export type KitStore<TState extends object, TActions extends object> = UseBoundStore<
	StoreApi<TState & TActions>
> & {
	/** Reset the store to its initial state and clear any persisted value. */
	reset: () => void;
	/** Unsubscribe and remove the store from the global registry. */
	destroy: () => void;
};
