# @arshad-shah/config-kit

[![npm version](https://img.shields.io/npm/v/@arshad-shah/config-kit?color=cb3837&logo=npm)](https://www.npmjs.com/package/@arshad-shah/config-kit)
[![npm downloads](https://img.shields.io/npm/dm/@arshad-shah/config-kit?color=cb3837&logo=npm)](https://www.npmjs.com/package/@arshad-shah/config-kit)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/@arshad-shah/config-kit?label=gzip)](https://bundlephobia.com/package/@arshad-shah/config-kit)
[![Types](https://img.shields.io/npm/types/@arshad-shah/config-kit?color=3178c6&logo=typescript&logoColor=white)](https://www.npmjs.com/package/@arshad-shah/config-kit)
[![License](https://img.shields.io/npm/l/@arshad-shah/config-kit)](../../LICENSE)
[![CI](https://github.com/arshad-shah/kit/actions/workflows/ci.yml/badge.svg)](https://github.com/arshad-shah/kit/actions/workflows/ci.yml)

Typed config loader: env vars, `.env` files, remote sources, **and module-based config files** (`app.config.ts`) merged in order and validated against your schema. Wrong env var? Build fails at boot.

**~2 KB gzipped.** Schema-agnostic — works with Zod, Valibot, ArkType, or anything with a `parse` method.

```bash
pnpm add @arshad-shah/config-kit zod
```

## Quick example

```ts
import { z } from "zod";
import {
  loadConfig,
  dotenvFileSource,
  processEnvSource,
} from "@arshad-shah/config-kit";

const config = await loadConfig({
  schema: z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().url(),
  }),
  sources: [
    dotenvFileSource(".env"),
    dotenvFileSource(".env.local"),
    processEnvSource(),
  ],
  // Diagnostic channel - optional, fires when a source's load() throws.
  // Failures are still soft-handled so other sources can fill in.
  onSourceError: (err, info) => console.warn(`[config:${info.source}]`, err),
});

config.PORT;        // number
config.DATABASE_URL; // string, validated as URL
```

## Built-in sources

**Flat** (return `Record<string, string>`, schema coerces via `z.coerce.*`):

- `processEnvSource()` — reads `process.env`
- `dotenvFileSource(path)` — reads a `.env` file. Missing files (`ENOENT`) are soft-failed; other I/O failures (permission denied, "is a directory", etc.) are surfaced via `onSourceError` so misconfiguration doesn't get masked as "no config".
- `staticSource(values)` — hard-coded defaults
- `remoteSource({ url, headers })` — fetches a flat JSON config from HTTP. Primitives (numbers, booleans) are coerced to strings so downstream `z.coerce.*` schemas see them; complex values (objects, arrays, `null`) are dropped.

**Structured** (return a nested object — sub-objects, arrays, functions — deep-merged, no coercion):

- `configFileSource({ name })` — discovers and imports a `name.config.{ts,js,mjs,cjs,json}` file (walking up from `cwd`), returning its default export. Missing file is soft, so defaults apply. Pass a custom `load` to compile TS/ESM on the fly (esbuild/jiti).
- `objectSource(values)` — a nested defaults layer that participates in the deep merge.

Or write your own. Flat sources merge key-by-key; structured sources deep-merge (plain objects recurse, arrays/primitives replace). Later sources win on conflicts.

## Module-based config

Load a `*.config.ts` whose default export is a nested object, with typed defaults:

```ts
import {
  loadConfig,
  objectSource,
  configFileSource,
} from "@arshad-shah/config-kit";

const config = await loadConfig({
  schema: ConfigSchema,
  sources: [
    objectSource({ dev: { port: 3000 }, build: { minify: true } }), // defaults
    configFileSource({
      name: "app", // → app.config.{ts,js,mjs,cjs,json}
      // Compile TS on the fly so config-kit needs no compiler of its own:
      load: async (file) =>
        (await import("jiti")).createJiti(import.meta.url)(file),
    }),
  ],
  // Throw by default; downgrade to a warning behind a flag.
  mode: process.env.STRICT_CONFIG === "0" ? "warn" : "strict",
  // Inspect the raw ZodError / render your own message with the file path.
  onValidationError: (err) => formatConfigError(err),
});
```

`dev` deep-merges against the defaults; `build`, arrays, and primitives replace wholesale.

## What you get

- **Schema-agnostic** validation — your library, your patterns
- **Flat or structured sources** — env maps *and* nested module-based config files, deep-merged
- **Layered sources** — defaults → file → env → remote, in that order
- **Soft source failures with observability** — a missing `.env` doesn't crash the load, but `onSourceError` lets you see real I/O failures
- **Strict or warn** — throw on invalid config (default) or downgrade to a logged warning via `mode`
- **Host-controlled errors** — `onValidationError` surfaces the raw `ZodError` so you can render your own message
- **Secret-safe errors** — quoted values are redacted by default in env error messages

## Documentation

[https://kit.arshadshah.com/config-kit](https://kit.arshadshah.com/config-kit)

## License

MIT © Arshad Shah
