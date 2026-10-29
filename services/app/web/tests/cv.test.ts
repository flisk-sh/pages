import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSpace } from "../src/check.mjs";
import { cleanName, cvPage, parseMe, type RoadmapData } from "../src/cv";

const data: RoadmapData = {
	families: [
		{ id: "foundations", name: "Package & build", color: "#eab308" },
		{ id: "containers", name: "Containers", color: "#38bdf8" },
	],
	tools: {
		foundations: [
			{
				id: "bun",
				name: "Bun",
				sym: "Bn",
				cat: "Package managers",
				tagline: "Fast JS",
				ring: "adopt",
				dx: ["a", "b"],
			},
			{ id: "uv", name: "uv", sym: "uv", cat: "Package managers" },
		],
		containers: [
			{ id: "helm", name: "Helm", sym: "Hm", cat: "Charts", ring: "trial" },
		],
	},
	roles: {
		roles: [
			{
				id: "be",
				name: "Backend Engineer",
				what: "Builds APIs.",
				core: ["bun", "helm"],
				daily: ["uv"],
			},
			{
				id: "fe",
				name: "Frontend Engineer",
				what: "Builds screens.",
				core: ["uv"],
			},
		],
	},
	journeys: {
		levels: [
			{ id: "pkg", n: 1, name: "Package Wrangler", goal: "Pin dependencies." },
		],
		tracks: [
			{
				id: "backend",
				name: "Backend",
				blurb: "APIs.",
				stops: {
					pkg: { main: ["bun"], side: ["uv"], tip: "Commit the <lockfile>." },
				},
			},
		],
	},
	skills: [
		{
			id: "a-bun-install",
			name: "bun-install",
			source: "acme/skills",
			path: "skills/bun-install/SKILL.md",
			what: "Install with Bun.",
			result: { score: 100 },
		},
		{
			id: "a-helm-lint",
			name: "helm-lint",
			source: "acme/skills",
			what: "Lint <b>charts</b>.",
			result: { score: 60 },
		},
		{
			id: "a-uv-tips",
			name: "uv-tips",
			source: "acme/skills",
			what: "Tips for uv.",
			result: { score: 100 },
		},
	],
	github: { bun: { stars: 80000, release: "2026-10-20T00:00:00Z" } },
	logos: ["bun.svg", "helm.png"],
};
const links = {
	portfolio: "https://roadmap.flisk.si/portfolio/",
	radar: "https://roadmap.flisk.si/radar/",
};

describe("the developer CV", () => {
	const { html, logos } = cvPage(
		data,
		parseMe("bun3,helm2,nope3"),
		"Sam <b>",
		links,
		new Date("2026-10-28"),
	);

	it("scores roles like roadmap and leads with the best fit", () => {
		expect(html).toContain(
			"<title>Sam b · Backend Engineer · Developer CV</title>",
		);
		expect(html).toContain("63% MATCH");
		expect(html).toContain("Frontend Engineer");
	});

	it("shows rated tools solid with their level and unrated ones dashed", () => {
		expect(html).toContain('class="chip l3"');
		expect(html).toContain("●●●");
		expect(html).toContain('class="chip l0 off"');
		expect(html).not.toContain("nope");
	});

	it("draws the journey and the expert tool cards", () => {
		expect(html).toContain("Package Wrangler");
		expect(html).toContain("1/2 known");
		expect(html).toContain("★ 80k");
		expect(html).toContain("released 8 days ago");
	});

	it("shows three roadmap-style role cards with stacked chip rows", () => {
		expect(html).toContain('class="rolecard best"');
		expect(html).toContain("Best fit");
		expect(html).toContain("Second fit");
		expect(html).toContain("Must have<b>2/2</b>");
		expect(html).toContain("Every day<b>0/1</b>");
		expect(html).not.toContain("Third fit");
	});

	it("draws the journey line with a numbered ring, branches and a tip", () => {
		expect(html).toContain('<li class="step done"><span class="num">1</span>');
		expect(html).toContain("On the line");
		expect(html).toContain("Branches");
		expect(html).toContain('<p class="note">Commit the &lt;lockfile&gt;.</p>');
	});

	it("matches agent skills to rated tools at use often or above, and says so", () => {
		expect(html).toContain("<code>bun-install</code>");
		expect(html).toContain("100/100");
		expect(html).toContain("Matches <b>Bun</b> (expert)");
		expect(html).toContain(
			"github.com/acme/skills/blob/HEAD/skills/bun-install/SKILL.md",
		);
		expect(html).toContain("this page doesn't say I use them");
		expect(html).toContain("Matches <b>Helm</b> (use often)");
		expect(html).toContain("Lint &lt;b&gt;charts&lt;/b&gt;.");
		expect(html).not.toContain("uv-tips"); // uv is not rated
	});

	it("groups the toolkit by level and keeps chips inside their card", () => {
		expect(html).toContain("<h3>Expert</h3>");
		expect(html).toContain("<h3>Use often</h3>");
		expect(html).not.toContain("<h3>Have used</h3>");
		const css = readFileSync(join(import.meta.dir, "../src/cv.css"), "utf8");
		expect(css).toMatch(/\.chip \{[^}]*max-width: 100%/);
		expect(css).toContain("text-overflow: ellipsis");
	});

	it("gives expert and use-often tools a row with the tool's line, and says what the page is made from", () => {
		expect(html).toContain('<div class="ev">');
		expect(html).toContain("<p>Fast JS</p>");
		expect(html).toContain("Self-reported");
		expect(html).toContain("No scripts");
	});

	it("lists only the logos it uses and has no scripts", () => {
		expect(logos.sort()).toEqual(["bun.svg", "helm.png"]);
		expect(html).not.toMatch(/<script/i);
	});

	it("passes the same check as every space", () => {
		const dir = mkdtempSync(join(tmpdir(), "cv-"));
		writeFileSync(join(dir, "index.html"), html);
		mkdirSync(join(dir, "logos"));
		for (const f of logos)
			writeFileSync(
				join(dir, "logos", f),
				f.endsWith("svg") ? '<svg xmlns="http://www.w3.org/2000/svg"/>' : "png",
			);
		expect(checkSpace(dir).errors).toEqual([]);
	});

	it("keeps a name to one plain line", () => {
		expect(cleanName("  Sam\n<img src=x>  Doe ")).toBe("Sam img src=x Doe");
		expect(cleanName("x".repeat(80))).toHaveLength(60);
	});

	it("has no share section or preview tags without the page's own address", () => {
		expect(html).not.toContain('id="share"');
		expect(html).not.toContain("og:title");
	});
});

describe("sharing a published CV", () => {
	const url = "https://pages.flisk.si/@sam/cv/";
	const { html } = cvPage(
		data,
		parseMe("bun3,helm2"),
		"Sam <b>",
		{ ...links, url },
		new Date("2026-10-28"),
	);

	it("links to each network's own post box, with the address encoded and no script", () => {
		for (const net of [
			"twitter.com/intent/tweet",
			"linkedin.com/sharing/share-offsite",
			"bsky.app/intent/compose",
			"reddit.com/submit",
			"news.ycombinator.com/submitlink",
			"facebook.com/sharer",
			"wa.me/",
			"t.me/share/url",
			"mailto:?subject=",
		])
			expect(html).toContain(net);
		expect(html).toContain(`url=${encodeURIComponent(url)}`);
		expect(html).toContain('href="#share"');
		expect(html).not.toMatch(/<script/i);
	});

	it("offers README badge snippets that escape the text and link to the CV", () => {
		expect(html).toContain(
			"img.shields.io/badge/DevEx_CV-Backend_Engineer_63%25-22c55e",
		);
		expect(html).toContain(`](${url})`);
		expect(html).toContain("Markdown, for a README");
		expect(html).not.toContain("Sam <b>"); // a name is cleaned of markup before it reaches any snippet or tag
	});

	it("adds link-preview tags for X, LinkedIn and chat apps", () => {
		expect(html).toContain(
			'property="og:url" content="https://pages.flisk.si/@sam/cv/"',
		);
		expect(html).toContain('name="twitter:card" content="summary"');
	});

	it("still passes the same check as every space", () => {
		const dir = mkdtempSync(join(tmpdir(), "cv-share-"));
		writeFileSync(join(dir, "index.html"), html);
		mkdirSync(join(dir, "logos"));
		for (const f of ["bun.svg", "helm.png"])
			writeFileSync(
				join(dir, "logos", f),
				f.endsWith("svg") ? '<svg xmlns="http://www.w3.org/2000/svg"/>' : "png",
			);
		expect(checkSpace(dir).errors).toEqual([]);
	});
});
