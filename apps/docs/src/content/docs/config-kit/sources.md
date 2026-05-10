---
title: Sources
description: Built-in sources and how to write your own.
---

A source is anything implementing `{ name, load }`. `load()` returns a flat `Record<string, string | undefined>`, sync or async. Sources run in parallel; merging happens in array order, with later sources overriding earlier ones.

## Built-in sources

### `processEnvSource()`

Reads `process.env`. Server-side only - in browsers `process.env` is mostly empty after bundling.

```ts
processEnvSource()
```

### `dotenvFileSource(path)`

Reads and parses a `.env` file. Missing files resolve to `{}` so layered configs work cleanly:

```ts
sources: [
  dotenvFileSource(".env"),
  dotenvFileSource(".env.local"),  // optional, may not exist
  processEnvSource(),
]
```

The parser supports the common dotenv subset: `KEY=value`, single and double quotes, escape sequences in double quotes, comments, blank lines. It does **not** support variable interpolation (`${VAR}`) or shell substitution. Keep `.env` files boring.

### `staticSource(values)`

Hard-coded defaults. Useful as the first entry in a chain:

```ts
sources: [
  staticSource({
    NODE_ENV: "development",
    PORT: "3000",
  }),
  processEnvSource(),
]
```

Schema defaults usually do this better - put defaults in the schema where they're typed.

### `remoteSource({ url, headers, timeoutMs })`

Fetches a JSON object from an HTTP endpoint. The endpoint must return a flat `Record<string, string>` - non-string values are filtered out:

```ts
remoteSource({
  url: "https://config.internal/app",
  headers: { authorization: `Bearer ${token}` },
  timeoutMs: 5000,
})
```

Network failures resolve to `{}`. If a remote-only key is required, the schema's validation will catch the missing value.

## Source ordering

Order matters. Common patterns:

```ts
// Simple: file then env
[dotenvFileSource(".env"), processEnvSource()]

// Local override: tracked file, gitignored override, env wins
[dotenvFileSource(".env"), dotenvFileSource(".env.local"), processEnvSource()]

// Remote secrets: defaults, file, env, then remote secrets last
[
  staticSource(defaults),
  dotenvFileSource(".env"),
  processEnvSource(),
  remoteSource({ url: SECRET_MANAGER_URL }),
]
```

## Custom sources

Implement the interface:

```ts
import type { ConfigSource } from "@arshad-shah/config-kit";

const awsSecretsSource = (region: string): ConfigSource => ({
  name: `aws-secrets:${region}`,
  load: async () => {
    const client = new SecretsManagerClient({ region });
    const response = await client.send(new GetSecretValueCommand({ SecretId: "app" }));
    return JSON.parse(response.SecretString ?? "{}");
  },
});

await loadConfig({
  schema,
  sources: [processEnvSource(), awsSecretsSource("eu-west-1")],
});
```

Throwing in `load()` is safe - the loader catches and logs the error if you passed a logger, then continues with `{}` for that source.
