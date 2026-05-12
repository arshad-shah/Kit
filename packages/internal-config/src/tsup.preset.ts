import type { Options } from "tsup";

/**
 * Shared tsup configuration preset for all publishable packages.
 *
 * Produces:
 * - ESM (.mjs) and CJS (.cjs) bundles
 * - Bundled .d.ts type declarations
 * - Source maps for debugging
 * - Tree-shakeable output via subpath exports
 *
 * @param entry - Map of entry point names to source file paths
 * @returns Complete tsup Options object
 *
 * @example
 * ```ts
 * import { definePackagePreset } from "@arshad-shah/internal-config/tsup.preset";
 *
 * export default definePackagePreset({
 *   index: "src/index.ts",
 *   react: "src/react/index.ts",
 * });
 * ```
 */
export function definePackagePreset(entry: Record<string, string>): Options {
	return {
		entry,
		format: ["esm", "cjs"],
		dts: true,
		sourcemap: true,
		clean: true,
		treeshake: true,
		splitting: false,
		minify: false,
		target: "es2022",
		platform: "neutral",
		// Keep `node:` specifiers intact: at runtime Node resolves them
		// natively, browsers tree-shake them out via the `sideEffects: false`
		// hints. Without this, tsup tries to bundle "node:os" / "node:module"
		// for the neutral platform and fails.
		external: [/^node:/],
		outExtension: ({ format }) => ({
			js: format === "cjs" ? ".cjs" : ".mjs",
		}),
	};
}
