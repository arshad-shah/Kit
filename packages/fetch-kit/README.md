# @arshad-shah/fetch-kit

Typed `fetch` client with retries, timeouts, schema validation, and React hooks. Native `fetch` under the hood - works in browsers, edge runtimes, Node 20+, Bun, and Deno.

**2.5 KB core, 0.8 KB React hooks, gzipped.**

```bash
pnpm add @arshad-shah/fetch-kit
# Optional: zod for schema validation, react for hooks
pnpm add zod react
```

## Quick example

```ts
import { createClient, HttpError } from "@arshad-shah/fetch-kit";

export const api = createClient({
  baseUrl: "https://api.example.com",
  timeout: 10_000,
  retry: { attempts: 3, backoff: "exponential" },
  auth: () => localStorage.getItem("token"),
});

try {
  const user = await api.get<User>("/users/me");
} catch (err) {
  if (err instanceof HttpError && err.status === 401) {
    redirect("/login");
  }
}
```

## React hooks

```tsx
import { useFetch, useMutation } from "@arshad-shah/fetch-kit/react";

function Profile() {
  const { data, error, loading, refetch } = useFetch<User>(api, "/users/me");
  // ...
}
```

## What you get

- **Typed errors** - `NetworkError`, `TimeoutError`, `AbortError`, `HttpError`, `ValidationError` - `instanceof` everything
- **Configurable retry** with exponential, linear, or custom backoff
- **Schema validation** - drop in any library with a `parse` method (Zod, Valibot, ArkType)
- **Interceptors** for both requests and responses
- **Abort-on-unmount** baked into the React hooks

## Documentation

[https://kit.arshadshah.com/fetch-kit](https://kit.arshadshah.com/fetch-kit)

## License

MIT © Arshad Shah
