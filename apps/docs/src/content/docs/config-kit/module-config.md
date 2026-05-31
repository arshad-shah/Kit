---
title: Module-based config
description: Load a nested config file (app.config.ts) — objects, arrays, and functions — not just flat env vars.
---

Some tools aren't configured by environment variables. They're configured by a **module that exports a nested object** - `app.config.ts`, `vite.config.ts`, `extforge.config.ts` - with sub-objects, arrays, and sometimes functions (plugins). config-kit loads those too, via **structured sources**.

## The shape of a load

```ts
import {
  loadConfig,
  objectSource,
  configFileSource,
} from "@arshad-shah/config-kit";
import { ConfigSchema } from "./schema";

const config = await loadConfig({
  schema: ConfigSchema,
  sources: [
    // Typed defaults, deep-merged under whatever the user's file sets.
    objectSource({
      dev: { port: 3000, open: false },
      build: { minify: true },
      plugins: [],
    }),
    // app.config.{ts,js,mjs,cjs,json}, discovered by walking up from cwd.
    configFileSource({
      name: "app",
      load: async (file) =>
        (await import("jiti")).createJiti(import.meta.url)(file),
    }),
  ],
});
```

A user's `app.config.ts`:

```ts
export default {
  dev: { port: 4000 },        // deep-merges → { port: 4000, open: false }
  plugins: [myPlugin()],      // arrays replace wholesale
};
```

## Flat vs structured sources

| | Flat source | Structured source |
| --- | --- | --- |
| `load()` returns | `Record<string, string>` | any nested object |
| Discriminator | none | `structured: true` |
| Coercion | schema coerces strings (`z.coerce.*`) | none - values pass through |
| Merge | key-by-key, last wins | deep merge |
| Error redaction | quoted values redacted | not redacted (config files are public) |

Mix them freely in one `sources` array.

## Deep merge semantics

Structured sources **deep-merge** in array order:

- **Plain objects** merge recursively (`dev`, `build`, `manifest`).
- **Arrays** replace wholesale - `plugins: [a]` then `plugins: [b]` yields `[b]`, not `[a, b]`.
- **Primitives** replace.
- **Functions and class instances** are kept by reference and replace (never merged).
- `undefined` values are skipped, so a later source can't blank out an earlier one.

`deepMerge` and `isPlainObject` are exported if you need the same behaviour elsewhere:

```ts
import { deepMerge } from "@arshad-shah/config-kit";

deepMerge({ dev: { port: 3000, host: "x" } }, { dev: { port: 4000 } });
// → { dev: { port: 4000, host: "x" } }
```

## `configFileSource`

```ts
configFileSource({
  name: "app",                                   // → app.config.*
  cwd: process.cwd(),                            // search start (default cwd)
  extensions: ["ts", "js", "mjs", "cjs", "json"],// first match wins
  searchParents: true,                           // walk up to find the file
  load: async (file) => /* compile + import */,  // optional transform
})
```

- **Discovery** walks up from `cwd`, trying `extensions` in order within each directory; the first existing file wins. Set `searchParents: false` to look only in `cwd`.
- **Missing file is soft** - `load()` returns `{}`, so your `objectSource` defaults apply. (Mirrors `dotenvFileSource`'s ENOENT handling.)
- **The default loader** parses `.json` directly and dynamic-`import()`s everything else, unwrapping the `default` export. `.js`/`.mjs`/`.cjs`/`.json` work on any modern runtime.
- **TypeScript** needs a `load` transform unless your runtime imports `.ts` natively. config-kit deliberately doesn't bundle a compiler - pass [jiti](https://github.com/unjs/jiti), esbuild, or your own:

```ts
// esbuild
load: async (file) => {
  const { build } = await import("esbuild");
  const result = await build({
    entryPoints: [file],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
  });
  const code = result.outputFiles[0].text;
  const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  return import(url);
}
```

If your loader returns a module namespace (`{ default }`), config-kit unwraps `default` for you.

## Strict vs warn, and custom errors

A build tool usually wants to **fail at boot** on invalid config - that's the default (`mode: "strict"`). To downgrade to a warning behind a flag:

```ts
const config = await loadConfig({
  schema: ConfigSchema,
  sources,
  mode: process.env.STRICT_CONFIG === "0" ? "warn" : "strict",
  logger,
});
```

In `warn` mode the validation error is logged via your `logger` and `loadConfig` returns the merged, **unvalidated** input.

Render your own error message (config files are public, so the file path and full issues are useful, not a leak) with `onValidationError`. Return an `Error` to replace config-kit's default; return nothing to keep it:

```ts
import { ZodError } from "zod";

const config = await loadConfig({
  schema: ConfigSchema,
  sources,
  onValidationError: (err, { sources }) => {
    if (err instanceof ZodError) {
      const lines = err.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
      return new Error(`Invalid app.config:\n${lines.join("\n")}`);
    }
  },
});
```

`onValidationError` receives the raw error and the contributing source names. Pass `includeValuesInErrors: true` to also receive the merged input in the context.
