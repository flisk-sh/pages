// Takes a space down, run by .github/workflows/remove.yml when an issue titled "Remove @<handle>/<slug>" is opened by
// that publisher, or when a maintainer adds the `remove` label to one (for a report). Deletes the branch, starts the
// deploy, and closes the issue. Needs GH_TOKEN, REPO, ISSUE, and SENDER (who opened or labeled it).
import { execFileSync } from "node:child_process";
import { validId } from "../src/check.mjs";

const env = (name: string) => {
	const v = process.env[name];
	if (!v) throw new Error(`${name} is not set`);
	return v;
};
const top = execFileSync("git", ["rev-parse", "--show-toplevel"], {
	encoding: "utf8",
}).trim();
const run = (cmd: string, ...args: string[]) =>
	execFileSync(cmd, args, { cwd: top, encoding: "utf8" }).trim();

/** "@sam/how-gpus-work" out of an issue title such as "Remove @sam/how-gpus-work" or "Report: @sam/how-gpus-work". */
export function spaceIn(
	title: string,
): { handle: string; slug: string } | null {
	const m = title.match(/@([a-z0-9-]+)\/([a-z0-9-]+)/i);
	if (!m) return null;
	const handle = (m[1] as string).toLowerCase();
	const slug = (m[2] as string).toLowerCase();
	return validId(handle, slug) ? { handle, slug } : null;
}

function isMaintainer(repo: string, login: string): boolean {
	try {
		return ["admin", "maintain", "write"].includes(
			run(
				"gh",
				"api",
				`repos/${repo}/collaborators/${login}/permission`,
				"--jq",
				".permission",
			),
		);
	} catch {
		return false;
	}
}

async function main() {
	const repo = env("REPO");
	const issue = env("ISSUE");
	const sender = env("SENDER");
	const { title, author, state } = JSON.parse(
		run(
			"gh",
			"api",
			`repos/${repo}/issues/${issue}`,
			"--jq",
			"{title: .title, author: .user.login, state: .state}",
		),
	) as { title: string; author: string; state: string };
	if (state !== "open") return;
	const space = spaceIn(title);
	if (!space) return;
	const own =
		/^\s*remove\b/i.test(title) &&
		author.toLowerCase() === space.handle &&
		sender === author;
	const byMaintainer =
		process.env.EVENT_LABEL === "remove" && isMaintainer(repo, sender);
	if (!own && !byMaintainer) {
		if (/^\s*remove\b/i.test(title) && process.env.EVENT_LABEL !== "remove")
			run(
				"gh",
				"issue",
				"comment",
				issue,
				"-R",
				repo,
				"--body",
				`Only @${space.handle} can remove @${space.handle}/${space.slug} this way. To report it, use the Report link on the page; a maintainer will look.`,
			);
		return;
	}
	const branch = `space/${space.handle}/${space.slug}`;
	try {
		run("git", "push", "origin", "--delete", branch);
	} catch {
		run(
			"gh",
			"issue",
			"comment",
			issue,
			"-R",
			repo,
			"--body",
			`There is no space @${space.handle}/${space.slug} (no branch \`${branch}\`).`,
		);
		run("gh", "issue", "close", issue, "-R", repo, "--reason", "not planned");
		return;
	}
	run("gh", "workflow", "run", "deploy.yml", "-R", repo, "--ref", "main");
	run(
		"gh",
		"issue",
		"comment",
		issue,
		"-R",
		repo,
		"--body",
		`Removed @${space.handle}/${space.slug}: the branch \`${branch}\` is deleted and the page is gone after the next deploy, in a minute or two.`,
	);
	run("gh", "issue", "close", issue, "-R", repo, "--reason", "completed");
}

if (import.meta.main) await main();
