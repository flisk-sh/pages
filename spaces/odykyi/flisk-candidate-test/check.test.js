// Tests for check.js: the scoring every candidate sees. Run with `bun test`.
import { describe, expect, it } from "bun:test";
import { deadlineOf, faultRows, labSections, runChecks } from "./check.js";

const LAB = "Real notes about what I did and what actually happened, with enough detail to be useful to a reader who has never seen this project before, including the numbers.";
const goodLog = `# Lab 1\n${LAB}\n# Lab 2\n${LAB}\n# Lab 3\n${LAB}\n| fault | symptom | command | fix | minutes |\n|---|---|---|---|---|\n| port | no reply | doctor | change port | 5 |\n| env | crash | logs | add var | 7 |\n| order | flaky | verify | depends | 9 |\n# Lab 4\n${LAB}`;
const goodGtm = "1. Post a real demo in the Claude Code community and answer every question.\n2. Claude Code, Cursor and Continue, because they already run MCP servers.\n3. Publish one worked example repository this week and ask five users to try it.";
const STARTER_TREE = [
	"README.md", ".flisk/project.json", "services/agents/agent/service.json", "services/agents/tools/service.json",
	"services/agents/agent-migrator/service.json", "services/agents/agent/tests/agent.test.ts", "services/agents/tools/tests/tools.test.ts",
];
// What `flisk resource my-api --type backend --stack agents --yes` creates, plus one test the candidate wrote.
const SCAFFOLD = ["services/agents/my-api/service.json", "services/agents/my-api/tests/my-api.test.ts"];
const OWN = [...SCAFFOLD, "services/agents/my-api/tests/routes.test.ts"];

function repo(over = {}) {
	const o = {
		tree: [...STARTER_TREE, ...OWN], log: goodLog, gtm: goodGtm, readme: "Built on https://flisk.sh, see https://github.com/flisk-sh/flisk",
		created: "2026-11-02T10:00:00Z", commitDate: "2026-11-03T10:00:00Z", signed: true, starred: true, prDate: "2026-11-03T09:00:00Z", ...over,
	};
	return async (u) => {
		const ok = (b) => ({ ok: true, json: async () => b, text: async () => b });
		if (u.includes("raw.githubusercontent")) {
			const f = u.split("/").pop();
			const body = { "README.md": o.readme, "LOG.md": o.log, "GTM.md": o.gtm }[f];
			return body ? ok(body) : { ok: false };
		}
		if (u.includes("/git/trees/")) return ok({ tree: o.tree.map((path) => ({ path })) });
		if (u.includes("/commits")) return ok([{ sha: "abcdef1234", commit: { message: `x${o.signed ? "\n\nSigned-off-by: A <a@b.c>" : ""}`, committer: { date: o.commitDate } } }]);
		if (u.includes("/starred")) return ok(o.starred ? [{ full_name: "flisk-sh/flisk" }] : []);
		if (u.includes("/search/issues")) return ok({ total_count: o.prDate ? 1 : 0, items: o.prDate ? [{ created_at: o.prDate }] : [] });
		return ok({ private: false, default_branch: "main", created_at: o.created, html_url: "https://github.com/u/r" });
	};
}
const run = (over, start = "2026-11-02") => runChecks({ user: "u", repo: "r", start }, repo(over));
const failed = (r) => r.rows.filter((x) => !x.ok).map((x) => x.key);

describe("a candidate who follows the instructions", () => {
	it("scores 100 and is accepted", async () => {
		const r = await run();
		expect(failed(r)).toEqual([]);
		expect(r.score).toBe(100);
		expect(r.accepted).toBe(true);
	});

	it("is not failed for committing .flisk/project.json, which the starter itself tracks", async () => {
		expect(failed(await run())).not.toContain("clean");
	});
});

describe("the starter and the scaffold alone are not enough", () => {
	it("passes system but fails tests until the candidate writes a test of their own", async () => {
		const r = await run({ tree: [...STARTER_TREE, ...SCAFFOLD] });
		expect(failed(r)).toEqual(["tests"]);
		expect(r.accepted).toBe(false);
	});
	it("fails system and tests until the candidate adds their own", async () => {
		const r = await run({ tree: STARTER_TREE });
		expect(failed(r)).toEqual(expect.arrayContaining(["system", "tests"]));
		expect(r.accepted).toBe(false);
	});
});

describe("each check", () => {
	it("clean fails for .env, node_modules and generated flisk files", async () => {
		for (const bad of [".env", "api/.env.local", "node_modules/x/index.js", ".flisk/.flisk-out/a.json", ".flisk/.project-id", ".flisk/smoke/run.json"])
			expect(failed(await run({ tree: [...STARTER_TREE, ...OWN, bad] }))).toContain("clean");
		expect(failed(await run({ tree: [...STARTER_TREE, ...OWN, ".env.example"] }))).not.toContain("clean");
	});
	it("log needs 120+ characters under every lab heading", async () => {
		expect(failed(await run({ log: goodLog.replace(LAB, "ok") }))).toContain("log");
		expect(failed(await run({ log: "# Lab 1\n# Lab 2\n# Lab 3\n# Lab 4" }))).toContain("log");
	});
	it("faults needs 3 rows with 5 columns", async () => {
		expect(failed(await run({ log: goodLog.replace(/\| env[^\n]*\n\| order[^\n]*\n/, "") }))).toContain("faults");
		expect(failed(await run({ log: goodLog.replaceAll("| 5 |", "|").replaceAll("| 7 |", "|").replaceAll("| 9 |", "|") }))).toContain("faults");
	});
	it("gtm needs three real numbered answers", async () => {
		expect(failed(await run({ gtm: "1. a\n2. b\n3. c" }))).toContain("gtm");
		expect(failed(await run({ gtm: goodGtm.split("\n").slice(0, 2).join("\n") }))).toContain("gtm");
	});
	it("signed fails when a commit is not signed off", async () => {
		expect(failed(await run({ signed: false }))).toContain("signed");
	});
	it("pr must be opened after the start date; star and README are required", async () => {
		expect(failed(await run({ prDate: "2026-10-01T00:00:00Z" }))).toContain("pr");
		expect(failed(await run({ prDate: null }))).toContain("pr");
		expect(failed(await run({ starred: false }))).toContain("star");
		expect(failed(await run({ readme: "nothing here" }))).toContain("readme");
	});
});

describe("the gate", () => {
	it("rejects a repo created before the start date or committed after the deadline", async () => {
		expect((await run({ created: "2026-10-30T00:00:00Z" })).accepted).toBe(false);
		expect((await run({ commitDate: "2026-11-05T00:00:00Z" })).accepted).toBe(false);
		expect((await run({ commitDate: "2026-11-04T23:00:00Z" })).accepted).toBe(true);
	});
	it("ends at 23:59:59 UTC on the second day after the start date", () => {
		expect(deadlineOf("2026-11-02")?.toISOString()).toBe("2026-11-04T23:59:59.000Z");
		expect(deadlineOf("nope")).toBeNull();
	});
});

describe("helpers", () => {
	it("labSections and faultRows read the log", () => {
		expect(Object.keys(labSections(goodLog))).toEqual(["1", "2", "3", "4"]);
		expect(faultRows(labSections(goodLog)[3])).toBe(3);
	});
});
