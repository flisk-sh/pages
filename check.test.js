// Tests for check.js: the 0 to 100 self-check every candidate sees. Run with `bun test`.
import { describe, expect, it } from "bun:test";
import { crossRef, deadlineOf, iceTable, ROWS, runChecks, scoreReadme, scoreRoadmap, sections } from "./check.js";

const HEAD = "| Item | Who it is for | Impact | Confidence | Ease | ICE | Number to watch |\n|---|---|---|---|---|---|---|";
const ICE = `${HEAD}\n| One-command reset | agent teams | 8 | 7 | 9 | 504 | median minutes to a clean run |\n| Health dashboard | platform teams | 9 | 6 | 5 | 270 | share of stacks that start first time |\n| Remote cache | CI users | 7 | 5 | 4 | 140 | seconds saved per cold start |`;
const VISION = "Flisk becomes the default way any team, and any coding agent, starts a full local stack with one command and never thinks about setup again.";
const roadmap = (o = {}) => `## Vision\n${o.vision ?? VISION}\n## Next 6 months\n${o.ice ?? ICE}\n## Not now\n${o.notnow ?? "Kubernetes export, because it pulls us into production tooling before local is solved."}`;
const README = "# Voting app on Flisk\n\nRun it: `flisk up`\n\n## What was hard\nThe worker started before Postgres.\nRedis had no health check.\nTraefik answered 404 until the services were healthy.";
const SERVICES = ["db", "redis", "vote", "result", "worker"].map((s) => `services/${s}/service.json`);
const TREE = ["LICENSE", "NOTICE", "ROADMAP.md", "README.md", ".flisk/project.json", ...SERVICES];

function repo(over = {}) {
	const o = {
		tree: TREE, readme: README, roadmap: roadmap(), searches: [], contacted: 0, commitMessage: "Convert to Flisk",
		created: "2026-11-02T10:00:00Z", commitDate: "2026-11-03T10:00:00Z", runs: [], ...over,
	};
	return async (u) => {
		const ok = (b) => ({ ok: true, json: async () => b, text: async () => b });
		if (u.includes("raw.githubusercontent")) {
			const body = { "README.md": o.readme, "ROADMAP.md": o.roadmap }[u.split("/").pop()];
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
const pts = (r, key) => r.rows.find((x) => x.key === key).points;
const lost = (r) => r.rows.filter((x) => !x.ok).map((x) => `${x.key}:${x.points}/${x.max}`);

describe("the scale", () => {
	it("adds up to 100: technical 50, product 40, conduct 10", () => {
		expect(ROWS.reduce((n, r) => n + r[3], 0)).toBe(100);
		for (const [g, max] of [["technical", 50], ["product", 40], ["conduct", 10]]) expect(ROWS.filter((r) => r[1] === g).reduce((n, r) => n + r[3], 0)).toBe(max);
	});
});

describe("good: a complete submission", () => {
	it("scores 100 and is ready", async () => {
		const r = await run();
		expect(lost(r)).toEqual([]);
		expect(r.score).toBe(100);
		expect(r.parts).toEqual({ technical: 50, product: 40, conduct: 10 });
		expect(r.status).toBe("ready");
		expect(r.ready).toBe(true);
	});
	it("gives the same score every time", async () => {
		const [a, b] = [await run({ tree: SERVICES.slice(0, 3) }), await run({ tree: SERVICES.slice(0, 3) })];
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});
	it("reports CI as a bonus, never in the score", async () => {
		const r = await run({ runs: [{ conclusion: "failure", html_url: "x" }] });
		expect(r.score).toBe(100);
		expect(r.ci).toEqual({ ok: false, url: "x" });
		expect((await run()).ci).toBeNull();
	});
});

describe("in between: partial credit", () => {
	it("gives 4 points per service, so 3 of 5 services is 12 of 20", async () => {
		const r = await run({ tree: ["LICENSE", "NOTICE", ".flisk/project.json", ...SERVICES.slice(0, 3)] });
		expect(pts(r, "stack")).toBe(12);
		expect(r.score).toBe(92);
		expect(r.ready).toBe(true);
	});
	it("gives no stack points without .flisk/project.json, and caps at 5 services", async () => {
		expect(pts(await run({ tree: ["LICENSE", "NOTICE", ...SERVICES] }), "stack")).toBe(0);
		expect(pts(await run({ tree: [...TREE, "services/extra/service.json"] }), "stack")).toBe(20);
	});
	it("is not ready at 79 and ready at exactly 80", async () => {
		const low = await run({ tree: ["LICENSE", "NOTICE", ".flisk/project.json", SERVICES[0]], roadmap: roadmap({ notnow: "no" }) });
		expect(low.score).toBe(79);
		expect(low.ready).toBe(false);
		const edge = await run({ tree: ["LICENSE", "NOTICE", ...SERVICES] });
		expect(edge.score).toBe(80);
		expect(edge.ready).toBe(true);
	});
	it("allows .env.example, the committed project.json and old upstream commits", async () => {
		expect((await run({ tree: [...TREE, ".env.example"] })).score).toBe(100);
		const old = await run({ commitMessage: "upstream: see dockersamples/example-voting-app#9", commitDate: "2026-10-01T00:00:00Z" });
		expect(pts(old, "crossrefs")).toBe(5);
	});
	it("counts a README with 2 lines of friction as not enough", () => {
		expect(scoreReadme("# Mine\n`flisk up`\n## Friction\nports\nstart order")).toBe(0);
		expect(scoreReadme("# Mine\n`flisk up`\n## Friction\nports\nstart order\nhealth paths")).toBe(10);
	});
});

describe("bad: missing or hollow parts", () => {
	it("scores an empty repository 15: only the things that cannot be missing", async () => {
		const r = await run({ tree: [], readme: "", roadmap: "", parent: null });
		expect(r.score).toBe(15);
		expect(r.rows.filter((x) => x.points).map((x) => x.key)).toEqual(["clean", "crossrefs", "contact"]);
		expect(r.status).toBe("not-ready");
	});
	it("does not take the starter's own README", () => {
		expect(scoreReadme("# Flisk task starter\n`flisk up`\n## What was hard\na\nb\nc")).toBe(0);
		expect(scoreReadme("# Mine\nRun it.\n## What was hard\na\nb\nc")).toBe(0);
	});
	it("does not take the template of ROADMAP.md with capitals left in", async () => {
		const tpl = roadmap({ vision: "WHERE FLISK IS GOING, IN ONE OR TWO SENTENCES OF YOUR OWN, AND SOME MORE WORDS HERE TO PAD THIS OUT TO TWENTY WORDS", notnow: "ONE THING FLISK SHOULD NOT BUILD YET, AND WHY, WITH EXTRA WORDS" });
		expect(scoreRoadmap(tpl)).toMatchObject({ vision: 0, notnow: 0 });
	});
	it("does not count the template's table rows as scored", () => {
		expect(iceTable(`${HEAD}\n| ITEM | WHO | 1-10 | 1-10 | 1-10 | I×C×E | METRIC |`)).toEqual([]);
	});
	it("gives ICE points per scored row and no math or watch points under 3 rows", () => {
		const two = ICE.split("\n").slice(0, 4).join("\n");
		expect(scoreRoadmap(roadmap({ ice: two }))).toMatchObject({ ice: 10, math: 0, watch: 0 });
		expect(scoreRoadmap(roadmap({ ice: "1. A\n2. B\n3. C" }))).toMatchObject({ ice: 0, math: 0, watch: 0 });
	});
	it("takes 5 for wrong ICE arithmetic and 5 for rows that are not sorted", () => {
		expect(scoreRoadmap(roadmap({ ice: ICE.replace("| 504 |", "| 999 |") })).math).toBe(5);
		const unsorted = ICE.split("\n");
		[unsorted[3], unsorted[4]] = [unsorted[4], unsorted[3]];
		expect(scoreRoadmap(roadmap({ ice: unsorted.join("\n") })).math).toBe(5);
		expect(scoreRoadmap(roadmap({ ice: ICE.replace("| 504 |", "| 999 |").replace("| 270 |", "| 1 |") })).math).toBe(0);
	});
	it("takes the watch points for a placeholder or an empty cell", () => {
		expect(scoreRoadmap(roadmap({ ice: ICE.replace("seconds saved per cold start", "TBD") })).watch).toBe(0);
		expect(scoreRoadmap(roadmap({ ice: ICE.replace("seconds saved per cold start", "") })).watch).toBe(0);
	});
	it("reads scores only as whole numbers from 1 to 10", () => {
		for (const bad of ["0", "11", "7.5", "high", ""]) expect(iceTable(`${HEAD}\n| A | b | ${bad} | 7 | 9 | 504 | x |`)).toEqual([]);
	});
	it("fails committed secrets, dependencies and generated files", async () => {
		for (const f of [".env", "api/.env.local", "node_modules/x/index.js", ".flisk/.flisk-out/a"]) {
			const r = await run({ tree: [...TREE, f] });
			expect(pts(r, "clean")).toBe(0);
			expect(r.score).toBe(95);
			expect(r.ready).toBe(false);
		}
	});
	it("throws a readable error for a private or missing repository", async () => {
		await expect(runChecks({ user: "u", repo: "r", start: "2026-11-02" }, async () => ({ ok: false, status: 404 }))).rejects.toThrow("404");
	});
});

describe("bad: harm that multiplies with every candidate", () => {
	it("is not ready, whatever the score, after an issue or PR on the starter, Flisk or the original app", async () => {
		const o = { contacted: 1, searches: [] };
		const r = await run(o);
		expect(r.score).toBe(95);
		expect(r.ready).toBe(false);
		expect(o.searches[0]).toContain("author:u created:>=2026-11-02");
		for (const x of ["flisk-sh/flisk-task-starter", "dockersamples/example-voting-app", "flisk-sh/flisk", "flisk-sh/pages"]) expect(o.searches[0]).toContain(`repo:${x}`);
	});
	it("is not ready when GitHub refuses the search, and says so", async () => {
		const r = await run({ contacted: "error" });
		expect(r.contactUnknown).toBe(true);
		expect(pts(r, "contact")).toBe(0);
		expect(r.ready).toBe(false);
	});
	it("is not ready after a new commit that links another project's issue", async () => {
		const r = await run({ commitMessage: "inspired by org1/app#12" });
		expect(pts(r, "crossrefs")).toBe(0);
		expect(r.ready).toBe(false);
	});
	it("is not ready without the LICENSE or the NOTICE", async () => {
		for (const f of ["LICENSE", "NOTICE"]) {
			const r = await run({ tree: TREE.filter((x) => x !== f) });
			expect(pts(r, "license")).toBe(0);
			expect(r.ready).toBe(false);
		}
	});
	it("is not ready for a repository that is not a fork of the starter", async () => {
		for (const parent of [null, "someone/else"]) {
			const r = await run({ parent });
			expect(pts(r, "fork")).toBe(0);
			expect(r.ready).toBe(false);
		}
	});
});

describe("gates: eligibility is not points", () => {
	it("is not eligible when the repository is older than the start date", async () => {
		const r = await run({ created: "2026-10-01T00:00:00Z" });
		expect(r.score).toBe(100);
		expect(r.gate.started).toBe(false);
		expect(r.status).toBe("not-eligible");
		expect(r.ready).toBe(false);
	});
	it("is not eligible when a commit is after the deadline", async () => {
		const r = await run({ commitDate: "2026-11-05T00:00:01Z" });
		expect(r.gate.inTime).toBe(false);
		expect(r.status).toBe("not-eligible");
	});
	it("puts the deadline at 23:59:59 UTC two days after the start", () => {
		expect(deadlineOf("2026-11-02")?.toISOString()).toBe("2026-11-04T23:59:59.000Z");
		expect(deadlineOf("not a date")).toBeNull();
	});
});

describe("helpers", () => {
	it("allows references to the candidate's own issues", () => {
		expect(crossRef("fixes #3 and u/r#4 and https://github.com/u/r/issues/5", "u/r")).toBe(false);
		expect(crossRef("see https://github.com/a/b/issues/3", "u/r")).toBe(true);
	});
	it("reads ## sections and ignores # titles", () => {
		expect(sections("# Title\n## One\na\n## Two\nb").map((s) => s.title)).toEqual(["One", "Two"]);
	});
});
