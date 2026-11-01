// End-to-end cases against the live pages.flisk.si, for both ways in: the CLI that the Claude skill runs (a pull
// request from your fork, so it needs `gh` signed in as you) and the one-click worker at publish.flisk.si. Each case
// publishes for real and every space it makes is taken down again. Run from services/app/web:
//
//   bun scripts/e2e.ts                     both paths, in parallel
//   bun scripts/e2e.ts --only one-click    the worker only (what .github/workflows/e2e.yml runs)
//   bun scripts/e2e.ts --only cli          the CLI only
//
// PAGES_CLI picks another copy of the CLI, such as the one an installed plugin ships. The worker allows 5 requests
// per address per hour and the one-click cases use 5, so run them at most once an hour from one machine.
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const top = execFileSync("git", ["rev-parse", "--show-toplevel"], {
	encoding: "utf8",
}).trim();
const CLI = process.env.PAGES_CLI ?? join(top, "bin", "pages.mjs");
const SITE = process.env.PAGES_ORIGIN ?? "https://pages.flisk.si";
const API = process.env.PUBLISH_ORIGIN ?? "https://publish.flisk.si";
const SLUG = "e2e-check";
const only = process.argv[process.argv.indexOf("--only") + 1];

const results: { name: string; ok: boolean }[] = [];
const started = Date.now();
const secs = (from: number) => `${Math.round((Date.now() - from) / 1000)} s`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function record(name: string, ok: boolean, note = "") {
	results.push({ name, ok });
	console.log(`${ok ? "✓" : "✗"} ${name}${note ? ` (${note})` : ""}`);
}

/** The CLI's exit code and everything it printed. Async, so the worker cases keep running meanwhile. */
async function cli(...args: string[]): Promise<{ code: number; out: string }> {
	try {
		const r = await promisify(execFile)(process.execPath, [CLI, ...args], {
			encoding: "utf8",
		});
		return { code: 0, out: r.stdout + r.stderr };
	} catch (e) {
		const err = e as { code?: number; stdout?: string; stderr?: string };
		return {
			code: typeof err.code === "number" ? err.code : 1,
			out: `${err.stdout ?? ""}${err.stderr ?? ""}`,
		};
	}
}

function folder(files: Record<string, string>): string {
	const dir = mkdtempSync(join(tmpdir(), "pages-e2e-"));
	for (const [name, body] of Object.entries(files))
		writeFileSync(join(dir, name), body);
	return dir;
}

/** Polls a page, past GitHub Pages' cache, until test(status, body) holds: the body, or null after about 3 minutes. */
async function until(
	url: string,
	test: (status: number, body: string) => boolean,
) {
	for (let i = 0; i < 60; i++) {
		const r = await fetch(`${url}?e2e=${Math.random()}`);
		const body = await r.text();
		if (test(r.status, body)) return body;
		await sleep(3000);
	}
	return null;
}

const page = (h1: string) =>
	`<!doctype html><html><head><meta charset="utf-8"><title>E2E check</title><meta name="description" content="A short-lived end-to-end test page."></head><body><h1>${h1}</h1><script>document.body.dataset.ran = "yes";</script></body></html>`;

async function viaCli() {
	const bad = folder({
		"index.html": `${page("bad")}<script src="https://evil.example/x.js"></script><input type="password">`,
	});
	const check = await cli("check", bad);
	record(
		"check refuses an unknown script host and a password field",
		check.code !== 0 &&
			/script-src/.test(check.out) &&
			/password/.test(check.out),
	);
	const refused = await cli("publish", bad, "--slug", SLUG);
	record(
		"publish stops a failing page before opening a pull request",
		refused.code !== 0 && !/Pull request:/.test(refused.out),
	);

	const login = (await cli("whoami")).out.trim();
	const url = `${SITE}/@${login}/${SLUG}/`;
	let from = Date.now();
	const first = await cli(
		"publish",
		folder({ "index.html": page("Version one") }),
		"--slug",
		SLUG,
		"--wait",
	);
	record(
		"publish answers ✓ Published",
		/Published version/.test(first.out),
		secs(from),
	);
	let body = await until(url, (s, b) => s === 200 && b.includes("Version one"));
	record("the page goes live", !!body, secs(from));
	record(
		"the page gets the policy and the corner bar",
		!!body &&
			body.includes("Content-Security-Policy") &&
			body.includes("data-pages-bar"),
	);
	record(
		`the space is listed on @${login}`,
		!!(await until(
			`${SITE}/@${login}/`,
			(s, b) => s === 200 && b.includes(SLUG),
		)),
	);

	from = Date.now();
	const second = await cli(
		"publish",
		folder({ "index.html": page("Version two") }),
		"--slug",
		SLUG,
		"--wait",
	);
	body = await until(url, (s, b) => s === 200 && b.includes("Version two"));
	record(
		"the same slug publishes version 2",
		/Published version 2/.test(second.out) && !!body && body.includes(">v2<"),
		secs(from),
	);
	const same = await cli(
		"publish",
		folder({ "index.html": page("Version two") }),
		"--slug",
		SLUG,
		"--wait",
	);
	record(
		"an unchanged folder publishes nothing",
		/Nothing changed/.test(same.out),
	);

	from = Date.now();
	await cli("remove", SLUG);
	record(
		"remove takes it down",
		(await until(url, (s) => s === 404)) !== null,
		secs(from),
	);

	// An index.md that links a sibling page: the link must open the page on this site, not a GitHub blob.
	const linkSlug = `${SLUG}-links`;
	const linkUrl = `${SITE}/@${login}/${linkSlug}/`;
	await cli(
		"publish",
		folder({
			"index.md": "# E2E links\n\nSee the [report](report.html).\n",
			"report.html": page("The linked report"),
		}),
		"--slug",
		linkSlug,
		"--wait",
	);
	const md = await until(
		linkUrl,
		(s, b) => s === 200 && b.includes("E2E links"),
	);
	const href = md?.match(/href="([^"]*report\.html)"/)?.[1];
	record(
		"a relative link in index.md stays on pages.flisk.si",
		href === `${linkUrl}report.html`,
		href,
	);
	const linked = href ? await fetch(href) : undefined;
	record(
		"the linked page opens with the corner bar",
		linked?.status === 200 && (await linked.text()).includes("data-pages-bar"),
	);
	await cli("remove", linkSlug);
}

async function oneClick() {
	const send = (method: string, path: string, body?: object, token?: string) =>
		fetch(`${API}${path}`, {
			method,
			headers: {
				"content-type": "application/json",
				...(token ? { authorization: `Bearer ${token}` } : {}),
			},
			body: body ? JSON.stringify(body) : undefined,
		});

	const bad = await send("POST", "/v1/spaces", {
		markdown: "# hi\n<script>alert(1)</script>",
	});
	record("the worker refuses Markdown with a script", bad.status === 400);

	let from = Date.now();
	const r = await send("POST", "/v1/spaces", {
		markdown: "# E2E one-click\n\nFirst **version**.",
		source: "e2e",
	});
	if (r.status !== 202)
		return record("the worker accepts Markdown", false, `HTTP ${r.status}`);
	const space = (await r.json()) as { id: string; url: string; token: string };
	const path = `/v1/spaces/${space.id}`;
	try {
		let body = await until(
			space.url,
			(s, b) => s === 200 && b.includes("First"),
		);
		record("one-click Markdown goes live", !!body, secs(from));
		record(
			"it is rendered to HTML",
			!!body && body.includes("<strong>version</strong>"),
		);
		record(
			"it runs no scripts (script-src 'none')",
			!!body && body.includes("script-src 'none'"),
		);

		// The worker accepts any well-formed key; the workflow compares it and refuses. Give that run time to finish.
		const wrong = await send("DELETE", path, undefined, "0".repeat(48));
		await sleep(30_000);
		const still = await fetch(`${space.url}?e2e=${Math.random()}`);
		record(
			"a wrong key deletes nothing",
			wrong.status === 202 && still.status === 200,
		);

		from = Date.now();
		await send(
			"PUT",
			path,
			{ cv: { me: "bun3,docker2,kubernetes1", name: "E2E Tester" } },
			space.token,
		);
		body = await until(
			space.url,
			(s, b) => s === 200 && b.includes("E2E Tester"),
		);
		record(
			"an update with the key replaces it with a CV",
			!!body && !body.includes("First"),
			secs(from),
		);
	} finally {
		from = Date.now();
		await send("DELETE", path, undefined, space.token);
		record(
			"a delete with the key takes it down",
			(await until(space.url, (s) => s === 404)) !== null,
			secs(from),
		);
	}
}

await Promise.all([
	only === "one-click" ? null : viaCli(),
	only === "cli" ? null : oneClick(),
]);
const failed = results.filter((r) => !r.ok).length;
console.log(
	`\n${results.length - failed}/${results.length} passed in ${secs(started)}`,
);
process.exit(failed ? 1 : 0);
