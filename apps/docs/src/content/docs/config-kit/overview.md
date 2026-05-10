---
title: config-kit overview
description: Typed environment loading from .env files, process.env, and remote sources, validated by your schema.
---

`config-kit` loads configuration from one or more sources, merges them in order, validates the result against a schema, and gives you back a typed object. Wrong env var? Build fails at boot, not at request time.

## The shape of a load

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
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  }),
  sources: [
    dotenvFileSource(".env"),
    dotenvFileSource(".env.local"),
    processEnvSource(),
  ],
});

config.PORT;        // number
config.DATABASE_URL; // string, validated as URL
```

`config` is fully typed via `z.infer<typeof schema>`. There's no shadow type definition to keep in sync.

## What you get

- **Schema-agnostic** - works with Zod, Valibot, ArkType, or anything with a `parse(input) → output` method
- **Layered sources** - load from multiple places; later sources override earlier ones
- **Soft source failures** - a missing `.env` or unreachable remote endpoint doesn't crash the load
- **Secret-safe errors** - validation errors redact quoted values by default so secrets don't end up in logs
- **Optional logger** - pass any object with `info/warn/error` methods (compatible with log-kit) for source-load diagnostics

## What it doesn't do

- No automatic file-watching/reload (config is captured at boot; for hot reload, build it yourself)
- No nested config files (sources return flat `Record<string, string>`; the schema decides the output shape)
- No defaults system - use the schema's defaults (Zod has `.default()`, Valibot has `optional()` with a fallback)

## Composition with log-kit

If you have a logger, pass it in:

```ts
import { createLogger } from "@arshad-shah/log-kit";

const log = createLogger();
const config = await loadConfig({ schema, sources, logger: log });
```

The logger gets `info` for each successful source load and `warn` if a source throws. No hard coupling - any object with the right shape works.
