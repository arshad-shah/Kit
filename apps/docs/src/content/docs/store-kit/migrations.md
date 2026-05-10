---
title: Migrations
description: Versioned state evolution without breaking existing users.
---

Persisted state outlives your code. Every time the shape of your state changes, somebody's browser still has the old shape. Migrations bridge that gap.

## The contract

```ts
persist: {
  storage: "local",
  version: 3,
  migrate: {
    2: (oldState) => ({ ...oldState, prefs: oldState.preferences }),
    3: (oldState) => ({ ...oldState, theme: oldState.theme ?? "dark" }),
  },
}
```

The `version` is the *current* schema version. The `migrate` map's keys are the *target* versions. When loading, `store-kit` reads the persisted version, then runs every migration from `persistedVersion + 1` up through `version`.

## What runs when

| Persisted | Current | Migrations run |
|-----------|---------|----------------|
| `0`       | `3`     | `1`, `2`, `3` (in order) |
| `1`       | `3`     | `2`, `3` |
| `3`       | `3`     | none |
| `5`       | `3`     | none - falls back to initial state (downgrade is unsafe) |

Missing intermediate versions are skipped without error. So you can have `migrate: { 5: ... }` without supplying 1-4 if no shape changes happened in those versions.

## Migration failures are soft failures

If a migration throws, the chain aborts and the store falls back to initial state. This is intentional: better to lose user data than to hand the app a half-migrated, possibly invalid state. If you care about diagnosing failures, wrap the migration in your own try/catch and log before re-throwing.

## A worked example

Schema v1: `{ user: { name: string } }`
Schema v2: split name into first/last:

```ts
createStore({
  name: "profile",
  initial: { user: { firstName: "", lastName: "" } },
  persist: {
    storage: "local",
    version: 2,
    migrate: {
      2: (old) => {
        const oldUser = (old as { user: { name?: string } }).user;
        const [first = "", ...rest] = (oldUser?.name ?? "").split(" ");
        return {
          user: { firstName: first, lastName: rest.join(" ") },
        };
      },
    },
  },
});
```

Users on v1 silently get migrated. Users on v2 (or fresh installs) skip the migration. Done.
