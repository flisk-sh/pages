// The anonymous publish, run by .github/workflows/publish-anon.yml for each repository_dispatch that
// publish.flisk.si sends. The payload is read from GITHUB_EVENT_PATH, never interpolated into a shell:
//   {op: "publish" | "update" | "delete", id, hash, markdown?, cv?: {me, name}, source?}
// or, for a visitor who signed in with GitHub (the worker checked who they are):
//   {op: "save" | "remove", owner: <login>, cv?: {me, name}}   → the branch space/<owner>/cv, no key needed
// or, from a GitHub Actions job whose OIDC token the worker checked (owner is the repository's owner):
//   {op: "ci", owner, slug, blob, source}   → the branch space/<owner>/<slug>; the files are the blob, a JSON list of
//   {path, base64} the worker stored in this repository
//   {op: "ci-remove", owner, slug, source}   → deletes the branch space/<owner>/<slug>
// A space is the branch space/anon/<id>: an index.md, or a developer CV that src/cv.ts builds here from roadmap's
// ratings string and roadmap's own data, so no visitor's markup is ever published. Its commits carry `Pages-Edit-Hash: <sha256 of the
// visitor's key>`; update and delete go through only when the hash matches the one on the branch.
import { execFileSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSpace, formatReport, validId } from "../src/check.mjs";
import {
	cleanName,
	cvPage,
	ME_PATTERN,
	parseMe,
	type RoadmapData,
} from "../src/cv";

const ROADMAP = "https://roadmap.flisk.si";

export interface Payload {
	op: string;
	id: string;
	hash: string;
	owner?: string;
	slug?: string;
	blob?: string;
	markdown?: string;
	cv?: { me: string; name?: string };
	source?: string;
}

/** Why a payload cannot be acted on, or "" when it can. */
export function invalid(p: Partial<Payload>): string {
	if (p.op === "ci" || p.op === "ci-remove") {
		if (!validId(p.owner ?? "", p.slug ?? "") || p.owner === "anon")
			return "bad owner or slug";
		if (p.op === "ci-remove") return "";
		return /^[a-f0-9]{40}$/.test(p.blob ?? "") ? "" : "bad blob";
	}
	if (p.op === "save" || p.op === "remove") {
		if (!/^[a-z0-9](?:[a-z0-9-]{0,38})$/.test(p.owner ?? ""))
			return "bad owner";
		if (p.op === "remove") return "";
		if (!p.cv) return "no cv";
	} else {
		if (!["publish", "update", "delete"].includes(p.op ?? ""))
			return "unknown op";
		if (!/^[a-z0-9]{10}$/.test(p.id ?? "")) return "bad id";
		if (!/^[a-f0-9]{64}$/.test(p.hash ?? "")) return "bad hash";
		if (p.op === "delete") return "";
	}
	if (p.cv !== undefined) {
		if (typeof p.cv?.me !== "string" || !ME_PATTERN.test(p.cv.me))
			return "bad ratings";
		if (p.cv.name !== undefined && typeof p.cv.name !== "string")
			return "bad name";
		return "";
	}
	if (typeof p.markdown !== "string" || !p.markdown.trim())
		return "no markdown";
	return "";
}

const PART = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

/** Writes the files a workflow sent ({path, base64} each) into dir. Paths are checked again: nothing outside dir. */
export function writeFiles(dir: string, files: unknown) {
	if (!Array.isArray(files) || !files.length)
		throw new Error("refused: no files");
	for (const f of files as { path?: unknown; base64?: unknown }[]) {
		const path = typeof f?.path === "string" ? f.path : "";
		const parts = path.split("/");
		if (!parts.every((part) => PART.test(part)) || typeof f.base64 !== "string")
			throw new Error(`refused: bad file ${path.slice(0, 120)}`);
		mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true });
		writeFileSync(join(dir, ...parts), Buffer.from(f.base64, "base64"), {
			flag: "wx",
		});
	}
}

/** The files the worker stored as a blob of this repository. */
async function blobFiles(sha: string): Promise<unknown> {
	const res = await fetch(
		`https://api.github.com/repos/${process.env.REPO}/git/blobs/${sha}`,
		{
			headers: {
				authorization: `Bearer ${process.env.GH_TOKEN}`,
				accept: "application/vnd.github.raw+json",
			},
		},
	);
	if (!res.ok) throw new Error(`blob ${sha} answered ${res.status}`);
	return JSON.parse(await res.text());
}

/** The edit hash a branch's newest commit message carries, or "". */
export function hashIn(message: string): string {
	return message.match(/^Pages-Edit-Hash: ([a-f0-9]{64})$/m)?.[1] ?? "";
}

const top = execFileSync("git", ["rev-parse", "--show-toplevel"], {
	encoding: "utf8",
}).trim();
const run = (args: string[], env: Record<string, string> = {}) =>
	execFileSync("git", args, {
		cwd: top,
		encoding: "utf8",
		env: { ...process.env, ...env },
	}).trim();

/** The CV page and its logos, from roadmap's live data. */
async function writeCv(
	dir: string,
	cv: { me: string; name?: string },
	url: string,
) {
	const get = async (path: string) => {
		const res = await fetch(`${ROADMAP}${path}`);
		if (!res.ok) throw new Error(`${path} answered ${res.status}`);
		return res;
	};
	const data = (await (await get("/assets/data.json")).json()) as RoadmapData;
	const q = new URLSearchParams({ me: cv.me });
	const name = cleanName(cv.name ?? "");
	if (name) q.set("name", name);
	const { html, logos } = cvPage(data, parseMe(cv.me), name, {
		portfolio: `${ROADMAP}/portfolio/?${q}`,
		radar: `${ROADMAP}/radar/?${q}`,
		url,
	});
	writeFileSync(join(dir, "index.html"), html);
	mkdirSync(join(dir, "logos"));
	for (const file of logos)
		if (/^[a-z0-9-]+\.(svg|png)$/.test(file))
			writeFileSync(
				join(dir, "logos", file),
				new Uint8Array(
					await (await get(`/assets/logos/${file}`)).arrayBuffer(),
				),
			);
}

async function main() {
	const event = JSON.parse(
		readFileSync(process.env.GITHUB_EVENT_PATH as string, "utf8"),
	);
	const p = (event.client_payload ?? {}) as Payload;
	const why = invalid(p);
	if (why) throw new Error(`refused: ${why}`);
	const fromCi = p.op === "ci" || p.op === "ci-remove";
	const signedIn = p.op === "save" || p.op === "remove" || fromCi;
	const handle = fromCi
		? `${p.owner}/${p.slug}`
		: signedIn
			? `${p.owner}/cv`
			: `anon/${p.id}`;
	const branch = `space/${handle}`;
	let parent = "";
	try {
		run([
			"fetch",
			"--no-tags",
			"origin",
			`+refs/heads/${branch}:refs/pages/anon`,
		]);
		parent = run(["rev-parse", "refs/pages/anon"]);
	} catch {}

	if (p.op === "publish" && parent)
		throw new Error(`refused: ${branch} already exists`);
	if (!signedIn && p.op !== "publish") {
		if (!parent) throw new Error(`refused: no space ${p.id}`);
		if (hashIn(run(["log", "-1", "--format=%B", parent])) !== p.hash)
			throw new Error("refused: wrong key");
	}

	if (p.op === "delete" || p.op === "remove" || p.op === "ci-remove") {
		if (parent) run(["push", "origin", "--delete", branch]);
		console.log(`removed @${handle}`);
	} else {
		const work = mkdtempSync(join(tmpdir(), "anon-"));
		try {
			const dir = join(work, "space");
			mkdirSync(dir);
			if (p.cv) await writeCv(dir, p.cv, `https://pages.flisk.si/@${handle}/`);
			else if (fromCi) writeFiles(dir, await blobFiles(p.blob as string));
			else writeFileSync(join(dir, "index.md"), p.markdown as string);
			const result = checkSpace(dir);
			console.log(formatReport(result));
			if (!result.ok) throw new Error("refused: the check failed");
			const index = join(work, "index");
			run(["--work-tree", dir, "add", "-A", dir], { GIT_INDEX_FILE: index });
			const tree = run(["write-tree"], { GIT_INDEX_FILE: index });
			const source = (p.source ?? "")
				.replace(/[^\w./:?=&%-]/g, "")
				.slice(0, 200);
			const message = [
				`${p.op === "publish" || !parent ? "Publish" : "Update"} @${handle}`,
				"",
				...(source ? [`Source: ${source}`] : []),
				...(signedIn ? [] : [`Pages-Edit-Hash: ${p.hash}`]),
			].join("\n");
			const who = {
				GIT_AUTHOR_NAME: signedIn ? (p.owner as string) : "pages anonymous",
				GIT_AUTHOR_EMAIL: signedIn
					? `${p.owner}@users.noreply.github.com`
					: "anon@pages.flisk.si",
				GIT_COMMITTER_NAME: "github-actions[bot]",
				GIT_COMMITTER_EMAIL:
					"41898282+github-actions[bot]@users.noreply.github.com",
			};
			const commit = run(
				["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", message],
				who,
			);
			run(["push", "origin", `${commit}:refs/heads/${branch}`]);
			console.log(`published @${handle} at ${commit}`);
		} finally {
			rmSync(work, { recursive: true, force: true });
		}
	}
	// A push with the workflow's token starts no other workflow, so the deploy is started by name, unless the
	// workflow deploys right after this (DEPLOY_HERE).
	if (process.env.DEPLOY_HERE) return;
	execFileSync(
		"gh",
		[
			"workflow",
			"run",
			"deploy.yml",
			"-R",
			process.env.REPO as string,
			"--ref",
			"main",
		],
		{ stdio: "inherit" },
	);
}

if (import.meta.main) await main();
