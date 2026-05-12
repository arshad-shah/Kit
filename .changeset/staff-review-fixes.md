---
"@arshad-shah/log-kit": minor
"@arshad-shah/store-kit": minor
"@arshad-shah/config-kit": minor
---

Six bug fixes from a staff review, three new diagnostic channels, and doc accuracy pass.

### log-kit

- **Fix file transport concurrent-write corruption.** `appendFile` calls were unguarded; with the default `batchSize: 1` two records arriving in the same tick could interleave on disk past `PIPE_BUF` (~4 KB on Linux), yielding garbled JSON Lines. Appends are now serialized through an in-process queue — strict FIFO, never interleaved.
- **Fix `logger.flush()` silently lying about success.** It used `Promise.allSettled` and resolved as `void`, so a caller had no way to tell that every transport had failed. `flush()` now returns `TransportStatus[]` — one entry per transport — so serverless shutdown hooks can check `results.some(r => !r.ok)`.
- **Capture error `cause` chains and Node-style `code`.** `serializeError` only kept `name`/`message`/`stack`; the `cause` chain (TC39 standard) and Node's `code` were dropped. Both are now captured (cause is recursive with a depth cap of 3).
- **Datadog transport: `host` actually defaults to `os.hostname()` on Node.** The docs claimed it did; the implementation didn't. It now uses `os.hostname()` via `createRequire`, falling back to `HOSTNAME` / `COMPUTERNAME` env vars, then `null`. Pass `hostname: null` to opt out.
- **Datadog transport: map `level` to Datadog's canonical `status` field.** Datadog expects `status: "info"|"warn"|"error"|"debug"` for severity-based filtering. log-kit's `fatal` collapses to `error` since Datadog has no higher severity.
- **DRY**: HTTP transport now reuses `LEVEL_ORDER` from `types` instead of duplicating it.
- **New: `LoggerConfig.onTransportError`** — diagnostic channel called when a transport `write` or `flush` throws/rejects. Inherited by child loggers. Failures are still swallowed so logging keeps working — this hook is purely for dev observability.
- **New: per-transport `onError` hooks** on file, HTTP, and Datadog transports. Same `(err, { op, url|path })` shape.

### config-kit

- **`dotenvFileSource` no longer masks every error as "missing file".** Previously `EACCES` (permission denied), `EISDIR` ("is a directory"), `EBUSY`, and parse errors all silently returned `{}`, leading to cryptic "DATABASE_URL is required" failures when the real cause was a permission bug. Only `ENOENT` is now soft-handled; everything else surfaces via `onSourceError` / the logger.
- **`remoteSource` coerces JSON primitives to strings.** Previously `{ PORT: 3000 }` from a secret manager turned into `{}` because only string values were kept. Numbers and booleans now coerce to strings (`"3000"`, `"true"`) so downstream `z.coerce.*` schemas see them. Complex values (objects, arrays, `null`) are still dropped — they don't have an unambiguous string representation.
- **New: `LoadConfigOptions.onSourceError`** — diagnostic hook fired when a source's `load()` throws. Failure is still soft-handled (the source is treated as empty), but the hook lets you see why.

### store-kit

- **`destroy()` now actually unsubscribes the persistence listener.** Previously it removed the store from the global registry but the zustand subscription (and its closure over the storage handle, partialize function, etc.) was forever — a real leak for SSR-per-request stores and tests. The unsubscribe function is now captured at construction and called on `destroy()`.
- **`reset()` no longer races itself.** The persistence subscription used to fire synchronously on the reset `setState` write, then `removeItem` ran async, racing the just-written initial-state envelope. Reset now detaches the subscription around the clear and re-attaches afterward.
- **New: `CreateStoreConfig.onError`** — diagnostic hook fired when hydration parsing, persistence writes, or reset cleanup fail. Failures are still swallowed (losing persistence is preferable to crashing) but you get to see them.
- **`isDevelopment()` memoized.** Was called once per construction; now resolved once at module load.

### Docs

All three READMEs updated to reflect the new diagnostic channels, the truthful Datadog defaults, the dotenv error-handling contract, the remote coercion behavior, the shallow-freeze caveat in store-kit, and the truthful flush return type in log-kit.

### Build

- `internal-config`'s tsup preset now externalizes `node:` specifiers so transports that legitimately need Node built-ins (Datadog uses `node:os` via `node:module`) don't blow up at build/measure time.
