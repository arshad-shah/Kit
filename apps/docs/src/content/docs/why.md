---
title: Why kit
description: The reasoning behind the design choices.
---

## Why four packages, not one

State, HTTP, logging, and configuration are different problems with different update cadences and different consumers. State changes when the user does things; HTTP changes when the network responds; logs are written constantly but read rarely; config is parsed once at boot. Bundling them creates an awkward combined API and forces every consumer to pay for parts they don't use. Splitting them keeps each package's surface area small enough to actually understand, and lets you install only what you need.

Each kit is independently versioned and independently shippable. A breaking change in one doesn't force coordinated upgrades across the others.

## Why Zustand under the hood

Zustand is the smallest, most flexible store primitive that doesn't force a paradigm. We don't replace it - we layer conventions on top. If you outgrow store-kit, you can drop down to raw Zustand without rewriting anything.

## Why a custom fetch wrapper, not Axios or ky

- **Size.** Axios is ~14 KB gzipped. ky is ~3 KB. fetch-kit is ~3 KB *with* retries, response caching, in-flight dedupe, GraphQL, and typed errors.
- **Native fetch.** Works in browsers, edge runtimes, Node 20+, Bun, Deno - everywhere modern JS runs.
- **No request/response transforms by default.** Predictable behaviour beats clever defaults.

## Why React hooks at all

You don't have to use them. The core `Client` is framework-agnostic. The hooks are an optional ergonomic layer on a separate subpath - tree-shaken away if unused.

## Why a custom logger, not pino or winston

- **Size.** pino is ~6 KB minified+gzipped on the client; winston is much larger and Node-only. log-kit is 1.4 KB and runs in browsers, workers, edge runtimes, and Node.
- **Transport isolation.** A flaky HTTP shipper can't take your app down - each transport is wrapped, errors are swallowed, and the rest keep running.
- **No async hooks, no Node.js-only APIs.** Same logger code works in your edge function and your dev server.

## Why a config loader at all

You can read `process.env` directly. But then you do it from twelve files, half of them parse `Number(...)` differently, secrets leak into error messages, and the only validation is "the app started, probably." config-kit gives you one source-ordered, schema-validated config object - and the boot fails loudly when something's missing instead of NaN-ing into production.

## Why JSDoc, not just types

Types tell you *what*. JSDoc tells you *why*. Every public symbol in `kit` has a JSDoc block with at least one `@example`, and those examples are the same ones rendered in this docs site. One source of truth.

## Why size budgets in CI

Bundle size regresses silently. A package starts at 2 KB, somebody adds a "small" helper, six months later it's 12 KB and nobody noticed. `size-limit` runs on every PR; if you cross the budget, the build fails. The discipline is the point.

## Why mutation testing

Line coverage is a low bar. A test that calls a function but never checks the result still counts as "covered". Mutation testing flips operators, deletes statements, and changes return values, then asks: do your tests still fail? If not, the coverage was a lie.
