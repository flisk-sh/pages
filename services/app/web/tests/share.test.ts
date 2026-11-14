import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, SHARE_JS_PATH } from "../src/app";

const app = createApp({ publicUrl: "https://pages.test/", spaces: [] });
const get = (path: string) => app.request(path);

describe("the share page", () => {
	it("serves a page whose only script is same-origin and whose policy blocks everything else", async () => {
		const html = await (await get("/share")).text();
		expect(html).toContain("Make a private file");
		expect(html).toMatch(/src="\/share-[0-9a-f]{12}\.js"/);
		expect(html).toContain("script-src 'self'");
		expect(html).not.toContain("script-src 'none'");
	});

	it("counts visits like every page, and the policy lets the script and its beacon through", async () => {
		const html = await (await get("/share")).text();
		expect(html).toContain("script-src 'self' https://flisk.si https://flisk.sh;");
		expect(html).toContain("connect-src https://analytics.flisk.si;");
		expect(html).toContain(
			'<script defer data-domain="pages.flisk.si" src="https://flisk.sh/a.js"></script>',
		);
	});

	it("serves the sealing code and the page script from this site", async () => {
		for (const name of ["seal.js", SHARE_JS_PATH.slice(1)]) {
			const res = await get(`/${name}`);
			expect(res.status).toBe(200);
			expect(res.headers.get("content-type")).toContain("javascript");
		}
	});

	it("ships the same sealing code the CLI uses, so the two cannot drift", () => {
		const served = readFileSync(
			join(import.meta.dir, "..", "static", "seal.js"),
			"utf8",
		);
		const cli = readFileSync(
			join(import.meta.dir, "..", "..", "..", "..", "bin", "seal.js"),
			"utf8",
		);
		expect(served).toBe(cli);
	});
});

describe("the share page's integrity pin", () => {
	it("pins the exact bytes of the script it serves", async () => {
		const html = await (await get("/share")).text();
		const pinned = html.match(/integrity="(sha384-[^"]+)"/)?.[1];
		expect(pinned).toBeDefined();
		const served = await (await get(SHARE_JS_PATH)).text();
		expect(
			`sha384-${createHash("sha384").update(served).digest("base64")}`,
		).toBe(pinned as string);
		expect(html).toContain('crossorigin="anonymous"');
	});
});

describe("pasting instead of a file", () => {
	it("the page has a paste box and the script accepts either a file or pasted HTML", async () => {
		const html = await (await get("/share")).text();
		expect(html).toContain('id="paste"');
		const js = await (await get(SHARE_JS_PATH)).text();
		expect(js).toContain('document.getElementById("paste").value');
		expect(js).toContain("new TextEncoder().encode(pasted)");
	});
});

describe("names are optional", () => {
	it("one file is made when no names are typed", async () => {
		const js = await (await get(SHARE_JS_PATH)).text();
		expect(js).toContain('"Recipient 1"');
	});
});

describe("no share sheet", () => {
	it("the page never opens the system share sheet, so nothing is sent by email automatically", async () => {
		const js = await (await get(SHARE_JS_PATH)).text();
		expect(js).not.toContain("navigator.share");
		expect(js).not.toContain("canShare");
	});
});

describe("the share page's image policy", () => {
	it("allows the site's own images, so the logo loads", async () => {
		const html = await (await get("/share")).text();
		expect(html).toContain("img-src 'self' https://devhunt.org");
	});
});

describe("the DevHunt footer badge", () => {
	const BADGE =
		'<a href="https://devhunt.org/tool/pages" target="_blank" rel="noopener" title="Pages on DevHunt"><img src="https://devhunt.org/badge/pages.svg" alt="Pages - Featured on DevHunt" width="220" height="54" loading="lazy"></a>';

	for (const path of ["/", "/about", "/share"]) {
		it(`appears in the footer of ${path} and its image host is allowed`, async () => {
			const html = await (await get(path)).text();
			const footer = html.slice(
				html.indexOf("<footer>"),
				html.indexOf("</footer>"),
			);
			expect(footer).toContain(BADGE);
			expect(html).toMatch(/img-src [^;]*https:\/\/devhunt\.org/);
		});
	}
});
