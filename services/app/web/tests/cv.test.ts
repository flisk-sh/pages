import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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
			{ id: "pkg", name: "Package Wrangler", goal: "Pin dependencies." },
		],
		tracks: [
			{
				id: "backend",
				name: "Backend",
				blurb: "APIs.",
				stops: { pkg: { main: ["bun"], side: ["uv"] } },
			},
		],
	},
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
});
