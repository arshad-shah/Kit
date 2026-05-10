---
title: Introduction
description: What kit is, what it isn't, and when to reach for it.
---

`kit` is a pair of small TypeScript packages that handle two problems every side project hits in the first week: client state that needs to survive a refresh, and HTTP calls that need to be cancellable, retryable, and typed.

It's deliberately scoped. Not a framework. Not a state-management opinion. Not a data-fetching mega-library. Two packages, three thousand lines of source, no peer-dependency soup.

## What's in the box

**store-kit** wraps Zustand with the conventions you'd reach for anyway: persistence, versioned migrations, devtools, and a `reset()` that clears storage too. Same Zustand API otherwise, so anything you know about Zustand still applies.

**fetch-kit** is a typed `fetch` wrapper plus two React hooks. Retries with backoff, timeouts via `AbortController`, an error class hierarchy you can `instanceof`, optional schema validation, and request/response interceptors. The React layer is a separate subpath import, so non-React consumers don't pay for it.

## What it isn't

- Not a TanStack Query replacement. fetch-kit doesn't cache or deduplicate. If you need that, pair it with TanStack Query - or don't, most apps don't need it.
- Not a Redux. store-kit doesn't try to be the one true source of state. Use as many stores as you want.
- Not a router, form library, or component framework. Compose with whatever you're already using.

## When to use it

Reach for `kit` when you're starting a side project and want the boring parts already done. Skip it if your app needs sophisticated server-state caching, optimistic updates with rollback, or normalized state - those problems need bigger tools.
