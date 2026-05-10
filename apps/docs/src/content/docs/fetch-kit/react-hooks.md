---
title: React hooks
description: useFetch and useMutation - declarative state for the simple cases.
---

The hooks live on a separate subpath so non-React consumers don't pay for them:

```ts
import { useFetch, useMutation } from "@arshad-shah/fetch-kit/react";
```

## useFetch

For GET requests where the component owns the lifecycle:

```tsx
function Profile() {
  const { data, error, loading, refetch } = useFetch<User>(api, "/users/me");

  if (loading) return <Spinner />;
  if (error) return <ErrorView error={error} onRetry={refetch} />;
  return <ProfileView user={data!} />;
}
```

Behaviour:
- Runs on mount; aborts on unmount
- `enabled: false` skips the initial fetch (useful for conditional loading)
- `deps: [...]` triggers a refetch when any dependency changes (use it the same way you'd use a `useEffect` dep array)
- `refetch()` runs the request again imperatively, returns a promise

## useMutation

For state-changing requests triggered by user actions:

```tsx
function CreateUserForm() {
  const { mutate, loading, error } = useMutation<User, NewUser>(
    api,
    "/users",
    {
      method: "POST",
      onSuccess: (user) => router.push(`/users/${user.id}`),
      onError: (err) => toast.error(err.message),
    }
  );

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      mutate({ name, email });
    }}>
      {/* ... */}
      <button disabled={loading}>Create</button>
    </form>
  );
}
```

`mutate` returns a promise - you can `await` it for sequencing, or rely on `onSuccess` for cleanup.

## What about caching?

These hooks intentionally don't cache. Each component instance owns its request. If two components on the same page both call `useFetch(api, "/users/me")`, two requests go out.

If you want one shared cached result across components, use TanStack Query - it's purpose-built for that. Pass fetch-kit's client into your query function:

```ts
useQuery({
  queryKey: ["user", "me"],
  queryFn: () => api.get<User>("/users/me"),
});
```

You get fetch-kit's typed errors and retry config, plus TanStack's caching.
