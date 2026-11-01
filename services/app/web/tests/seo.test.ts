import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { createApp } from "../src/app";
import { ASSETS } from "../src/assets.generated";
import { ICONS } from "../src/seo";
import { SITE } from "../src/site";
import { readSpaces } from "../src/spaces";

const spaces = readSpaces(join(import.meta.dir, "fixtures", "spaces"), {
	"sam/gpu-explainer": {
		sha: "a1",
		updated: "2026-10-27T10:00:00Z",
		versions: 3,
	},
	"sam/notes": { sha: "b2", updated: "2026-10-26T10:00:00Z", versions: 1 },
});
const app = createApp({
	publicUrl: "https://tool.test/",
	builtAt: new Date("2026-10-28"),
	spaces,
});
const page = async (path: string) => (await app.request(path)).text();
const attr = (html: string, re: RegExp) => html.match(re)?.[1];

describe("site.ts", () => {
	it("keeps the tagline and description at lengths search results show whole", () => {
		expect(SITE.tagline.length).toBeLessThanOrEqual(60);
		expect(SITE.description.length).toBeGreaterThanOrEqual(110);
		expect(SITE.description.length).toBeLessThanOrEqual(160);
		expect(SITE.url).toMatch(/^https:\/\/.+\/$/);
	});

	it("ships every icon the head and the manifest link to, at its size", () => {
		const size = (name: string) => {
			const png = Buffer.from(ASSETS[name].base64, "base64");
			return [png.readUInt32BE(16), png.readUInt32BE(20)];
		};
		for (const name of Object.values(ICONS)) expect(ASSETS[name]).toBeDefined();
		expect(size(ICONS.og)).toEqual([1200, 630]);
		expect(size(ICONS.apple)).toEqual([180, 180]);
		expect(size(ICONS.maskable)).toEqual([512, 512]);
	});
});

describe.each(["/", "/about", "/@sam/"])("the head of %s", (path) => {
	it("has one title, a description, a canonical link and a social card", async () => {
		const html = await page(path);
		expect(html.match(/<title>/g)).toHaveLength(1);
		expect(html.match(/<h1[ >]/g)).toHaveLength(1);
		const description = attr(
			html,
			/<meta name="description" content="([^"]+)"/,
		);
		expect(description?.length).toBeGreaterThan(50);
		expect(description?.length).toBeLessThanOrEqual(160);
		expect(attr(html, /<link rel="canonical" href="([^"]+)"/)).toBe(
			`https://tool.test${path}`,
		);
		expect(attr(html, /<meta property="og:image" content="([^"]+)"/)).toBe(
			"https://tool.test/og.png",
		);
		expect(html).toContain(
			'<meta name="twitter:card" content="summary_large_image">',
		);
		expect(html).toContain('<html lang="en">');
		expect(html).toContain('rel="manifest"');
		expect(html).toContain('content="index,follow');
	});

	it("has JSON-LD that parses, with the site, its publisher and the app", async () => {
		const json = attr(
			await page(path),
			/<script type="application\/ld\+json">(.+?)<\/script>/s,
		);
		const ld = JSON.parse(json as string) as {
			"@graph": { "@type": string }[];
		};
		const types = ld["@graph"].map((n) => n["@type"]);
		expect(types).toEqual(
			expect.arrayContaining(["WebSite", "Organization", "WebApplication"]),
		);
		if (path === "/about") expect(types).toContain("FAQPage");
		if (path !== "/") expect(types).toContain("BreadcrumbList");
	});
});

describe("files for crawlers", () => {
	it("robots.txt names the AI answer crawlers and points at the sitemap", async () => {
		const robots = await page("/robots.txt");
		expect(robots).toContain("User-agent: OAI-SearchBot");
		expect(robots).toContain("User-agent: Claude-SearchBot");
		expect(robots).toContain("Sitemap: https://tool.test/sitemap.xml");
	});

	it("sitemap.xml lists the home page, about, each publisher and each space", async () => {
		const res = await app.request("/sitemap.xml");
		expect(res.headers.get("content-type")).toContain("application/xml");
		const xml = await res.text();
		expect(xml).toContain(
			"<loc>https://tool.test/</loc><lastmod>2026-10-28</lastmod>",
		);
		expect(xml).toContain("<loc>https://tool.test/about</loc>");
		expect(xml).toContain(
			"<loc>https://tool.test/@sam/gpu-explainer/</loc><lastmod>2026-10-27</lastmod>",
		);
		expect(xml.match(/<url>/g)).toHaveLength(
			2 + 1 + spaces.filter((s) => !s.unlisted).length,
		);
	});

	it("llms.txt, the manifest and security.txt", async () => {
		expect(await page("/llms.txt")).toStartWith(`# ${SITE.name}\n\n> `);
		const manifest = JSON.parse(await page("/site.webmanifest")) as {
			icons: { purpose?: string }[];
		};
		expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
		const security = await page("/.well-known/security.txt");
		expect(security).toContain("Contact: https://");
		expect(security).toMatch(/Expires: \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/);
	});

	it("serves the icons with their types and a long cache", async () => {
		const res = await app.request("/og.png");
		expect(res.headers.get("content-type")).toBe("image/png");
		expect(res.headers.get("cache-control")).toContain("max-age");
		expect(
			(await app.request("/favicon.ico")).headers.get("content-type"),
		).toBe("image/x-icon");
	});

	it("keeps the not-found page out of the index and answers 404", async () => {
		const res = await app.request("/nope/nothing-here");
		expect(res.status).toBe(404);
		expect(await res.text()).toContain(
			'<meta name="robots" content="noindex">',
		);
	});
});
