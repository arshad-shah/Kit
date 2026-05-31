---
title: React hooks
description: useFetch, useMutation, and useGraphQL - declarative state for the simple cases.
---

The hooks live on a separate subpath so non-React consumers don't pay for them:

```ts
import { useFetch, useMutation, useGraphQL } from "@arshad-shah/fetch-kit/react";
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
      onSuccess: (user, variables) => router.push(`/users/${user.id}`),
      onError: (err, variables) => toast.error(err.message),
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

## useGraphQL

For declarative GraphQL queries. Like `useFetch`, it runs on mount, aborts on unmount, and drops stale responses:

```tsx
function Header() {
  const { data, loading, error, refetch } = useGraphQL<{ me: User }>(
    api,
    `query Me { me { id name } }`,
    { variables: {}, enabled: true },
  );

  if (loading) return <Spinner />;
  if (error) return <ErrorView error={error} onRetry={refetch} />;
  return <Avatar user={data!.me} />;
}
```

It requires a client configured with `graphqlEndpoint` (or pass a per-request `url`). Like `useFetch`, it supports `enabled` and `deps`. A GraphQL response carrying an `errors` array surfaces as a [`GraphQLError`](/fetch-kit/errors/).

## What about caching?

When the client is configured with `cache`, GET requests and GraphQL queries are cached and deduped automatically, so two components calling `useFetch(api, "/users/me")` share one in-flight request and one cache entry. Mutations are never cached.

If you need richer server-state management - normalized caches, optimistic updates with rollback, or background refetching - use TanStack Query. Pass fetch-kit's client into your query function:

```ts
useQuery({
  queryKey: ["user", "me"],
  queryFn: () => api.get<User>("/users/me"),
});
```

You get fetch-kit's typed errors and retry config, plus TanStack's caching.
