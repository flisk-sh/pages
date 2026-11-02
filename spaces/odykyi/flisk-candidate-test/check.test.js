// Tests for check.js: the self-check every candidate sees. Run with `bun test`.
import { describe, expect, it } from "bun:test";
import { crossRef, deadlineOf, iceRows, pitchOk, roadmapOk, readmeOk, runChecks, sections } from "./check.js";

const ICE = "| Item | Who | Impact | Confidence | Ease | ICE | Number |\n|---|---|---|---|---|---|---|\n| A | devs | 8 | 7 | 9 | 504 | x |\n| B | teams | 9 | 6 | 5 | 270 | y |\n| C | agents | 7 | 5 | 4 | 140 | z |";
const goodRoadmap = `## Vision\nOne command for any local stack.\n## Next 6 months\n${ICE}\n## Not now\nKubernetes export.`;
const goodPitch = "## Why Flisk\nOne command instead of a Compose file per service.\n## Pricing\nFree CLI, paid team plan.";
const goodReadme = "# Voting app on Flisk\n\nRun it: `flisk up`\n\n## What was hard\nThe worker started before Postgres.";
const TREE = ["LICENSE", "NOTICE", "ROADMAP.md", ".flisk/project.json", "services/api/service.json", "services/web/service.json", "README.md", "PITCH.md"];

function repo(over = {}) {
	const o = {
		tree: TREE, readme: goodReadme, pitch: goodPitch, roadmap: goodRoadmap, searches: [], contacted: 0, commitMessage: "Convert to Flisk",
		created: "2026-11-02T10:00:00Z", commitDate: "2026-11-03T10:00:00Z", runs: [], ...over,
	};
	return async (u) => {
		const ok = (b) => ({ ok: true, json: async () => b, text: async () => b });
		if (u.includes("raw.githubusercontent")) {
			const body = { "README.md": o.readme, "PITCH.md": o.pitch, "ROADMAP.md": o.roadmap }[u.split("/").pop()];
			return body ? ok(body) : { ok: false };
		}
		if (u.includes("/git/trees/")) return ok({ tree: o.tree.map((path) => ({ path })) });
		if (u.includes("/commits")) return ok([{ sha: "abcdef1234", commit: { message: o.commitMessage, committer: { date: o.commitDate } } }]);
		if (u.includes("/search/issues")) {
			o.searches.push(decodeURIComponent(u.split("q=")[1]));
			return o.contacted === "error" ? { ok: false, status: 403 } : ok({ total_count: o.contacted });
		}
		if (u.includes("/actions/runs")) return ok({ workflow_runs: o.runs });
		return ok({ private: false, fork: o.parent !== null, parent: o.parent === null ? undefined : { full_name: o.parent || "flisk-sh/flisk-task-starter" }, default_branch: "main", created_at: o.created, html_url: "https://github.com/u/r" });
	};
}
const run = (over, start = "2026-11-02") => runChecks({ user: "u", repo: "r", start }, repo(over));
const failed = (r) => r.rows.filter((x) => !x.ok).map((x) => x.key);

describe("a complete submission", () => {
	it("is ready for review", async () => {
		const r = await run();
		expect(failed(r)).toEqual([]);
		expect(r.ready).toBe(true);
		expect(r.done).toBe(9);
	});
	it("reports CI as a bonus, never as a requirement", async () => {
		expect((await run({ runs: [{ conclusion: "failure", html_url: "x" }] })).ready).toBe(true);
		expect((await run({ runs: [{ conclusion: "success", html_url: "x" }] })).ci).toEqual({ ok: true, url: "x" });
		expect((await run()).ci).toBeNull();
	});
});

describe("bad: missing or hollow parts", () => {
	it("fails an empty repository on every part", async () => {
		const r = await run({ tree: [], readme: "", pitch: "", roadmap: "", parent: null });
		expect(failed(r)).toEqual(["fork", "stack", "readme", "roadmap", "pitch", "license"]);
		expect(r.ready).toBe(false);
	});
	it("fails a single service: a conversion means at least two", async () => {
		expect(failed(await run({ tree: ["LICENSE", "NOTICE", "ROADMAP.md", ".flisk/project.json", "service.json"] }))).toEqual(["stack"]);
	});
	it("fails committed secrets, dependencies and generated files", async () => {
		for (const f of [".env", "api/.env.local", "node_modules/x/index.js", ".flisk/.flisk-out/a"])
			expect(failed(await run({ tree: [...TREE, f] }))).toEqual(["clean"]);
	});
	it("throws a readable error for a private or missing repository", async () => {
		const missing = async () => ({ ok: false, status: 404 });
		await expect(runChecks({ user: "u", repo: "r", start: "2026-11-02" }, missing)).rejects.toThrow("404");
	});
});

describe("bad: harm that multiplies with every candidate", () => {
	it("fails an issue or pull request opened on the starter, Flisk or the original app", async () => {
		const o = { contacted: 1, searches: [] };
		expect(failed(await run(o))).toEqual(["contact"]);
		expect(o.searches[0]).toContain("author:u created:>=2026-11-02");
		for (const r of ["flisk-sh/flisk-task-starter", "dockersamples/example-voting-app", "flisk-sh/flisk", "flisk-sh/pages"])
			expect(o.searches[0]).toContain(`repo:${r}`);
	});
	it("is not ready when GitHub refuses the search, and says so", async () => {
		const r = await run({ contacted: "error" });
		expect(failed(r)).toEqual(["contact"]);
		expect(r.contactUnknown).toBe(true);
	});
	it("fails a new commit that links another project's issue", async () => {
		expect(failed(await run({ commitMessage: "inspired by org1/app#12" }))).toEqual(["crossrefs"]);
	});
	it("fails a dropped LICENSE or NOTICE", async () => {
		expect(failed(await run({ tree: TREE.filter((f) => f !== "LICENSE") }))).toEqual(["license"]);
		expect(failed(await run({ tree: TREE.filter((f) => f !== "NOTICE") }))).toEqual(["license"]);
	});
});

describe("in between: almost right", () => {
	it("allows references to the candidate's own issues and old upstream commits", async () => {
		expect(crossRef("fixes #3 and u/r#4 and https://github.com/u/r/issues/5", "u/r")).toBe(false);
		expect(failed(await run({ commitMessage: "upstream: see dockersamples/example-voting-app#9", commitDate: "2024-01-01T00:00:00Z" }))).toEqual([]);
	});
	it("allows .env.example and the committed project.json", async () => {
		expect(failed(await run({ tree: [...TREE, ".env.example"] }))).toEqual([]);
	});
	it("does not accept the starter's own README, or one without what was hard", () => {
		expect(readmeOk("# Flisk task starter\n`flisk up`\n## What was hard\nx")).toBe(false);
		expect(readmeOk("# Mine\nRun `flisk up`.")).toBe(false);
		expect(readmeOk("# Mine\nRun `flisk up`.\n## Friction\nports")).toBe(true);
	});
	it("fails a repository that is not a fork of the starter", async () => {
		expect(failed(await run({ parent: null }))).toEqual(["fork"]);
		expect(failed(await run({ parent: "someone/else" }))).toEqual(["fork"]);
	});
	it("needs Vision, Not now and an ICE table with three scored items", () => {
		expect(roadmapOk(goodRoadmap)).toBe(true);
		expect(roadmapOk(goodRoadmap.replace("## Not now\nKubernetes export.", ""))).toBe(false);
		expect(roadmapOk("## Vision\nx\n## Next 6 months\n1. A\n2. B\n3. C\n## Not now\ny")).toBe(false);
	});
	it("counts only rows with Impact, Confidence and Ease scored 1 to 10", () => {
		expect(iceRows(ICE)).toBe(3);
		expect(iceRows(ICE.replace("| 8 | 7 | 9 |", "| high | 7 | 9 |"))).toBe(2);
		expect(iceRows(ICE.replace("| 8 | 7 | 9 |", "| 11 | 7 | 9 |"))).toBe(2);
		expect(iceRows("| Item | Score |\n|---|---|\n| A | 9 |")).toBe(0);
	});
	it("accepts packaging or plans as the pricing heading", () => {
		expect(pitchOk("## Why teams switch\nx\n## Packaging\ny")).toBe(true);
		expect(pitchOk("## Why\nx")).toBe(false);
	});
	it("is not ready when the repo is older than the start date", async () => {
		const r = await run({ created: "2026-10-01T00:00:00Z" });
		expect(r.gate.started).toBe(false);
		expect(r.ready).toBe(false);
	});
	it("is not ready when a commit is after the deadline", async () => {
		const r = await run({ commitDate: "2026-11-05T00:00:01Z" });
		expect(r.gate.inTime).toBe(false);
		expect(r.ready).toBe(false);
	});
	it("puts the deadline at 23:59:59 UTC two days after the start", () => {
		expect(deadlineOf("2026-11-02")?.toISOString()).toBe("2026-11-04T23:59:59.000Z");
		expect(deadlineOf("not a date")).toBeNull();
	});
	it("reads ## sections and ignores # titles", () => {
		expect(sections("# Title\n## One\na\n## Two\nb").map((s) => s.title)).toEqual(["One", "Two"]);
	});
});
