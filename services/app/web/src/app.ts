// Routes. The tool's own pages are /<text color>/<background color>; everything else is the site around it: SEO
// files, icons, the JSON API, the badge and MCP.
import { Hono } from "hono";
import { ASSETS } from "./assets.generated";
import { check } from "./contrast";
import {
	clientIp,
	type ProxyMode,
	RateLimiter,
	securityHeaders,
} from "./guard";
import { handleMcp } from "./mcp";
import { aboutPage, badge, homePage, notFoundPage, resultPage } from "./pages";
import {
	ICONS,
	llmsTxt,
	robotsTxt,
	securityTxt,
	sitemapXml,
	webManifest,
} from "./seo";
import { SITE } from "./site";

export interface AppOptions {
	/** The address people use, ending in a slash. Without it, each request's own address (see baseOf). */
	publicUrl?: string;
	proxy?: ProxyMode;
	/** API and MCP calls per client per minute. */
	callsPerMinute?: number;
	/** The date sitemap.xml gives as lastmod: when this build started. */
	builtAt?: Date;
}

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

export function createApp(options: AppOptions = {}) {
	const proxy = options.proxy ?? "none";
	const limit = new RateLimiter(options.callsPerMinute ?? 120, 60 * 1000);
	const lastmod = (options.builtAt ?? new Date()).toISOString().slice(0, 10);
	const files = loadAssets();
	const app = new Hono();

	/**
	 * The site address without the trailing slash: publicUrl when set (online), else this request's own origin and the
	 * prefix a proxy stripped (X-Forwarded-Prefix, /api/web behind Flisk's local proxy).
	 */
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
	const rootOf = (c: Parameters<typeof baseOf>[0]) =>
		new URL(`${baseOf(c)}/`).pathname.replace(/\/$/, "");

	const limited = (c: { req: { raw: Request }; env: unknown }) => {
		const env = c.env as
			| { requestIP?: (r: Request) => { address: string } | null }
			| undefined;
		return limit.hit(
			clientIp(c.req.raw.headers, env?.requestIP?.(c.req.raw)?.address, proxy),
		);
	};

	app.use("*", async (c, next) => {
		await next();
		for (const [k, v] of Object.entries(securityHeaders()))
			if (!c.res.headers.has(k)) c.res.headers.set(k, v);
	});

	app.get("/health", (c) =>
		c.json({ status: "ok", service: SITE.name.toLowerCase() }),
	);
	app.get("/ready", (c) => c.json({ ready: true }));

	// Pages
	app.get("/", (c) => c.html(homePage(baseOf(c))));
	app.get("/about", (c) => c.html(aboutPage(baseOf(c))));
	app.get("/check", (c) => {
		const r = check(c.req.query("fg") ?? "", c.req.query("bg") ?? "");
		return c.redirect(
			r ? `${rootOf(c)}/${r.fg}/${r.bg}` : `${rootOf(c)}/`,
			303,
		);
	});
	app.get("/:fg{[0-9a-fA-F#%]+}/:bg{[0-9a-fA-F#%]+}", (c) => {
		const r = check(
			decodeURIComponent(c.req.param("fg")),
			decodeURIComponent(c.req.param("bg")),
		);
		if (!r) return c.html(notFoundPage(baseOf(c)), 404);
		// One address per result, so search engines and shared links agree: /FFF/000 → /ffffff/000000.
		if (c.req.param("fg") !== r.fg || c.req.param("bg") !== r.bg)
			return c.redirect(`${rootOf(c)}/${r.fg}/${r.bg}`, 301);
		c.header("cache-control", "public, max-age=86400");
		return c.html(resultPage(baseOf(c), r));
	});

	// For search engines and AI assistants
	app.get("/robots.txt", (c) => c.text(robotsTxt(baseOf(c))));
	app.get("/sitemap.xml", (c) => {
		const paths = [
			"",
			"about",
			...SITE.examples.map(([fg, bg]) => `${fg}/${bg}`),
		];
		return c.body(sitemapXml(baseOf(c), paths, lastmod), 200, {
			"content-type": "application/xml; charset=utf-8",
		});
	});
	app.get("/llms.txt", (c) =>
		c.text(
			llmsTxt(baseOf(c), [
				{
					name: "Check two colors",
					path: "1d1c1a/fbfaf7",
					note: "put the text color, then the background, in the address",
				},
				{
					name: "JSON API",
					path: "api/contrast?fg=1d1c1a&bg=fbfaf7",
					note: "the same result as JSON",
				},
				{
					name: "MCP server",
					path: "mcp",
					note: "Streamable HTTP, one read-only tool, check_contrast",
				},
				{
					name: "About and FAQ",
					path: "about",
					note: "what it does and stores",
				},
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

	// For code
	app.get("/api/contrast", (c) => {
		const wait = limited(c);
		if (wait > 0)
			return c.json({ error: "Too many requests." }, 429, {
				"retry-after": String(wait),
			});
		const r = check(c.req.query("fg") ?? "", c.req.query("bg") ?? "");
		return r
			? c.json(r)
			: c.json(
					{ error: "fg and bg must be hex colors, like 1d1c1a or fff." },
					400,
				);
	});
	app.get("/badge/:fg/:file{[0-9a-fA-F]+\\.svg}", (c) => {
		const r = check(
			c.req.param("fg"),
			c.req.param("file").replace(/\.svg$/, ""),
		);
		if (!r) return c.notFound();
		return c.body(badge(r), 200, {
			"content-type": "image/svg+xml",
			"cache-control": "public, max-age=86400",
		});
	});
	app.get("/mcp", (c) =>
		c.text("Send MCP requests with POST.", 405, { allow: "POST" }),
	);
	app.post("/mcp", async (c) => {
		const wait = limited(c);
		if (wait > 0)
			return c.json(
				{
					jsonrpc: "2.0",
					id: null,
					error: { code: -32000, message: "Too many requests." },
				},
				429,
			);
		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json(
				{
					jsonrpc: "2.0",
					id: null,
					error: { code: -32700, message: "Parse error" },
				},
				400,
			);
		}
		const answer = await handleMcp(body);
		return answer === undefined ? c.body(null, 202) : c.json(answer);
	});

	app.notFound((c) => c.html(notFoundPage(baseOf(c)), 404));
	return app;
}
