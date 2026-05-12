// @ts-check
/**
 * Generate API reference markdown from JSDoc using TypeDoc.
 *
 * Output goes to src/content/docs/<package>/api/, which Starlight picks up
 * automatically via the autogenerate directive in astro.config.mjs.
 *
 * Two transforms run after TypeDoc finishes:
 *
 *  1. Slug-collision rename. typedoc-plugin-markdown names a module after its
 *     entry file's basename, so `src/index.ts` becomes module "index" and
 *     emits its content at `api/index/index.md`. That collides with the
 *     package-root `api/index.md`, and Astro silently routes only one of them.
 *     Rename `api/index/` → `api/main/` to break the collision.
 *
 *  2. Absolute-URL link rewriting. Astro builds slugged URLs with a trailing
 *     slash, so file-relative `.md` links (typedoc's default output) break at
 *     the URL layer: from `/classes/networkerror/`, the link `fetchkiterror/`
 *     resolves to `/classes/networkerror/fetchkiterror/` instead of the
 *     intended sibling `/classes/fetchkiterror/`. Resolve every relative `.md`
 *     link against the file's URL slug-dir using POSIX semantics, then emit
 *     the absolute URL. This is the only transform that survives Starlight's
 *     trailing-slash slugging.
 *
 * Astro's built-in relative-md rewriter does not run on this content (the
 * filename casing typedoc emits doesn't match the lowercased slugs Starlight
 * uses), so we do the rewriting ourselves.
 */
import { existsSync, rmSync } from "node:fs";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, posix, resolve } from "node:path";
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
	if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
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
		// Emit module entry pages as `index.md` (default is `README.md`); README
		// would slug to `/readme/` rather than the directory's root URL.
		entryFileName: "index.md",
	});
	app.options.addReader(new TSConfigReader());

	const project = await app.convert();
	if (!project) {
		console.error(`[gen-api] TypeDoc failed for ${pkg.name}`);
		process.exit(1);
	}
	await app.generateOutputs(project);

	// (1) Break the slug collision before any link rewriting, so URL emission
	// in step (2) sees the renamed path.
	const renamedIndexModule = existsSync(join(outDir, "index"));
	if (renamedIndexModule) {
		await rename(join(outDir, "index"), join(outDir, "main"));
	}

	const apiSlugRoot = `/${pkg.name}/api`;

	// (2) Walk every generated .md file: rewrite links + add frontmatter.
	async function processRecursive(dir) {
		for (const entry of await readdir(dir)) {
			const full = join(dir, entry);
			const stats = await stat(full);
			if (stats.isDirectory()) {
				await processRecursive(full);
				continue;
			}
			if (!entry.endsWith(".md")) continue;
			let content = await readFile(full, "utf-8");

			// URL slug-dir of the current file:
			//   <outDir>/main/classes/NetworkError.md  →  /<pkg>/api/main/classes/
			const fsRel = posix.normalize(full.replace(outDir, "").replace(/\\/g, "/"));
			const fileDirSlug = `${apiSlugRoot}${posix.dirname(fsRel)}/`
				.replace(/\/+/g, "/")
				.toLowerCase();

			// Match relative `.md` links only. Absolute URLs (`/...`, `https://...`)
			// and anchor-only links (`#section`) skip naturally.
			content = content.replace(
				/\]\(((?!https?:|\/)[^)\s]+?)\.md(#[^)]*)?\)/g,
				(_, linkPath, fragment = "") => {
					// Resolve the file-relative path to an absolute slug URL.
					let abs = posix.resolve(fileDirSlug, linkPath).toLowerCase();
					// Redirect old `index` module references to `main` (only when we
					// actually performed the rename above).
					if (renamedIndexModule) {
						abs = abs.replace(new RegExp(`^${apiSlugRoot}/index(/|$)`), `${apiSlugRoot}/main$1`);
					}
					// Trailing `/index` collapses to the directory's root URL.
					abs = abs.replace(/\/index$/, "");
					if (!abs.endsWith("/")) abs += "/";
					return `](${abs}${fragment})`;
				},
			);

			// Prepend frontmatter if missing.
			if (!content.startsWith("---")) {
				const baseName = entry.replace(/\.md$/, "");
				let title = baseName;
				if (baseName === "index") {
					title = dir === outDir ? `${pkg.name} API` : (dir.split(/[/\\]/).pop() ?? "index");
				}
				content = `---\ntitle: "${title}"\n---\n\n${content}`;
			}

			await writeFile(full, content);
		}
	}
	await processRecursive(outDir);

	// In the package-root listing the `[index]` label no longer matches the URL
	// (now `/<pkg>/api/main/`). Rename the label so the modules list reads
	// cleanly. Only the package-root file has this; nested files reference the
	// renamed module by absolute URL alone.
	if (renamedIndexModule) {
		const rootIndexPath = join(outDir, "index.md");
		if (existsSync(rootIndexPath)) {
			let c = await readFile(rootIndexPath, "utf-8");
			const target = `${apiSlugRoot}/main/`;
			c = c.replace(
				new RegExp(`\\[index\\]\\(${target.replace(/[/\\]/g, "\\$&")}\\)`, "g"),
				`[main](${target})`,
			);
			await writeFile(rootIndexPath, c);
		}
	}

	console.log(`[gen-api] ✓ ${pkg.name}`);
}

console.log("[gen-api] done");
