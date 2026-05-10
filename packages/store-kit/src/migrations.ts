import type { MigrationMap } from "./types.js";

/**
 * Apply migrations in version order from `fromVersion` up to `toVersion`.
 *
 * Migrations are run sequentially: the output of version N becomes the input to
 * version N+1. Missing intermediate versions are skipped (no-op), which lets
 * you keep migrations sparse without breaking the chain.
 *
 * @typeParam TState - The current state shape
 * @param persistedState - Raw state read from storage (may be any shape)
 * @param fromVersion - The version the persisted state was written at
 * @param toVersion - The current schema version we want to reach
 * @param migrations - Map of target-version → migration function
 * @returns Migrated state, or `null` if migration failed
 *
 * @internal
 */
export function runMigrations<TState>(
	persistedState: unknown,
	fromVersion: number,
	toVersion: number,
	migrations: MigrationMap<TState>,
): Partial<TState> | null {
	if (fromVersion === toVersion) {
		return persistedState as Partial<TState>;
	}

	if (fromVersion > toVersion) {
		// Persisted version is newer than current code - we can't safely downgrade.
		// Return null so the caller falls back to initial state.
		return null;
	}

	let current: unknown = persistedState;

	for (let v = fromVersion + 1; v <= toVersion; v++) {
		const migration = migrations[v];
		if (migration) {
			try {
				current = migration(current);
			} catch {
				// Any migration failure aborts the chain. Better to lose persistence
				// than to hand the app a half-migrated, possibly invalid state.
				return null;
			}
		}
	}

	return current as Partial<TState>;
}
