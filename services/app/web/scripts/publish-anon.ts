// The anonymous publish, run by .github/workflows/publish-anon.yml for each repository_dispatch that
// publish.flisk.si sends. The payload is read from GITHUB_EVENT_PATH, never interpolated into a shell:
//   {op: "publish" | "update" | "delete", id, hash, markdown?, source?}
// A space is the branch space/anon/<id> with one file, index.md. Its commits carry `Pages-Edit-Hash: <sha256 of the
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
import { checkSpace, formatReport } from "../src/check.mjs";

export interface Payload {
	op: string;
	id: string;
	hash: string;
	markdown?: string;
	source?: string;
}

/** Why a payload cannot be acted on, or "" when it can. */
export function invalid(p: Partial<Payload>): string {
	if (!["publish", "update", "delete"].includes(p.op ?? ""))
		return "unknown op";
	if (!/^[a-z0-9]{10}$/.test(p.id ?? "")) return "bad id";
	if (!/^[a-f0-9]{64}$/.test(p.hash ?? "")) return "bad hash";
	if (
		p.op !== "delete" &&
		(typeof p.markdown !== "string" || !p.markdown.trim())
	)
		return "no markdown";
	return "";
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

function main() {
	const event = JSON.parse(
		readFileSync(process.env.GITHUB_EVENT_PATH as string, "utf8"),
	);
	const p = (event.client_payload ?? {}) as Payload;
	const why = invalid(p);
	if (why) throw new Error(`refused: ${why}`);
	const branch = `space/anon/${p.id}`;
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
	if (p.op !== "publish") {
		if (!parent) throw new Error(`refused: no space ${p.id}`);
		if (hashIn(run(["log", "-1", "--format=%B", parent])) !== p.hash)
			throw new Error("refused: wrong key");
	}

	if (p.op === "delete") {
		run(["push", "origin", "--delete", branch]);
		console.log(`removed @anon/${p.id}`);
	} else {
		const work = mkdtempSync(join(tmpdir(), "anon-"));
		try {
			const dir = join(work, "space");
			mkdirSync(dir);
			writeFileSync(join(dir, "index.md"), p.markdown as string);
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
				`${p.op === "publish" ? "Publish" : "Update"} @anon/${p.id}`,
				"",
				...(source ? [`Source: ${source}`] : []),
				`Pages-Edit-Hash: ${p.hash}`,
			].join("\n");
			const who = {
				GIT_AUTHOR_NAME: "pages anonymous",
				GIT_AUTHOR_EMAIL: "anon@pages.flisk.si",
				GIT_COMMITTER_NAME: "github-actions[bot]",
				GIT_COMMITTER_EMAIL:
					"41898282+github-actions[bot]@users.noreply.github.com",
			};
			const commit = run(
				["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", message],
				who,
			);
			run(["push", "origin", `${commit}:refs/heads/${branch}`]);
			console.log(`published @anon/${p.id} at ${commit}`);
		} finally {
			rmSync(work, { recursive: true, force: true });
		}
	}
	// A push with the workflow's token starts no other workflow, so the deploy is started by name.
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

if (import.meta.main) main();
