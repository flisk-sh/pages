// Tests for check.js: the self-check every candidate sees. Run with `bun test`.
import { describe, expect, it } from "bun:test";
import { crossRef, deadlineOf, mentions, pitchOk, readmeOk, runChecks, sections } from "./check.js";

const goodPitch = "## Why Flisk\nOne command instead of a Compose file per service.\n## Pricing\nFree CLI, paid team plan.";
const goodReadme = "# Voting app on Flisk\n\nRun it: `flisk up`\n\n## What was hard\nThe worker started before Postgres.";
const TREE = ["LICENSE", "NOTICE", ".flisk/project.json", "services/api/service.json", "services/web/service.json", "README.md", "PITCH.md"];

function repo(over = {}) {
	const o = {
		tree: TREE, readme: goodReadme, pitch: goodPitch, issues: [{ title: "idea", body: "Agents need a reset command. Signal: fewer support threads." }], searches: [], contacted: 0, commitMessage: "Convert to Flisk",
		created: "2026-11-02T10:00:00Z", commitDate: "2026-11-03T10:00:00Z", runs: [], ...over,
	};
	return async (u) => {
		const ok = (b) => ({ ok: true, json: async () => b, text: async () => b });
		if (u.includes("raw.githubusercontent")) {
			const body = { "README.md": o.readme, "PITCH.md": o.pitch }[u.split("/").pop()];
			return body ? ok(body) : { ok: false };
		}
		if (u.includes("/git/trees/")) return ok({ tree: o.tree.map((path) => ({ path })) });
		if (u.includes("/commits")) return ok([{ sha: "abcdef1234", commit: { message: o.commitMessage, committer: { date: o.commitDate } } }]);
		if (u.includes("/search/issues")) {
			o.searches.push(decodeURIComponent(u.split("q=")[1]));
			return o.contacted === "error" ? { ok: false, status: 403 } : ok({ total_count: o.contacted });
		}
		if (u.includes("/issues")) return ok(o.issues);
		if (u.includes("/actions/runs")) return ok({ workflow_runs: o.runs });
		return ok({ private: false, fork: !!o.fork, template_repository: o.template === null ? null : { full_name: o.template || "flisk-sh/flisk-task-starter" }, default_branch: "main", created_at: o.created, html_url: "https://github.com/u/r" });
	};
}
const run = (over, start = "2026-11-02") => runChecks({ user: "u", repo: "r", start }, repo(over));
const failed = (r) => r.rows.filter((x) => !x.ok).map((x) => x.key);

describe("a complete submission", () => {
	it("is ready for review", async () => {
		const r = await run();
		expect(failed(r)).toEqual([]);
		expect(r.ready).toBe(true);
		expect(r.done).toBe(11);
	});
	it("reports CI as a bonus, never as a requirement", async () => {
		expect((await run({ runs: [{ conclusion: "failure", html_url: "x" }] })).ready).toBe(true);
		expect((await run({ runs: [{ conclusion: "success", html_url: "x" }] })).ci).toEqual({ ok: true, url: "x" });
		expect((await run()).ci).toBeNull();
	});
});

describe("bad: missing or hollow parts", () => {
	it("fails an empty repository on every part", async () => {
		const r = await run({ tree: [], readme: "", pitch: "", issues: [], template: null });
		expect(failed(r)).toEqual(["template", "stack", "readme", "idea", "pitch", "license"]);
		expect(r.ready).toBe(false);
	});
	it("fails a single service: a conversion means at least two", async () => {
		expect(failed(await run({ tree: ["LICENSE", "NOTICE", ".flisk/project.json", "service.json"] }))).toEqual(["stack"]);
	});
	it("fails a fork: candidates copy the example app, they never fork it", async () => {
		expect(failed(await run({ fork: true }))).toEqual(["own"]);
	});
	it("fails a pull request counted as the product idea", async () => {
		expect(failed(await run({ issues: [{ pull_request: {} }] }))).toEqual(["idea"]);
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
	it("fails an issue that @mentions someone", async () => {
		expect(failed(await run({ issues: [{ title: "idea", body: "cc @maintainer what do you think" }] }))).toEqual(["mentions"]);
	});
	it("fails an issue or a new commit that links another project's issue", async () => {
		expect(failed(await run({ issues: [{ title: "idea", body: "like https://github.com/org1/app/issues/1" }] }))).toEqual(["crossrefs"]);
		expect(failed(await run({ commitMessage: "inspired by org1/app#12" }))).toEqual(["crossrefs"]);
	});
	it("fails a dropped LICENSE or NOTICE", async () => {
		expect(failed(await run({ tree: TREE.filter((f) => f !== "LICENSE") }))).toEqual(["license"]);
		expect(failed(await run({ tree: TREE.filter((f) => f !== "NOTICE") }))).toEqual(["license"]);
	});
});

describe("in between: almost right", () => {
	it("allows package scopes, code and emails that are not mentions", () => {
		expect(mentions("run npx @flisk-sh/flisk up")).toBe(false);
		expect(mentions("use `@alice` in code")).toBe(false);
		expect(mentions("write to a@b.co")).toBe(false);
		expect(mentions("thanks @alice")).toBe(true);
	});
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
	it("fails a repository not created from the starter template", async () => {
		expect(failed(await run({ template: null }))).toEqual(["template"]);
		expect(failed(await run({ template: "someone/else" }))).toEqual(["template"]);
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
