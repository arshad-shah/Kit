/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
	$schema: "https://json.schemastore.org/stryker-config.json",
	packageManager: "pnpm",
	reporters: ["progress", "clear-text", "html"],
	testRunner: "vitest",
	checkers: ["typescript"],
	tsconfigFile: "tsconfig.json",
	mutate: [
		"src/**/*.ts",
		"src/**/*.tsx",
		"!src/**/*.test.ts",
		"!src/**/*.test.tsx",
		"!src/**/index.ts",
		"!src/**/types.ts",
	],
	thresholds: { high: 85, low: 70, break: 70 },
	timeoutMS: 60_000,
	concurrency: 4,
	htmlReporter: { fileName: "reports/mutation/index.html" },
};
