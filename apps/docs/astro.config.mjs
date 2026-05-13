import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
	site: "https://kit.arshadshah.com",
	integrations: [
		starlight({
			title: "kit",
			description:
				"Foundation packages for side projects: state, data fetching, logging, and configuration.",
			logo: {
				light: "./src/assets/logo-light.svg",
				dark: "./src/assets/logo-dark.svg",
				// replacesTitle: true,
			},
			social: [
				{
					icon: "github",
					label: "GitHub",
					href: "https://github.com/arshad-shah/kit",
				},
			],
			customCss: ["./src/styles/terminal.css"],
			editLink: {
				baseUrl: "https://github.com/arshad-shah/kit/edit/master/apps/docs/",
			},
			lastUpdated: true,
			pagination: true,
			head: [
				// Mobile browser chrome — split by OS preference (theme-color can't read Starlight's localStorage toggle).
				{
					tag: "meta",
					attrs: {
						name: "theme-color",
						content: "#0d0f14",
						media: "(prefers-color-scheme: dark)",
					},
				},
				{
					tag: "meta",
					attrs: {
						name: "theme-color",
						content: "#ffffff",
						media: "(prefers-color-scheme: light)",
					},
				},
				// Favicon: SVG with internal prefers-color-scheme styling.
				{
					tag: "link",
					attrs: { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
				},
				// iOS Home Screen.
				{
					tag: "link",
					attrs: { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
				},
				// Open Graph image (Facebook, LinkedIn, Discord, Slack, etc.).
				{
					tag: "meta",
					attrs: {
						property: "og:image",
						content: "https://kit.arshadshah.com/og-image.png",
					},
				},
				{ tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
				{ tag: "meta", attrs: { property: "og:image:height", content: "630" } },
				{ tag: "meta", attrs: { property: "og:image:type", content: "image/png" } },
				// Twitter / X card.
				{ tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
				{
					tag: "meta",
					attrs: {
						name: "twitter:image",
						content: "https://kit.arshadshah.com/og-image.png",
					},
				},
			],
			sidebar: [
				{
					label: "Start here",
					items: [
						{ label: "Introduction", slug: "intro" },
						{ label: "Why kit", slug: "why" },
						{ label: "Quick start", slug: "quick-start" },
					],
				},
				{
					label: "store-kit",
					items: [
						{ label: "Overview", slug: "store-kit/overview" },
						{ label: "Persistence", slug: "store-kit/persistence" },
						{ label: "Migrations", slug: "store-kit/migrations" },
						{ label: "Recipes", slug: "store-kit/recipes" },
						{
							label: "API reference",
							items: [{ autogenerate: { directory: "store-kit/api" } }],
						},
					],
				},
				{
					label: "fetch-kit",
					items: [
						{ label: "Overview", slug: "fetch-kit/overview" },
						{ label: "Errors", slug: "fetch-kit/errors" },
						{ label: "Retries", slug: "fetch-kit/retries" },
						{ label: "Schema validation", slug: "fetch-kit/schema-validation" },
						{ label: "React hooks", slug: "fetch-kit/react-hooks" },
						{
							label: "API reference",
							items: [{ autogenerate: { directory: "fetch-kit/api" } }],
						},
					],
				},
				{
					label: "log-kit",
					items: [
						{ label: "Overview", slug: "log-kit/overview" },
						{ label: "Transports", slug: "log-kit/transports" },
						{ label: "Performance markers", slug: "log-kit/perf-markers" },
						{
							label: "API reference",
							items: [{ autogenerate: { directory: "log-kit/api" } }],
						},
					],
				},
				{
					label: "config-kit",
					items: [
						{ label: "Overview", slug: "config-kit/overview" },
						{ label: "Sources", slug: "config-kit/sources" },
						{ label: "Schema patterns", slug: "config-kit/schema-patterns" },
						{
							label: "API reference",
							items: [{ autogenerate: { directory: "config-kit/api" } }],
						},
					],
				},
				{
					label: "Operations",
					items: [
						{ label: "Bundle size", slug: "ops/bundle-size" },
					],
				},
			],
		}),
	],
});
