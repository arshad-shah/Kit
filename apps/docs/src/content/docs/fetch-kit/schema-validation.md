---
title: Schema validation
description: Validate response bodies with Zod, Valibot, ArkType, or any compatible parser.
---

`fetch-kit` accepts any object with a `parse(input) → output` method. That covers Zod, Valibot, ArkType, and most other validation libraries without bringing one as a dependency.

## With Zod

```ts
import { z } from "zod";

const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  createdAt: z.string().datetime(),
});

const user = await api.get("/users/me", { schema: UserSchema });
// user is z.infer<typeof UserSchema> - fully typed
```

If the server sends back a payload that doesn't match, the request throws a `ValidationError`. The error's `issues` field holds Zod's issue list:

```ts
try {
  await api.get("/users/me", { schema: UserSchema });
} catch (err) {
  if (err instanceof ValidationError) {
    console.error(err.issues); // ZodError contents
  }
}
```

## With Valibot

```ts
import * as v from "valibot";

const UserSchema = v.object({
  id: v.string(),
  email: v.pipe(v.string(), v.email()),
});

const ParseAdapter = {
  parse: (input: unknown) => v.parse(UserSchema, input),
};

const user = await api.get("/users/me", { schema: ParseAdapter });
```

Any library exposing a synchronous `parse` works.

## Why validate?

Two reasons. First, types from generated API clients (OpenAPI, GraphQL codegen) describe what the server *says* it returns; validation describes what it *actually* returned. They diverge more often than you'd think.

Second, runtime validation gives you a clean failure mode at the boundary instead of a `Cannot read property 'x' of undefined` deep in your render tree.

## Cost

Schema validation runs once per response. For typical small payloads it's negligible. For 1MB+ responses, profile before assuming the validator is fast.
