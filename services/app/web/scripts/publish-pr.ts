// The publish step, run by .github/workflows/publish.yml for every pull request to main. A pull request that only
// touches spaces/<login>/<slug>/ is a publish: its folder is read as data (never run), checked, and committed to the
// branch space/<login>/<slug>, then the pull request is closed with the link. A pull request that touches no space is
// ordinary code and is left alone.
//
// Runs from a checkout of main, so this file and the check are ours, not the pull request's. Needs GH_TOKEN, REPO,
// PR (the number), and EVENT_LABEL (the label just added, when the event is "labeled").
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSpace, formatReport, validId } from "../src/check.mjs";
import { SITE } from "../src/site";

const MARK = "<!-- pages-publish -->";
const env = (name: string) => {
	const v = process.env[name];
	if (!v) throw new Error(`${name} is not set`);
	return v;
};
// Every git command runs from the top of the checkout: git archive in a subfolder would read only that subfolder.
const top = execFileSync("git", ["rev-parse", "--show-toplevel"], {
	encoding: "utf8",
}).trim();
const run = (cmd: string, args: string[], extra: Record<string, string> = {}) =>
	execFileSync(cmd, args, {
		cwd: top,
		encoding: "utf8",
		maxBuffer: 1 << 28,
		env: { ...process.env, ...extra },
	}).trim();
const gh = (...args: string[]) => run("gh", args);
const git = (...args: string[]) => run("git", args);

export interface Target {
	handle: string;
	slug: string;
}

/**
 * What a pull request's changed files ask for: null when it touches no space (ordinary code), a target when every file
 * is inside one space folder, or a reason it cannot be published.
 */
export function targetOf(files: string[]): Target | null | { error: string } {
	const inSpaces = files.filter((f) => f.startsWith("spaces/"));
	if (!inSpaces.length) return null;
	if (inSpaces.length !== files.length)
		return {
			error: `This pull request changes files outside \`spaces/\` as well (${files.find((f) => !f.startsWith("spaces/"))}). A publish may only touch one space folder; open code changes separately.`,
		};
	const ids = new Set(files.map((f) => f.split("/").slice(1, 3).join("/")));
	if (ids.size !== 1)
		return {
			error: `This pull request touches ${ids.size} spaces (${[...ids].join(", ")}). Publish one space per pull request.`,
		};
	const [handle = "", slug = ""] = [...ids][0]?.split("/") ?? [];
	if (!validId(handle, slug) || files.some((f) => f.split("/").length < 4))
		return {
			error: `\`spaces/${handle}/${slug}/\` is not a space folder: use \`spaces/<your login, lowercase>/<name>/\`, where the name is lowercase letters, digits and dashes.`,
		};
	return { handle, slug };
}

function comment(pr: string, body: string) {
	const repo = env("REPO");
	const ids = gh(
		"api",
		`repos/${repo}/issues/${pr}/comments`,
		"--paginate",
		"--jq",
		`.[] | select(.body | startswith("${MARK}")) | .id`,
	);
	const id = ids.split("\n").filter(Boolean).pop();
	const text = `${MARK}\n${body}`;
	if (id)
		gh(
			"api",
			"-X",
			"PATCH",
			`repos/${repo}/issues/comments/${id}`,
			"-f",
			`body=${text}`,
		);
	else gh("pr", "comment", pr, "-R", repo, "--body", text);
}

/** Whether `login` may approve a space the check refused: write access or more. */
function isMaintainer(login: string): boolean {
	try {
		const p = gh(
			"api",
			`repos/${env("REPO")}/collaborators/${login}/permission`,
			"--jq",
			".permission",
		);
		return ["admin", "maintain", "write"].includes(p);
	} catch {
		return false;
	}
}

async function main() {
	const repo = env("REPO");
	const pr = env("PR");
	const info = JSON.parse(
		gh(
			"api",
			`repos/${repo}/pulls/${pr}`,
			"--jq",
			"{author: .user.login, id: .user.id, title: .title, state: .state, head: .head.sha}",
		),
	) as {
		author: string;
		id: number;
		title: string;
		state: string;
		head: string;
	};
	if (info.state !== "open") return;
	const files = gh(
		"api",
		`repos/${repo}/pulls/${pr}/files`,
		"--paginate",
		"--jq",
		".[].filename",
	)
		.split("\n")
		.filter(Boolean);
	const target = targetOf(files);
	if (target === null) {
		console.log("not a publish: no files under spaces/");
		return;
	}
	if ("error" in target) {
		comment(pr, `✗ Not published.\n\n${target.error}`);
		return;
	}
	const { handle, slug } = target;
	const label = process.env.EVENT_LABEL ?? "";
	const sender = process.env.SENDER ?? "";
	const approvedBy = label === "publish" && isMaintainer(sender) ? sender : "";
	if (handle !== info.author.toLowerCase() && !approvedBy) {
		comment(
			pr,
			`✗ Not published.\n\nThe folder is \`spaces/${handle}/\`, but this pull request is from @${info.author}. Publish under \`spaces/${info.author.toLowerCase()}/${slug}/\`.`,
		);
		return;
	}

	// The pull request's version of the folder, as files. Nothing in it is installed or run.
	const work = mkdtempSync(join(tmpdir(), "publish-"));
	try {
		git(
			"fetch",
			"--no-tags",
			"--depth=1",
			"origin",
			`+refs/pull/${pr}/head:refs/pages/pr`,
		);
		if (git("rev-parse", "refs/pages/pr") !== info.head)
			throw new Error(
				"the pull request moved while it was read; it runs again on the new commit",
			);
		const dir = join(work, "spaces", handle, slug);
		run("sh", [
			"-c",
			`git archive --format=tar "$0" "$1" | tar -x -C "$2"`,
			"refs/pages/pr",
			`spaces/${handle}/${slug}`,
			work,
		]);
		if (!existsSync(dir)) {
			comment(
				pr,
				`✗ Not published.\n\n\`spaces/${handle}/${slug}/\` is empty in this pull request.`,
			);
			return;
		}
		const result = checkSpace(dir);
		if (!result.ok && !approvedBy) {
			comment(
				pr,
				`✗ Not published yet: the check found ${result.errors.length} problem(s). Push a fix to this pull request and it runs again, or a maintainer can add the \`publish\` label.\n\n\`\`\`\n${formatReport(result)}\n\`\`\`\n\nRun the same check before pushing: \`node bin/pages.mjs check ./${slug}\``,
			);
			gh("pr", "edit", pr, "-R", repo, "--add-label", "needs-review");
			return;
		}

		// One commit on space/<handle>/<slug> whose tree is exactly the folder, on top of the space's last version.
		const branch = `space/${handle}/${slug}`;
		let parent = "";
		try {
			git(
				"fetch",
				"--no-tags",
				"origin",
				`+refs/heads/${branch}:refs/pages/space`,
			);
			parent = git("rev-parse", "refs/pages/space");
		} catch {}
		const index = join(work, "index");
		run("git", ["--work-tree", dir, "add", "-A", dir], {
			GIT_INDEX_FILE: index,
		});
		const tree = run("git", ["write-tree"], { GIT_INDEX_FILE: index });
		const url = `${SITE.url}@${handle}/${slug}/`;
		if (parent && git("rev-parse", `${parent}^{tree}`) === tree) {
			comment(
				pr,
				`Nothing changed since the last version of ${url}, so nothing was published.`,
			);
			gh("pr", "close", pr, "-R", repo);
			return;
		}
		const message = [
			`Publish @${handle}/${slug} from #${pr}`,
			"",
			info.title,
			...(approvedBy ? ["", `Pages-Approved-By: ${approvedBy}`] : []),
		].join("\n");
		const commit = run(
			"git",
			["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", message],
			{
				GIT_AUTHOR_NAME: info.author,
				GIT_AUTHOR_EMAIL: `${info.id}+${info.author}@users.noreply.github.com`,
				GIT_COMMITTER_NAME: "github-actions[bot]",
				GIT_COMMITTER_EMAIL:
					"41898282+github-actions[bot]@users.noreply.github.com",
			},
		);
		git("push", "origin", `${commit}:refs/heads/${branch}`);
		const versions = git("rev-list", "--count", commit) || "1";
		// A push made with the workflow's token starts no other workflow, so the deploy is started by name.
		gh("workflow", "run", "deploy.yml", "-R", repo, "--ref", "main");
		comment(
			pr,
			`✓ Published version ${versions}. It is live in a minute or two at **${url}**\n\nSource: https://github.com/${repo}/tree/${branch} · versions: https://github.com/${repo}/commits/${branch}${result.warnings.length ? `\n\nWorth fixing:\n\n\`\`\`\n${formatReport({ ...result, errors: [] })}\n\`\`\`` : ""}${approvedBy ? `\n\nApproved by @${approvedBy}.` : ""}`,
		);
		gh("pr", "close", pr, "-R", repo);
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
}

if (import.meta.main) await main();
