// Routes. The same app is the local preview (`flisk up`, `bun run dev`) and the static site: scripts/build.ts asks
// it for every page and writes the answers to files for GitHub Pages. Spaces are /@<handle>/<slug>/…, served from
// the folders the build gathered from their branches.
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { Hono } from "hono";
import { ASSETS } from "./assets.generated";
import {
	aboutPage,
	DEMO,
	handlePage,
	homePage,
	notFoundPage,
	spacesJson,
} from "./pages";
import {
	ICONS,
	llmsTxt,
	robotsTxt,
	securityTxt,
	sitemapXml,
	webManifest,
} from "./seo";
import { markdownPage, preparePage, type Space, spacePath } from "./spaces";

export interface AppOptions {
	/** The address people use, ending in a slash. Without it, each request's own address. */
	publicUrl?: string;
	/** The spaces to serve, from readSpaces(). */
	spaces?: Space[];
	/** The date sitemap.xml gives as lastmod for the site's own pages: when this build started. */
	builtAt?: Date;
}

/** The demo video and its poster and captions (see DEMO in pages.ts). */
export const STATIC = join(import.meta.dir, "..", "static");

export const TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".htm": "text/html; charset=utf-8",
	".md": "text/markdown; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".json": "application/json",
	".csv": "text/csv; charset=utf-8",
	".tsv": "text/tab-separated-values; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
	".xml": "application/xml",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".avif": "image/avif",
	".ico": "image/x-icon",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".mp3": "audio/mpeg",
	".mp4": "video/mp4",
	".webm": "video/webm",
	".pdf": "application/pdf",
};

/** The icons and the social card from assets.generated.ts, decoded once. tests/seo.test.ts fails on a missing one. */
function loadAssets(): Map<string, { body: Uint8Array; type: string }> {
	const files = new Map<string, { body: Uint8Array; type: string }>();
	for (const name of Object.values(ICONS)) {
		const asset = ASSETS[name];
		if (asset)
			files.set(name, {
				body: Buffer.from(asset.base64, "base64"),
				type: asset.type,
			});
	}
	return files;
}

/** Every handle with its spaces, in the order readSpaces() gave them (newest first). */
export function byHandle(spaces: Space[]): Map<string, Space[]> {
	const out = new Map<string, Space[]>();
	for (const s of spaces) out.set(s.handle, [...(out.get(s.handle) ?? []), s]);
	return out;
}

export function createApp(options: AppOptions = {}) {
	const served = options.spaces ?? [];
	// Shared pages open by their link but are never listed: not on a home page, a handle, spaces.json or the sitemap.
	const spaces = served.filter((s) => !s.unlisted);
	const handles = byHandle(spaces);
	const servedBy = byHandle(served);
	const lastmod = (options.builtAt ?? new Date()).toISOString().slice(0, 10);
	const files = loadAssets();
	const app = new Hono();

	const baseOf = (c: {
		req: { url: string; header: (name: string) => string | undefined };
	}) => {
		if (options.publicUrl) return options.publicUrl.replace(/\/$/, "");
		const prefix = c.req.header("x-forwarded-prefix") ?? "";
		const url = new URL(c.req.url);
		const proto =
			c.req.header("x-forwarded-proto") ?? url.protocol.replace(":", "");
		const host = c.req.header("x-forwarded-host") ?? url.host;
		return `${proto}://${host}${/^(\/[\w.-]+)+$/.test(prefix) ? prefix : ""}`;
	};

	app.get("/health", (c) =>
		c.json({ status: "ok", service: "pages", spaces: spaces.length }),
	);
	app.get("/ready", (c) => c.json({ ready: true }));

	// The site's own pages
	app.get("/", (c) => c.html(homePage(baseOf(c), spaces)));
	app.get("/about", (c) => c.html(aboutPage(baseOf(c))));
	app.get("/404.html", (c) => c.html(notFoundPage(baseOf(c)), 404));
	app.get("/spaces.json", (c) =>
		c.body(spacesJson(baseOf(c), spaces), 200, {
			"content-type": "application/json",
		}),
	);

	// A publisher's spaces, and the spaces themselves
	app.get("/:at{@[a-z0-9-]+}", (c) => c.redirect(`${c.req.path}/`, 301));
	app.get("/:at{@[a-z0-9-]+}/", (c) => {
		const list = handles.get(c.req.param("at").slice(1));
		return list
			? c.html(handlePage(baseOf(c), list[0].handle, list))
			: c.html(notFoundPage(baseOf(c)), 404);
	});
	app.get("/:at{@[a-z0-9-]+}/:slug/*", (c) => {
		const handle = c.req.param("at").slice(1);
		const s = servedBy.get(handle)?.find((x) => x.slug === c.req.param("slug"));
		if (!s) return c.html(notFoundPage(baseOf(c)), 404);
		const prefix = `/${spacePath(s)}`;
		if (!c.req.path.startsWith(prefix)) return c.redirect(prefix, 301);
		let rel =
			decodeURIComponent(c.req.path.slice(prefix.length)) || "index.html";
		if (rel.endsWith("/")) rel += "index.html";
		const file = normalize(join(s.dir, rel));
		const base = baseOf(c);
		if (rel === "index.html" && s.kind === "md")
			return c.html(
				markdownPage(readFileSync(join(s.dir, "index.md"), "utf8"), base, s),
			);
		if (
			!file.startsWith(s.dir) ||
			!existsSync(file) ||
			!statSync(file).isFile()
		)
			return c.html(notFoundPage(base), 404);
		const ext = extname(file).toLowerCase();
		if (ext === ".html" || ext === ".htm")
			return c.html(preparePage(readFileSync(file, "utf8"), base, s, rel));
		return c.body(readFileSync(file), 200, {
			"content-type": TYPES[ext] ?? "application/octet-stream",
		});
	});

	// For search, link previews and AI answers
	app.get("/robots.txt", (c) => c.text(robotsTxt(baseOf(c))));
	app.get("/sitemap.xml", (c) =>
		c.body(
			sitemapXml(baseOf(c), [
				{ path: "", lastmod },
				{ path: "about", lastmod },
				...[...handles].map(([h, list]) => ({
					path: `@${h}/`,
					lastmod: list[0].updated.slice(0, 10),
				})),
				...spaces.map((s) => ({
					path: spacePath(s),
					lastmod: s.updated.slice(0, 10),
				})),
			]),
			200,
			{ "content-type": "application/xml; charset=utf-8" },
		),
	);
	app.get("/llms.txt", (c) =>
		c.text(
			llmsTxt(baseOf(c), [
				{
					name: "About and FAQ",
					path: "about",
					note: "how publishing works and what a space may contain",
				},
				{
					name: "All spaces as JSON",
					path: "spaces.json",
					note: "every space with its title, publisher and source",
				},
				...spaces.slice(0, 200).map((s) => ({
					name: s.title,
					path: spacePath(s),
					note: `by @${s.handle}${s.description ? `: ${s.description}` : ""}`,
				})),
			]),
		),
	);
	app.get("/site.webmanifest", (c) =>
		c.body(webManifest(baseOf(c)), 200, {
			"content-type": "application/manifest+json",
		}),
	);
	app.get("/.well-known/security.txt", (c) => c.text(securityTxt(baseOf(c))));
	for (const [name, file] of files)
		app.get(`/${name}`, (c) =>
			c.body(file.body as Uint8Array<ArrayBuffer>, 200, {
				"content-type": file.type,
				"cache-control": "public, max-age=604800",
			}),
		);

	// The demo video, its poster and captions, from static/
	for (const name of Object.values(DEMO))
		app.get(`/${name}`, (c) => {
			const file = join(STATIC, name);
			if (!existsSync(file)) return c.html(notFoundPage(baseOf(c)), 404);
			return c.body(readFileSync(file), 200, {
				"content-type": name.endsWith(".vtt")
					? "text/vtt; charset=utf-8"
					: (TYPES[extname(name)] ?? "application/octet-stream"),
				"cache-control": "public, max-age=604800",
			});
		});

	app.notFound((c) => c.html(notFoundPage(baseOf(c)), 404));
	return app;
}
