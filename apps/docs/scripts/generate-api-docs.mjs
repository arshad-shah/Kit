// @ts-check
/**
 * Generate API reference markdown from JSDoc using TypeDoc.
 *
 * Output goes to src/content/docs/<package>/api/, which Starlight
 * picks up automatically via the autogenerate directive in astro.config.mjs.
 *
 * Each kit package gets its own generated directory; old output is wiped
 * before each run so deletions in source propagate cleanly.
 */
import { existsSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Application, TSConfigReader } from "typedoc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const docsRoot = resolve(__dirname, "..");
const contentRoot = join(docsRoot, "src/content/docs");

const PACKAGES = [
	{
		name: "store-kit",
		entryPoints: [join(repoRoot, "packages/store-kit/src/index.ts")],
		tsconfig: join(repoRoot, "packages/store-kit/tsconfig.json"),
	},
	{
		name: "fetch-kit",
		entryPoints: [
			join(repoRoot, "packages/fetch-kit/src/index.ts"),
			join(repoRoot, "packages/fetch-kit/src/react/index.ts"),
		],
		tsconfig: join(repoRoot, "packages/fetch-kit/tsconfig.json"),
	},
	{
		name: "log-kit",
		entryPoints: [join(repoRoot, "packages/log-kit/src/index.ts")],
		tsconfig: join(repoRoot, "packages/log-kit/tsconfig.json"),
	},
	{
		name: "config-kit",
		entryPoints: [join(repoRoot, "packages/config-kit/src/index.ts")],
		tsconfig: join(repoRoot, "packages/config-kit/tsconfig.json"),
	},
];

for (const pkg of PACKAGES) {
	if (!existsSync(pkg.tsconfig)) {
		console.warn(`[gen-api] Skipping ${pkg.name} - tsconfig not found`);
		continue;
	}

	const outDir = join(contentRoot, pkg.name, "api");

	if (existsSync(outDir)) {
		rmSync(outDir, { recursive: true, force: true });
	}
	await mkdir(outDir, { recursive: true });

	const app = await Application.bootstrapWithPlugins({
		entryPoints: pkg.entryPoints,
		tsconfig: pkg.tsconfig,
		plugin: ["typedoc-plugin-markdown"],
		out: outDir,
		readme: "none",
		hideBreadcrumbs: true,
		hidePageHeader: true,
		excludePrivate: true,
		excludeInternal: true,
		excludeExternals: true,
		gitRevision: "master",
	});
	app.options.addReader(new TSConfigReader());

	const project = await app.convert();
	if (!project) {
		console.error(`[gen-api] TypeDoc failed for ${pkg.name}`);
		process.exit(1);
	}

	await app.generateOutputs(project);

	// TypeDoc generates plain markdown; Starlight requires frontmatter with `title`.
	// Walk every generated .md file and prepend a frontmatter block based on filename.
	const { readFile, readdir, stat } = await import("node:fs/promises");
	async function addFrontmatterRecursive(dir) {
		for (const entry of await readdir(dir)) {
			const full = join(dir, entry);
			const stats = await stat(full);
			if (stats.isDirectory()) {
				await addFrontmatterRecursive(full);
				continue;
			}
			if (!entry.endsWith(".md")) continue;
			const content = await readFile(full, "utf-8");
			if (content.startsWith("---")) continue; // already has frontmatter
			const baseName = entry.replace(/\.md$/, "");
			const title = baseName === "README" ? `${pkg.name} API` : baseName;
			await writeFile(full, `---\ntitle: "${title}"\n---\n\n${content}`);
		}
	}
	await addFrontmatterRecursive(outDir);

	// Rename README.md to index.md so Starlight uses it as the section index.
	const readmePath = join(outDir, "README.md");
	if (existsSync(readmePath)) {
		const { rename } = await import("node:fs/promises");
		await rename(readmePath, join(outDir, "index.md"));
	}

	console.log(`[gen-api] ✓ ${pkg.name}`);
}

console.log("[gen-api] done");
