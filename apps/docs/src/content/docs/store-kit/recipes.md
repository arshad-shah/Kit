---
title: Recipes
description: Common patterns - logout, slices, derived state, hydration gating.
---

## Logout: reset every store

```ts
import { resetAllStores } from "@arshad-shah/store-kit";

function logout() {
  api.delete("/session");
  resetAllStores(); // clears state + persisted data for every store
}
```

## Slicing a large store

For stores that grow past ~10 actions, splitting helps:

```ts
type CartState = { items: Item[]; coupon: string | null };
type CartActions = {
  add: (item: Item) => void;
  remove: (id: string) => void;
  applyCoupon: (code: string) => void;
};

const useCart = createStore<CartState, CartActions>({
  name: "cart",
  initial: { items: [], coupon: null },
  actions: (set, get) => ({
    add: (item) => set((s) => ({ items: [...s.items, item] })),
    remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
    applyCoupon: (code) => {
      if (get().items.length === 0) return;
      set({ coupon: code });
    },
  }),
});
```

Past that size, two stores beat one big slice.

## Derived state

Compute selectors at the call site - Zustand's design assumes this:

```ts
const total = useCart((s) => s.items.reduce((acc, i) => acc + i.price, 0));
```

If derivation is expensive, memoize with `useMemo` or a selector library like `proxy-memoize`.

## Gating render on hydration

For server-rendered apps where you must wait for client hydration before reading persisted state:

```ts
const [hydrated, setHydrated] = useState(false);
useEffect(() => setHydrated(true), []);

if (!hydrated) return <Skeleton />;
return <PersistedView />;
```

Or move the read inside an effect:

```ts
useEffect(() => {
  const stored = useStore.getState();
  // safe to use here
}, []);
```
