# @arshad-shah/config-kit

Typed config loader: env vars, `.env` files, and remote sources merged in order and validated against your schema. Wrong env var? Build fails at boot.

**1.4 KB gzipped.** Schema-agnostic - works with Zod, Valibot, ArkType, or anything with a `parse` method.

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
});

config.PORT;        // number
config.DATABASE_URL; // string, validated as URL
```

## Built-in sources

- `processEnvSource()` - reads `process.env`
- `dotenvFileSource(path)` - reads a `.env` file (missing files are soft-failed)
- `staticSource(values)` - hard-coded defaults
- `remoteSource({ url, headers })` - fetches a flat JSON config from HTTP

Or write your own. Sources merge in array order; later wins on conflicts.

## What you get

- **Schema-agnostic** validation - your library, your patterns
- **Layered sources** - defaults → file → env → remote, in that order
- **Soft source failures** - a missing `.env` doesn't crash the load
- **Secret-safe errors** - quoted values are redacted by default in error messages

## Documentation

[https://kit.arshadshah.com/config-kit](https://kit.arshadshah.com/config-kit)

## License

MIT © Arshad Shah
