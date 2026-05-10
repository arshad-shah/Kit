import type { ViteUserConfig } from "vitest/config";

export type VitestPresetOptions = {
	/** Test environment - defaults to 'node'. Use 'jsdom' for React/DOM tests. */
	environment?: "node" | "jsdom" | "happy-dom";
	/** Coverage threshold for lines/functions/statements (0-100). Defaults to 95. */
	coverageThreshold?: number;
	/** Coverage threshold for branches (0-100). Defaults to 90 to accommodate defensive code paths. */
	branchThreshold?: number;
	/** Setup files to run before tests. */
	setupFiles?: string[];
};

/**
 * Shared Vitest preset for all packages.
 *
 * Enforces:
 * - 95% coverage threshold by default (lines, branches, functions, statements)
 * - Strict isolation between tests
 * - V8 coverage provider for accuracy
 * - Predictable, deterministic test execution
 *
 * @example
 * ```ts
 * import { defineVitestPreset } from "@arshad-shah/internal-config/vitest.preset";
 *
 * export default defineVitestPreset({ environment: "jsdom" });
 * ```
 */
export function defineVitestPreset(options: VitestPresetOptions = {}): ViteUserConfig {
	const {
		environment = "node",
		coverageThreshold = 95,
		branchThreshold = 90,
		setupFiles = [],
	} = options;

	return {
		test: {
			environment,
			globals: false,
			isolate: true,
			pool: "forks",
			setupFiles,
			coverage: {
				provider: "v8",
				reporter: ["text", "json", "html", "lcov"],
				include: ["src/**/*.ts", "src/**/*.tsx"],
				exclude: [
					"src/**/*.test.ts",
					"src/**/*.test.tsx",
					"src/**/*.bench.ts",
					"src/**/index.ts",
					"src/**/types.ts",
				],
				thresholds: {
					lines: coverageThreshold,
					branches: branchThreshold,
					functions: coverageThreshold,
					statements: coverageThreshold,
				},
			},
		},
	};
}
