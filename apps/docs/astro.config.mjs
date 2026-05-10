import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
	site: "https://kit.arshadshah.com",
	integrations: [
		starlight({
			title: "kit",
			description: "Foundation packages for side projects: state and data fetching.",
			logo: { src: "./src/assets/logo.svg", replacesTitle: true },
			social: {
				github: "https://github.com/arshad-shah/kit",
			},
			customCss: ["./src/styles/terminal.css"],
			editLink: {
				baseUrl: "https://github.com/arshad-shah/kit/edit/master/apps/docs/",
			},
			lastUpdated: true,
			pagination: true,
			head: [
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
						{ label: "API reference", autogenerate: { directory: "store-kit/api" } },
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
						{ label: "API reference", autogenerate: { directory: "fetch-kit/api" } },
					],
				},
				{
					label: "log-kit",
					items: [
						{ label: "Overview", slug: "log-kit/overview" },
						{ label: "Transports", slug: "log-kit/transports" },
						{ label: "Performance markers", slug: "log-kit/perf-markers" },
						{ label: "API reference", autogenerate: { directory: "log-kit/api" } },
					],
				},
				{
					label: "config-kit",
					items: [
						{ label: "Overview", slug: "config-kit/overview" },
						{ label: "Sources", slug: "config-kit/sources" },
						{ label: "Schema patterns", slug: "config-kit/schema-patterns" },
						{ label: "API reference", autogenerate: { directory: "config-kit/api" } },
					],
				},
				{
					label: "Operations",
					items: [
						{ label: "Bundle size", slug: "ops/bundle-size" },
						{ label: "Security", slug: "ops/security" },
						{ label: "Releases", slug: "ops/releases" },
					],
				},
			],
		}),
	],
});
