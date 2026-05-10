import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "./load-config.js";
import { dotenvFileSource, processEnvSource, remoteSource, staticSource } from "./sources.js";
import type { Schema } from "./types.js";

vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
}));

const stringSchema: Schema<{ NAME: string }> = {
	parse: (input) => {
		const obj = input as { NAME?: unknown };
		if (typeof obj.NAME !== "string") throw new Error("NAME is required");
		return { NAME: obj.NAME };
	},
};

describe("staticSource", () => {
	it("returns the static values", async () => {
		const source = staticSource({ FOO: "bar" });
		const values = await source.load();
		expect(values).toEqual({ FOO: "bar" });
	});

	it("returns a copy, not the original reference", async () => {
		const original = { FOO: "bar" };
		const source = staticSource(original);
		const values = await source.load();
		(values as Record<string, string>).MUTATED = "yes";
		expect(original).toEqual({ FOO: "bar" });
	});
});

describe("processEnvSource", () => {
	it("reads from process.env", async () => {
		const old = process.env.KIT_TEST_VAR;
		process.env.KIT_TEST_VAR = "loaded";
		try {
			const source = processEnvSource();
			const values = await source.load();
			expect(values.KIT_TEST_VAR).toBe("loaded");
		} finally {
			if (old === undefined) process.env.KIT_TEST_VAR = undefined;
			else process.env.KIT_TEST_VAR = old;
		}
	});
});

describe("remoteSource", () => {
	it("fetches and returns flat string values", async () => {
		const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ A: "1", B: "2" })));
		const source = remoteSource({ url: "https://x", fetch: fetchSpy });
		const values = await source.load();
		expect(values).toEqual({ A: "1", B: "2" });
	});

	it("filters out non-string values", async () => {
		const fetchSpy = vi.fn(
			async () => new Response(JSON.stringify({ A: "ok", B: 123, C: null, D: { nested: "x" } })),
		);
		const source = remoteSource({ url: "https://x", fetch: fetchSpy });
		const values = await source.load();
		expect(values).toEqual({ A: "ok" });
	});

	it("returns empty object on non-2xx", async () => {
		const fetchSpy = vi.fn(async () => new Response("error", { status: 500 }));
		const source = remoteSource({ url: "https://x", fetch: fetchSpy });
		expect(await source.load()).toEqual({});
	});

	it("returns empty object on network error", async () => {
		const fetchSpy = vi.fn(async () => {
			throw new Error("offline");
		});
		const source = remoteSource({ url: "https://x", fetch: fetchSpy });
		expect(await source.load()).toEqual({});
	});

	it("includes custom headers", async () => {
		const fetchSpy = vi.fn(async () => new Response(JSON.stringify({})));
		const source = remoteSource({
			url: "https://x",
			headers: { authorization: "Bearer t" },
			fetch: fetchSpy,
		});
		await source.load();
		const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
		expect((init.headers as Record<string, string>).authorization).toBe("Bearer t");
	});
});

describe("dotenvFileSource", () => {
	it("reads and parses a .env file", async () => {
		const { readFile } = await import("node:fs/promises");
		vi.mocked(readFile).mockResolvedValueOnce("FOO=bar\nBAZ=qux" as unknown as Buffer);

		const source = dotenvFileSource(".env");
		const values = await source.load();
		expect(values).toEqual({ FOO: "bar", BAZ: "qux" });
	});

	it("returns empty object when the file is missing", async () => {
		const { readFile } = await import("node:fs/promises");
		vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT"));

		const source = dotenvFileSource(".env.missing");
		expect(await source.load()).toEqual({});
	});

	it("uses the source name based on path", () => {
		const source = dotenvFileSource(".env.local");
		expect(source.name).toBe("dotenv:.env.local");
	});
});

describe("loadConfig", () => {
	it("validates against the schema and returns typed config", async () => {
		const config = await loadConfig({
			schema: stringSchema,
			sources: [staticSource({ NAME: "kit" })],
		});
		expect(config).toEqual({ NAME: "kit" });
	});

	it("merges sources in order, last wins", async () => {
		const config = await loadConfig({
			schema: stringSchema,
			sources: [staticSource({ NAME: "first" }), staticSource({ NAME: "second" })],
		});
		expect(config.NAME).toBe("second");
	});

	it("undefined values do not override defined ones", async () => {
		const config = await loadConfig({
			schema: stringSchema,
			sources: [staticSource({ NAME: "kept" }), staticSource({ NAME: undefined })],
		});
		expect(config.NAME).toBe("kept");
	});

	it("throws when sources is empty", async () => {
		await expect(loadConfig({ schema: stringSchema, sources: [] })).rejects.toThrow(
			/at least one source/,
		);
	});

	it("redacts quoted values in error messages by default", async () => {
		const schema: Schema<unknown> = {
			parse: () => {
				throw new Error('Validation failed for "supersecret123"');
			},
		};
		await expect(loadConfig({ schema, sources: [staticSource({ A: "1" })] })).rejects.toThrow(
			/<redacted>/,
		);
	});

	it("includes raw values when includeValuesInErrors is true", async () => {
		const schema: Schema<unknown> = {
			parse: () => {
				throw new Error('Validation failed for "supersecret123"');
			},
		};
		await expect(
			loadConfig({
				schema,
				sources: [staticSource({ A: "1" })],
				includeValuesInErrors: true,
			}),
		).rejects.toThrow(/supersecret123/);
	});

	it("a failing source does not abort the load", async () => {
		const config = await loadConfig({
			schema: stringSchema,
			sources: [
				{
					name: "broken",
					load: async () => {
						throw new Error("disk on fire");
					},
				},
				staticSource({ NAME: "fallback" }),
			],
		});
		expect(config.NAME).toBe("fallback");
	});

	it("invokes logger.info on each source load", async () => {
		const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
		await loadConfig({
			schema: stringSchema,
			sources: [staticSource({ NAME: "kit" })],
			logger,
		});
		expect(logger.info).toHaveBeenCalled();
	});

	it("invokes logger.warn when a source fails", async () => {
		const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
		await loadConfig({
			schema: stringSchema,
			sources: [
				{
					name: "broken",
					load: () => {
						throw new Error("nope");
					},
				},
				staticSource({ NAME: "kit" }),
			],
			logger,
		});
		expect(logger.warn).toHaveBeenCalled();
	});
});
