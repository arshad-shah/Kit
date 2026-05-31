---
"@arshad-shah/config-kit": minor
---

Add support for module-based config (nested objects, arrays, functions), not just flat env maps.

- **Structured sources** (`StructuredSource`): a source whose `load()` returns an arbitrary nested object. config-kit skips string-coercion and value-redaction for these and deep-merges them.
- **`configFileSource({ name })`**: a built-in source that discovers, imports, and returns the default export of a `*.config.{ts,js,mjs,cjs,json}` file. Walks up from `cwd`, first match wins, missing file is soft. Accepts a custom `load` so you can compile TS/ESM on the fly (esbuild/jiti) without config-kit depending on a compiler.
- **`objectSource(values)`**: the structured counterpart to `staticSource` — a nested defaults layer that participates in the deep merge.
- **Deep merge** for structured sources: plain objects merge recursively, arrays and primitives replace wholesale. Exported as `deepMerge` / `isPlainObject` for reuse.
- **`mode: "strict" | "warn"`**: strict (default) throws on validation failure; warn logs and returns the unvalidated merged input.
- **`onValidationError(error, context)`**: inspect the raw validation error (e.g. a `ZodError`) and optionally return a custom `Error` to throw/log — useful for rendering config-file paths and skipping secret-redaction for public config files.

Fully backwards compatible: flat sources, default strict throwing, and secret redaction are unchanged.
