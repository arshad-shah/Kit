// @ts-check
/**
 * Render brand SVG sources to PNG raster outputs.
 *
 * Sources live in src/brand/*.svg; outputs go to public/*.png so Astro
 * serves them at the site root. Apple Touch Icon and OG image both
 * require PNG (iOS strips alpha from SVG; most social platforms reject SVG OG).
 *
 * Run via `pnpm gen:brand`. Chained into the build script so deploys
 * always pick up the latest SVG sources.
 */
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const docsRoot = resolve(__dirname, "..");

const targets = [
	{
		src: resolve(docsRoot, "src/brand/apple-touch-icon.svg"),
		out: resolve(docsRoot, "public/apple-touch-icon.png"),
		width: 180,
		height: 180,
	},
	{
		src: resolve(docsRoot, "src/brand/og-image.svg"),
		out: resolve(docsRoot, "public/og-image.png"),
		width: 1200,
		height: 630,
	},
];

for (const { src, out, width, height } of targets) {
	await mkdir(dirname(out), { recursive: true });
	const svg = await readFile(src);
	// density 192 oversamples the SVG before sharp resizes; gives a crisper
	// raster than the default 72dpi rasterization of typical favicon SVGs.
	await sharp(svg, { density: 192 })
		.resize(width, height, { fit: "contain", background: { r: 14, g: 21, b: 18, alpha: 1 } })
		.png({ compressionLevel: 9 })
		.toFile(out);
	console.log(`generated ${out.replace(docsRoot, ".")}`);
}
