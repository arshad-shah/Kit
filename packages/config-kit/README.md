# @arshad-shah/config-kit

Typed config loader: env vars, `.env` files, and remote sources merged in order and validated against your schema. Wrong env var? Build fails at boot.

**1.4 KB gzipped.** Schema-agnostic — works with Zod, Valibot, ArkType, or anything with a `parse` method.

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

- `processEnvSource()` — reads `process.env`
- `dotenvFileSource(path)` — reads a `.env` file. Missing files (`ENOENT`) are soft-failed; other I/O failures (permission denied, "is a directory", etc.) are surfaced via `onSourceError` so misconfiguration doesn't get masked as "no config".
- `staticSource(values)` — hard-coded defaults
- `remoteSource({ url, headers })` — fetches a flat JSON config from HTTP. Primitives (numbers, booleans) are coerced to strings so downstream `z.coerce.*` schemas see them; complex values (objects, arrays, `null`) are dropped.

Or write your own. Sources merge in array order; later wins on conflicts.

## What you get

- **Schema-agnostic** validation — your library, your patterns
- **Layered sources** — defaults → file → env → remote, in that order
- **Soft source failures with observability** — a missing `.env` doesn't crash the load, but `onSourceError` lets you see real I/O failures
- **Secret-safe errors** — quoted values are redacted by default in error messages

## Documentation

[https://kit.arshadshah.com/config-kit](https://kit.arshadshah.com/config-kit)

## License

MIT © Arshad Shah
