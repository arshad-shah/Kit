---
title: Schema patterns
description: Useful Zod patterns for environment configuration.
---

Environment variables are always strings. The schema is responsible for parsing them into the types your code wants. These patterns come up in every project.

## Coercing numbers

```ts
PORT: z.coerce.number().int().positive()
TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(30_000)
```

`z.coerce.number()` runs `Number()` on the input. Empty strings become `0`, which is rarely what you want - chain `.positive()` or `.min(1)` to catch them.

## Coercing booleans

`z.coerce.boolean()` is misleading - any non-empty string becomes `true`. Use a string enum instead:

```ts
const boolFromString = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

DEBUG_MODE: boolFromString.default("false"),
ENABLE_TELEMETRY: boolFromString.default("true"),
```

## Comma-separated lists

```ts
const csvList = z
  .string()
  .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean));

ALLOWED_ORIGINS: csvList.default(""),
FEATURE_FLAGS: csvList.default(""),
```

For typed lists, validate after splitting:

```ts
const csvOf = <T>(item: z.ZodType<T>) =>
  z.string().transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(item));

ALLOWED_PORTS: csvOf(z.coerce.number().int().positive())
```

## Conditional fields

Some fields are required only in certain environments. Use `superRefine`:

```ts
const schema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]),
    DATABASE_URL: z.string().url().optional(),
    REDIS_URL: z.string().url().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === "production") {
      if (!data.DATABASE_URL) {
        ctx.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "required in production" });
      }
      if (!data.REDIS_URL) {
        ctx.addIssue({ code: "custom", path: ["REDIS_URL"], message: "required in production" });
      }
    }
  });
```

## URL with allowed hosts

```ts
const internalUrl = z.string().url().refine(
  (url) => new URL(url).hostname.endsWith(".internal"),
  "must be an internal hostname",
);

ADMIN_API_URL: internalUrl,
```

## Enum with case-insensitive matching

```ts
const ciEnum = <U extends [string, ...string[]]>(values: U) =>
  z.string().transform((v) => v.toLowerCase()).pipe(z.enum(values));

LOG_LEVEL: ciEnum(["trace", "debug", "info", "warn", "error"]).default("info"),
```

Now `LOG_LEVEL=Info` works the same as `info`.

## Reusable schema

Centralize the schema so backend, scripts, and tests share one definition:

```ts
// packages/config/src/schema.ts
import { z } from "zod";

export const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
});

export type Config = z.infer<typeof ConfigSchema>;
```

```ts
// packages/server/src/config.ts
import { loadConfig, processEnvSource, dotenvFileSource } from "@arshad-shah/config-kit";
import { ConfigSchema } from "@my-org/config";

export const config = await loadConfig({
  schema: ConfigSchema,
  sources: [dotenvFileSource(".env"), processEnvSource()],
});
```
