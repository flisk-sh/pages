import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { createApp } from "../src/app";
import { csp } from "../src/check.mjs";
import { SHOWCASE_MAX, showcase } from "../src/pages";
import {
	bar,
	originOf,
	preparePage,
	readSpaces,
	type Space,
} from "../src/spaces";

const skipped: string[] = [];
const spaces = readSpaces(
	join(import.meta.dir, "fixtures", "spaces"),
	{
		"sam/gpu-explainer": {
			sha: "a1",
			updated: "2026-10-27T10:00:00Z",
			versions: 3,
		},
	},
	(line) => skipped.push(line),
);
const app = createApp({ publicUrl: "https://pages.test/", spaces });
const get = (path: string) => app.request(path);

describe("readSpaces", () => {
	it("reads title and description from the page or the Markdown, newest first", () => {
		expect(spaces.map((s) => `${s.handle}/${s.slug}`)).toEqual([
			"sam/gpu-explainer",
			"sam/notes",
		]);
		expect(spaces[0]).toMatchObject({
			kind: "html",
			title: "How GPUs work",
			versions: 3,
		});
		expect(spaces[0].description).toStartWith("Thousands of small cores");
		expect(spaces[1]).toMatchObject({ kind: "md", title: "Launch notes" });
		expect(spaces[1].description).toBe(
			"What we learned shipping Pages in a week.",
		);
	});

	it("leaves out a space that fails the check, and says why", () => {
		expect(spaces.some((s) => s.handle === "eve")).toBe(false);
		expect(skipped.join("\n")).toMatch(
			/skip @eve\/phish: .*form-action.*password/,
		);
	});

	it("keeps a failing space a maintainer approved", () => {
		const approved = readSpaces(join(import.meta.dir, "fixtures", "spaces"), {
			"eve/phish": {
				sha: "c3",
				updated: "2026-10-01T00:00:00Z",
				versions: 1,
				approved: true,
			},
		});
		expect(approved.some((s) => s.handle === "eve")).toBe(true);
	});
});

describe("a published HTML page", () => {
	it("carries the policy before its first script, a canonical link and the bar", async () => {
		const html = await (await get("/@sam/gpu-explainer/")).text();
		const policy = html.indexOf('http-equiv="Content-Security-Policy"');
		expect(policy).toBeGreaterThan(0);
		expect(policy).toBeLessThan(html.indexOf("<script"));
		expect(html).toContain(`content="${csp()}"`);
		expect(html).toContain(
			'<link rel="canonical" href="https://pages.test/@sam/gpu-explainer/">',
		);
		expect(html).toContain("data-pages-bar");
		expect(html.indexOf("data-pages-bar")).toBeLessThan(
			html.indexOf("</body>"),
		);
		expect(html).toContain("commits/space/sam/gpu-explainer");
		expect(html).toContain(">v3<");
	});

	it("serves the space's other files with their types", async () => {
		const res = await get("/@sam/gpu-explainer/data.json");
		expect(res.headers.get("content-type")).toBe("application/json");
		expect(await res.json()).toEqual({ cores: 16384 });
		expect(
			(await get("/@sam/gpu-explainer/app.js")).headers.get("content-type"),
		).toContain("text/javascript");
	});

	it("answers 404 for a missing file, an unknown space and a path out of the folder", async () => {
		expect((await get("/@sam/gpu-explainer/nope.js")).status).toBe(404);
		expect((await get("/@sam/nothing/")).status).toBe(404);
		expect(
			(await get("/@sam/gpu-explainer/..%2f..%2fnotes/index.md")).status,
		).toBe(404);
	});

	it("puts a head on a page that has none", () => {
		const s = spaces[0] as Space;
		const out = preparePage("<h1>bare</h1>", "https://pages.test", s);
		expect(out).toStartWith(
			'<head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy"',
		);
		expect(out).toEndWith("</div>");
	});
});

describe("a published Markdown page", () => {
	it("is rendered without its scripts, inside the policy", async () => {
		const html = await (await get("/@sam/notes/")).text();
		expect(html).toContain("<title>Launch notes</title>");
		expect(html).toContain("markdown-alert");
		expect(html).not.toContain("<script>alert(1)</script>");
		expect(html).toContain('src="https://pages.test/@sam/notes/chart.svg"');
		expect(html).toContain('http-equiv="Content-Security-Policy"');
	});

	it("links its relative pages on this site, not to GitHub", async () => {
		const html = await (await get("/@sam/notes/")).text();
		expect(html).toContain('href="https://pages.test/@sam/notes/report.html"');
		expect(html).toContain('href="https://pages.test/@sam/gpu-explainer/"');
		expect(html).not.toMatch(/href="https:\/\/github\.com\/[^"]*\/blob\//);
		const linked = await get("/@sam/notes/report.html");
		expect(linked.status).toBe(200);
		expect(await linked.text()).toContain("data-pages-bar");
	});
});

describe("the site around the spaces", () => {
	it("a publisher's page lists their spaces", async () => {
		const html = await (await get("/@sam/")).text();
		expect(html).toContain('href="/@sam/gpu-explainer/"');
		expect(html).toContain('href="/@sam/notes/"');
		expect((await get("/@sam")).status).toBe(301);
		expect((await get("/@nobody/")).status).toBe(404);
	});

	it("the home page lists the newest spaces and allows no scripts", async () => {
		const html = await (await get("/")).text();
		expect(html).toContain("How GPUs work");
		expect(html).toContain("default-src 'none'");
		expect(html).not.toContain("<script src");
	});

	it("spaces.json and llms.txt list every space with its source", async () => {
		const list = (await (await get("/spaces.json")).json()) as {
			url: string;
			source: string;
		}[];
		expect(list.map((s) => s.url)).toEqual([
			"https://pages.test/@sam/gpu-explainer/",
			"https://pages.test/@sam/notes/",
		]);
		expect(list[0].source).toBe(
			"https://github.com/flisk-sh/pages/tree/space/sam/gpu-explainer",
		);
		expect(await (await get("/llms.txt")).text()).toContain(
			"[How GPUs work](https://pages.test/@sam/gpu-explainer/)",
		);
	});
});

describe("the demo video", () => {
	it("is on the home page with its poster and captions, and the policy allows it", async () => {
		const html = await (await get("/")).text();
		expect(html).toContain('<source src="/demo.mp4" type="video/mp4">');
		expect(html).toContain('poster="/demo.jpg"');
		expect(html).toContain('src="/demo.vtt"');
		expect(html).toContain("media-src 'self'");
	});

	it("serves the files with their types", async () => {
		expect((await get("/demo.mp4")).headers.get("content-type")).toBe(
			"video/mp4",
		);
		expect((await get("/demo.jpg")).headers.get("content-type")).toBe(
			"image/jpeg",
		);
		expect((await get("/demo.vtt")).headers.get("content-type")).toContain(
			"text/vtt",
		);
	});
});

describe("the home page showcase", () => {
	const mk = (handle: string, slug: string) =>
		({
			handle,
			slug,
			kind: "html",
			title: slug,
			description: "",
			dir: "",
		}) as unknown as Space;

	it("leaves out one-click anonymous spaces", () => {
		const out = showcase([
			mk("anon", "rvhja8ayuk"),
			mk("odykyi", "flisk-up"),
			mk("anon", "n8vtrqpn68"),
		]);
		expect(out.map((s) => s.slug)).toEqual(["flisk-up"]);
	});

	it("shows at most nine, newest first as given", () => {
		const many = Array.from({ length: 20 }, (_, i) => mk("odykyi", `p${i}`));
		const out = showcase(many);
		expect(out).toHaveLength(SHOWCASE_MAX);
		expect(SHOWCASE_MAX).toBe(9);
		expect(out[0].slug).toBe("p0");
	});
});

describe("the bar's source link", () => {
	const run =
		"https://github.com/jawah/charset_normalizer/actions/runs/41311328873";
	it("reads only a GitHub Actions run from the Source: trailer", () => {
		expect(originOf(`Update @a/b\n\nSource: ${run}\n`)).toBe(run);
		expect(
			originOf("Update @a/b\n\nSource: https://evil.example/actions/runs/1"),
		).toBeUndefined();
		expect(originOf(`Source: ${run}/../../x`)).toBeUndefined();
		expect(originOf("Update @a/b")).toBeUndefined();
	});
	it("opens the publishing run, or the files when there is none", () => {
		const s = { ...(spaces[0] as Space), origin: run };
		expect(bar("https://pages.test", s)).toContain(
			`href="${run}" title="The CI run that published this page">source`,
		);
		expect(bar("https://pages.test", spaces[0] as Space)).toContain(
			"tree/space/sam/gpu-explainer",
		);
	});
});
