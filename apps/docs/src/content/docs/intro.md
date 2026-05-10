---
title: Introduction
description: What kit is, what it isn't, and when to reach for it.
---

`kit` is a small set of TypeScript packages that handle the boring problems every side project hits in the first week: state that needs to survive a refresh, HTTP calls that need to be cancellable and retryable, structured logs you can ship somewhere, and config you can validate at boot.

It's deliberately scoped. Not a framework. Not a state-management opinion. Not a data-fetching mega-library. Four packages, each independently installable, each under a few KB, no peer-dependency soup.

## What's in the box

**store-kit** wraps Zustand with the conventions you'd reach for anyway: persistence, versioned migrations, devtools, and a `reset()` that clears storage too. Same Zustand API otherwise, so anything you know about Zustand still applies.

**fetch-kit** is a typed `fetch` wrapper plus two React hooks. Retries with backoff, timeouts via `AbortController`, an error class hierarchy you can `instanceof`, optional schema validation, and request/response interceptors. The React layer is a separate subpath import, so non-React consumers don't pay for it.

**log-kit** is a structured logger with pluggable transports — console, HTTP, file, Datadog — composed however you want. Six log levels, child loggers, performance markers, and per-transport failure isolation so a flaky shipping endpoint can't take your app down.

**config-kit** loads config from env vars, dotenv files, static objects, or remote sources, then validates it with whatever schema library you already use (Zod, Valibot, anything with a `parse` interface). Source ordering, override semantics, and a single typed config object at the end.

## What it isn't

- Not a TanStack Query replacement. fetch-kit doesn't cache or deduplicate. If you need that, pair it with TanStack Query - or don't, most apps don't need it.
- Not a Redux. store-kit doesn't try to be the one true source of state. Use as many stores as you want.
- Not a router, form library, or component framework. Compose with whatever you're already using.

## When to use it

Reach for `kit` when you're starting a side project and want the boring parts already done. Skip it if your app needs sophisticated server-state caching, optimistic updates with rollback, or normalized state - those problems need bigger tools.
