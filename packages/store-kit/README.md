# @arshad-shah/store-kit

Tiny, typed Zustand factory with persistence, versioned migrations, devtools, and reset baked in.

**1.4 KB gzipped.** No dependencies in the hot path - just `zustand` as a peer.

```bash
pnpm add @arshad-shah/store-kit zustand
```

## Quick example

```ts
import { createStore } from "@arshad-shah/store-kit";

export const useUser = createStore({
  name: "user",
  initial: { id: null as string | null, prefs: {} },
  actions: (set) => ({
    setUser: (id: string) => set({ id }),
    clear: () => set({ id: null, prefs: {} }),
  }),
  persist: { storage: "local", version: 1 },
});

// In a component
const id = useUser((s) => s.id);
const { setUser } = useUser.getState();
```

## What you get

- **Typed actions** with proper inference from `set`/`get`
- **Persistence** to localStorage, sessionStorage, memory, or any custom backend
- **Versioned migrations** for schema evolution without breaking existing users
- **Devtools** wired up automatically in development
- **`reset()`** that clears state *and* persisted data
- **`resetAllStores()`** for logout flows

## Documentation

[https://kit.arshadshah.com/store-kit](https://kit.arshadshah.com/store-kit)

## License

MIT © Arshad Shah
