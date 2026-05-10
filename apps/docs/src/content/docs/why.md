---
title: Why kit
description: The reasoning behind the design choices.
---

## Why two packages, not one

State management and data fetching are different problems with different update cadences. State changes when the user does things; server data changes when the network responds. Bundling them creates an awkward combined API. Splitting them keeps each package's surface area small enough to actually understand.

## Why Zustand under the hood

Zustand is the smallest, most flexible store primitive that doesn't force a paradigm. We don't replace it - we layer conventions on top. If you outgrow store-kit, you can drop down to raw Zustand without rewriting anything.

## Why a custom fetch wrapper, not Axios or ky

- **Size.** Axios is ~14 KB gzipped. ky is ~3 KB. fetch-kit is 2.5 KB *with* retry logic and typed errors.
- **Native fetch.** Works in browsers, edge runtimes, Node 20+, Bun, Deno - everywhere modern JS runs.
- **No request/response transforms by default.** Predictable behaviour beats clever defaults.

## Why React hooks at all

You don't have to use them. The core `Client` is framework-agnostic. The hooks are an optional ergonomic layer on a separate subpath - tree-shaken away if unused.

## Why JSDoc, not just types

Types tell you *what*. JSDoc tells you *why*. Every public symbol in `kit` has a JSDoc block with at least one `@example`, and those examples are the same ones rendered in this docs site. One source of truth.

## Why size budgets in CI

Bundle size regresses silently. A package starts at 2 KB, somebody adds a "small" helper, six months later it's 12 KB and nobody noticed. `size-limit` runs on every PR; if you cross the budget, the build fails. The discipline is the point.

## Why mutation testing

Line coverage is a low bar. A test that calls a function but never checks the result still counts as "covered". Mutation testing flips operators, deletes statements, and changes return values, then asks: do your tests still fail? If not, the coverage was a lie.
