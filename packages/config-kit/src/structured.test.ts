import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "./load-config.js";
import { configFileSource, objectSource } from "./sources.js";
import type { Schema } from "./types.js";

// Identity schema: structured tests care about merge/load behaviour, not coercion.
const passthrough: Schema<Record<string, unknown>> = {
	parse: (input) => input as Record<string, unknown>,
};

describe("objectSource", () => {
	it("is marked structured and returns the object", async () => {
		const source = objectSource({ dev: { port: 3000 } });
		expect(source.structured).toBe(true);
		expect(await source.load()).toEqual({ dev: { port: 3000 } });
	});

	it("uses a custom name when provided", () => {
		expect(objectSource({}, "defaults").name).toBe("defaults");
		expect(objectSource({}).name).toBe("object");
	});

	it("shallow-copies so callers cannot mutate the defaults", async () => {
		const original = { a: 1 };
		const source = objectSource(original);
		const loaded = (await source.load()) as Record<string, unknown>;
		loaded.b = 2;
		expect(original).toEqual({ a: 1 });
	});
});

describe("loadConfig with structured sources", () => {
	it("deep-merges objectSource defaults under a structured override", async () => {
		const config = await loadConfig({
			schema: passthrough,
			sources: [
				objectSource({ dev: { port: 3000, host: "localhost" }, build: { minify: true } }),
				{
					name: "user",
					structured: true,
					load: () => ({ dev: { port: 4000 }, plugins: [() => "p"] }),
				},
			],
		});
		expect(config.dev).toEqual({ port: 4000, host: "localhost" });
		expect(config.build).toEqual({ minify: true });
		expect(Array.isArray(config.plugins)).toBe(true);
	});

	it("does not coerce structured values to strings", async () => {
		const config = await loadConfig({
			schema: passthrough,
			sources: [objectSource({ port: 3000, enabled: true, tags: ["a", "b"] })],
		});
		expect(config).toEqual({ port: 3000, enabled: true, tags: ["a", "b"] });
	});

	it("treats null/undefined structured results as empty (defaults win)", async () => {
		const config = await loadConfig({
			schema: passthrough,
			sources: [
				objectSource({ a: 1 }),
				{ name: "empty", structured: true, load: () => null },
				{ name: "empty2", structured: true, load: () => undefined },
			],
		});
		expect(config).toEqual({ a: 1 });
	});

	it("throws a clear error when a structured source returns a non-object", async () => {
		await expect(
			loadConfig({
				schema: passthrough,
				sources: [{ name: "bad", structured: true, load: () => [1, 2, 3] }],
			}),
		).rejects.toThrow(/Structured source "bad" must resolve to an object.*got an array/);
	});

	it("mixes flat and structured sources", async () => {
		const config = await loadConfig({
			schema: passthrough,
			sources: [
				objectSource({ dev: { port: 3000 } }),
				{ name: "env", load: () => ({ NODE_ENV: "production" }) },
			],
		});
		expect(config).toEqual({ dev: { port: 3000 }, NODE_ENV: "production" });
	});
});

describe("loadConfig validation modes", () => {
	const failing: Schema<unknown> = {
		parse: () => {
			throw new Error('Invalid config: "value-here"');
		},
	};

	it("strict mode (default) throws", async () => {
		await expect(
			loadConfig({ schema: failing, sources: [objectSource({ a: 1 })] }),
		).rejects.toThrow();
	});

	it("warn mode logs and returns the unvalidated merged input", async () => {
		const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
		const result = await loadConfig({
			schema: failing,
			sources: [objectSource({ a: 1, dev: { port: 3000 } })],
			mode: "warn",
			logger,
		});
		expect(result).toEqual({ a: 1, dev: { port: 3000 } });
		expect(logger.warn).toHaveBeenCalled();
	});

	it("onValidationError can supply a custom Error that is thrown in strict mode", async () => {
		const onValidationError = vi.fn(() => new Error("custom formatted message"));
		await expect(
			loadConfig({ schema: failing, sources: [objectSource({ a: 1 })], onValidationError }),
		).rejects.toThrow("custom formatted message");
		expect(onValidationError).toHaveBeenCalledOnce();
	});

	it("onValidationError receives the raw error and source names", async () => {
		const raw = new Error("boom");
		const throwing: Schema<unknown> = {
			parse: () => {
				throw raw;
			},
		};
		const onValidationError = vi.fn(() => undefined);
		await expect(
			loadConfig({
				schema: throwing,
				sources: [objectSource({}, "defaults"), configFileSource({ name: "app" })],
				onValidationError,
			}),
		).rejects.toThrow();
		const [err, ctx] = onValidationError.mock.calls[0] ?? [];
		expect(err).toBe(raw);
		expect(ctx).toMatchObject({ sources: ["defaults", "config-file:app"] });
		// merged omitted unless includeValuesInErrors
		expect((ctx as { merged?: unknown }).merged).toBeUndefined();
	});

	it("passes merged input to onValidationError when includeValuesInErrors is true", async () => {
		const onValidationError = vi.fn(() => undefined);
		await expect(
			loadConfig({
				schema: failing,
				sources: [objectSource({ a: 1 })],
				includeValuesInErrors: true,
				onValidationError,
			}),
		).rejects.toThrow();
		const ctx = onValidationError.mock.calls[0]?.[1];
		expect((ctx as { merged?: unknown }).merged).toEqual({ a: 1 });
	});

	it("does not redact structured values when the host opts out via onValidationError", async () => {
		// The default redacts quoted values; a host loading a public config file
		// can render the raw error instead.
		await expect(
			loadConfig({
				schema: failing,
				sources: [objectSource({ a: 1 })],
				onValidationError: (err) => (err instanceof Error ? err : new Error("?")),
			}),
		).rejects.toThrow(/value-here/);
	});
});

describe("configFileSource", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "config-kit-"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("loads a JSON config file's contents", async () => {
		await writeFile(
			join(dir, "app.config.json"),
			JSON.stringify({ port: 8080, dev: { hmr: true } }),
		);
		const config = await loadConfig({
			schema: passthrough,
			sources: [configFileSource({ name: "app", cwd: dir, searchParents: false })],
		});
		expect(config).toEqual({ port: 8080, dev: { hmr: true } });
	});

	it("loads an ESM module's default export", async () => {
		await writeFile(
			join(dir, "app.config.mjs"),
			"export default { name: 'esm', plugins: [() => 'p'] };",
		);
		const config = await loadConfig({
			schema: passthrough,
			sources: [configFileSource({ name: "app", cwd: dir, searchParents: false })],
		});
		expect(config.name).toBe("esm");
		expect(typeof (config.plugins as unknown[])[0]).toBe("function");
	});

	it("loads a CJS module's exports", async () => {
		await writeFile(join(dir, "app.config.cjs"), "module.exports = { name: 'cjs' };");
		const config = await loadConfig({
			schema: passthrough,
			sources: [configFileSource({ name: "app", cwd: dir, searchParents: false })],
		});
		expect(config.name).toBe("cjs");
	});

	it("first matching extension wins", async () => {
		await writeFile(join(dir, "app.config.json"), JSON.stringify({ from: "json" }));
		await writeFile(join(dir, "app.config.mjs"), "export default { from: 'mjs' };");
		// mjs precedes json in the default extension order
		const config = await loadConfig({
			schema: passthrough,
			sources: [configFileSource({ name: "app", cwd: dir, searchParents: false })],
		});
		expect(config.from).toBe("mjs");
	});

	it("walks up parent directories to find the config", async () => {
		await writeFile(join(dir, "app.config.json"), JSON.stringify({ found: "in-parent" }));
		const nested = join(dir, "a", "b");
		await import("node:fs/promises").then((fs) => fs.mkdir(nested, { recursive: true }));
		const config = await loadConfig({
			schema: passthrough,
			sources: [configFileSource({ name: "app", cwd: nested })],
		});
		expect(config.found).toBe("in-parent");
	});

	it("does not walk up when searchParents is false", async () => {
		await writeFile(join(dir, "app.config.json"), JSON.stringify({ found: true }));
		const nested = join(dir, "child");
		await import("node:fs/promises").then((fs) => fs.mkdir(nested, { recursive: true }));
		const source = configFileSource({ name: "app", cwd: nested, searchParents: false });
		expect(await source.load()).toEqual({});
	});

	it("is soft on a missing file so defaults apply", async () => {
		const config = await loadConfig({
			schema: passthrough,
			sources: [
				objectSource({ dev: { port: 3000 } }),
				configFileSource({ name: "missing", cwd: dir, searchParents: false }),
			],
		});
		expect(config).toEqual({ dev: { port: 3000 } });
	});

	it("uses a custom loader and unwraps its default export", async () => {
		const file = join(dir, "app.config.ts");
		await writeFile(file, "// pretend TypeScript");
		const load = vi.fn(async (p: string) => {
			expect(p).toBe(file);
			// Simulate a compiler returning a module namespace.
			return { default: { compiled: true, dev: { port: 1234 } } };
		});
		const config = await loadConfig({
			schema: passthrough,
			sources: [configFileSource({ name: "app", cwd: dir, searchParents: false, load })],
		});
		expect(config).toEqual({ compiled: true, dev: { port: 1234 } });
		expect(load).toHaveBeenCalledOnce();
	});

	it("names the source after the config base name", () => {
		expect(configFileSource({ name: "extforge" }).name).toBe("config-file:extforge");
	});
});
