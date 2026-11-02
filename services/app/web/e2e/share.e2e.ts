// Shared and public pages in a real Chromium, served by the real app: the good links, the bad ones and the ones in
// between (a link from an older version, a mangled key, a key for another page). happy-dom covers the scripts; this
// covers what only a browser shows: layout, the cascade after decryption, hover menus and frames.
// Run: bunx playwright install chromium && bun test ./e2e/share.e2e.ts
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Browser, chromium, type Page } from "playwright";
// @ts-expect-error plain .mjs without types
import { shareStaged } from "../../../../bin/protect.mjs";
import { createApp } from "../src/app";
import { readSpaces } from "../src/spaces";

const LOCKED = "This page is shared with certain people";
const DENIED = "This link is not for you, or it was taken back";

// A page that relies on its own paragraph styles, so a style leaking from the locked shell would show.
const page = (secret: string) =>
	`<!doctype html><html><head><meta charset="utf-8"><title>${secret}</title><style>body{margin:0;font:16px system-ui}main{max-width:760px;margin:0 auto;padding:40px 16px}p{text-align:left}</style></head><body><main><h1>${secret}</h1><p id="para">${"A long paragraph of the guide. ".repeat(12)}</p></main></body></html>`;

const root = mkdtempSync(join(tmpdir(), "pages-e2e-"));
function space(slug: string, html: string) {
	const dir = join(root, "sam", slug);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "index.html"), html);
	return dir;
}

const guide = space("guide", page("Owner guide"));
const oldKeys = shareStaged(guide, ["owner", "recruiter"]);
// Published again, as `pages share` does for a new version: every earlier link is taken back.
writeFileSync(join(guide, "index.html"), page("Owner guide"));
const keys = shareStaged(guide, ["owner", "recruiter"]);
const assess = space("assess", page("Candidate assessment"));
const candidate = shareStaged(assess, ["candidate"]);
space(
	"report",
	`<!doctype html><html><head><meta charset="utf-8"><title>Mutation report</title><meta name="description" content="Scores."></head><body><h1>Report</h1><script>const t=\`<title>\${Ji(e)}</title>\`</script></body></html>`,
);

let server: ReturnType<typeof Bun.serve>;
let browser: Browser;
let base = "";

beforeAll(async () => {
	server = Bun.serve({
		port: 0,
		fetch: createApp({ spaces: readSpaces(root) }).fetch,
	});
	base = `http://localhost:${server.port}`;
	browser = await chromium.launch();
});
afterAll(async () => {
	await browser?.close();
	server?.stop(true);
});

async function visit(path: string, width = 1280): Promise<Page> {
	const p = await browser.newPage({ viewport: { width, height: 800 } });
	await p.goto(`${base}${path}`);
	await p.waitForFunction(
		() =>
			!document.querySelector("#m") ||
			document.querySelector("#m")?.textContent !== "",
	);
	await p.waitForTimeout(300);
	return p;
}
const text = (p: Page) => p.evaluate(() => document.body.innerText);
const rect = (p: Page, sel: string) =>
	p.evaluate(
		(s) => document.querySelector(s)?.getBoundingClientRect().toJSON(),
		sel,
	);

describe("good: the right person with the whole link", () => {
	for (const who of ["owner", "recruiter"] as const)
		it(`${who} reads the guide`, async () => {
			const p = await visit(`/@sam/guide/#${who}.${keys[who]}`);
			expect(await text(p)).toContain("Owner guide");
			expect(await text(p)).not.toContain(LOCKED);
			await p.close();
		});

	it("the candidate reads a different page, and not the guide", async () => {
		const p = await visit(`/@sam/assess/#candidate.${candidate.candidate}`);
		expect(await text(p)).toContain("Candidate assessment");
		expect(await text(p)).not.toContain("Owner guide");
		await p.close();
	});

	it("the decrypted page keeps its own layout: no centred, narrow paragraphs", async () => {
		const p = await visit(`/@sam/guide/#owner.${keys.owner}`);
		const para = await p.evaluate(() => {
			const el = document.getElementById("para") as HTMLElement;
			return {
				align: getComputedStyle(el).textAlign,
				width: el.getBoundingClientRect().width,
			};
		});
		expect(para.align).toBe("left");
		expect(para.width).toBeGreaterThan(600);
		await p.close();
	});

	it("the private notice sits at the top and never covers the bar", async () => {
		const p = await visit(`/@sam/guide/#owner.${keys.owner}`);
		const bar = await rect(p, "[data-pages-bar]");
		const notice = await p.evaluate(() => {
			const el = [...document.querySelectorAll("div")].find((d) =>
				d.textContent?.startsWith("Shared privately"),
			);
			return el?.getBoundingClientRect().toJSON();
		});
		expect(notice?.top).toBe(0);
		expect(notice && bar && notice.bottom <= bar.top).toBe(true);
		await p.close();
	});

	it("the share menu opens on hover and its tooltip does not cover it", async () => {
		const p = await visit("/@sam/report/");
		await p.hover("[data-pages-bar] [data-share] > a");
		expect(await p.isVisible("[data-pages-bar] [data-menu]")).toBe(true);
		const tip = await p.evaluate(
			() =>
				getComputedStyle(
					document.querySelector(
						"[data-pages-bar] [data-share] > a",
					) as Element,
					"::after",
				).display,
		);
		expect(tip).toBe("none");
		await p.close();
	});
});

describe("bad: no key, a wrong key, or a hostile one", () => {
	const cases: [string, string][] = [
		["no hash at all", ""],
		["a name without a key", "#owner"],
		["an unknown name", `#alice.${keys.owner}`],
		["a wrong key", "#owner.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"],
		["a prototype name", `#constructor.${keys.owner}`],
		["__proto__", `#__proto__.${keys.owner}`],
		["the candidate's key on the guide", `#candidate.${candidate.candidate}`],
	];
	for (const [name, hash] of cases)
		it(`${name}: a notice, and nothing of the page`, async () => {
			const p = await visit(`/@sam/guide/${hash}`);
			const t = await text(p);
			expect(t).toMatch(new RegExp(`${LOCKED}|${DENIED}`));
			expect(t).not.toContain("A long paragraph");
			await p.close();
		});

	it("a guide key does not open the candidate page", async () => {
		const p = await visit(`/@sam/assess/#owner.${keys.owner}`);
		expect(await text(p)).toContain(DENIED);
		expect(await text(p)).not.toContain("Candidate assessment");
		await p.close();
	});
});

describe("in between: links that almost work", () => {
	it("a link from an older version says it was taken back", async () => {
		const p = await visit(`/@sam/guide/#owner.${oldKeys.owner}`);
		expect(await text(p)).toContain(DENIED);
		await p.close();
	});

	it("a key cut short by a mail client fails cleanly", async () => {
		const p = await visit(`/@sam/guide/#owner.${keys.owner.slice(0, 20)}`);
		expect(await text(p)).toContain(DENIED);
		await p.close();
	});

	it("a name in capitals is not the same person", async () => {
		const p = await visit(`/@sam/guide/#OWNER.${keys.owner}`);
		expect(await text(p)).toContain(DENIED);
		await p.close();
	});

	it("a tracking query string before the hash still opens it", async () => {
		const p = await visit(`/@sam/guide/?utm_source=mail#owner.${keys.owner}`);
		expect(await text(p)).toContain("Owner guide");
		await p.close();
	});

	it("the locked notice is readable on a phone, inside the screen", async () => {
		const p = await visit("/@sam/guide/", 375);
		const m = await rect(p, "#m");
		expect(m && m.left >= 0 && m.right <= 375).toBe(true);
		const bar = await rect(p, "[data-pages-bar]");
		expect(bar && bar.left >= 0 && bar.right <= 375).toBe(true);
		await p.close();
	});
});

describe("the gallery", () => {
	it("titles a card by the page's own <title>, not one inside a script", async () => {
		const p = await visit("/@sam/");
		const t = await text(p);
		expect(t).toContain("Mutation report");
		expect(t).not.toContain("${Ji(e)}");
		await p.close();
	});

	it("previews show the page without its bar", async () => {
		const p = await visit("/@sam/");
		const frame = p.frames().find((f) => f.url().endsWith("/@sam/report/"));
		expect(frame).toBeDefined();
		await frame?.waitForLoadState();
		expect(
			await frame?.evaluate(() => !!document.querySelector("[data-pages-bar]")),
		).toBe(false);
		await p.close();
	});
});
