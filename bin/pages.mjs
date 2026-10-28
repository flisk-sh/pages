#!/usr/bin/env node
// Publish a folder to pages.flisk.si from your own machine, as yourself. Needs git and the GitHub CLI signed in
// (gh auth login); runs on node 18+ or bun, with no install.
//
//   node bin/pages.mjs check <dir>                       the same check the publish runs, nothing sent
//   node bin/pages.mjs publish <dir> [--slug name] [--wait] [--dry-run]
//   node bin/pages.mjs remove <slug>                     take one of your spaces down
//   node bin/pages.mjs whoami                            the login your spaces go under
//
// publish copies <dir> to spaces/<your login>/<slug>/ on a branch of your fork of flisk-sh/pages and opens a pull
// request. The repository's workflow checks it, commits it to space/<login>/<slug> and closes the pull request with
// the link. Publishing the same slug again adds a version. PAGES_REPO overrides the repository (for testing).
// --dry-run (or PAGES_DRY_RUN=1, EVAL_PAGES_DRY_RUN=1) checks and prints what it would do, and sends nothing; with
// PAGES_LOGIN set it does not ask GitHub who you are either.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { checkSpace, formatReport, validId } from "../services/app/web/src/check.mjs";

const REPO = process.env.PAGES_REPO || "flisk-sh/pages";
const SITE = process.env.PAGES_URL || "https://pages.flisk.si/";
const SKIP = new Set([".DS_Store", ".git", "Thumbs.db", "node_modules"]);

const run = (cmd, args, opts = {}) =>
	execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
const gh = (...args) => run("gh", args);
const die = (msg, code = 1) => {
	console.error(msg);
	process.exit(code);
};
const DRY =
	process.argv.includes("--dry-run") ||
	process.env.PAGES_DRY_RUN === "1" ||
	process.env.EVAL_PAGES_DRY_RUN === "1";
const flag = (name) => {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 ? process.argv[i + 1] : undefined;
};

function login() {
	const preset = process.env.PAGES_LOGIN || process.env.EVAL_PAGES_LOGIN;
	if (preset && DRY) return preset;
	try {
		return gh("api", "user", "--jq", ".login");
	} catch {
		return die("Not signed in to GitHub. Run: gh auth login");
	}
}

/** A slug from a folder name: "My GPU Explainer" → "my-gpu-explainer". */
export function slugify(name) {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 63);
}

/** The folder as it will be published, without the files every OS and editor leaves behind. */
function stage(dir) {
	const out = mkdtempSync(join(tmpdir(), "pages-stage-"));
	cpSync(dir, out, { recursive: true, filter: (src) => !SKIP.has(basename(src)) });
	return out;
}

function check(dir) {
	const staged = stage(dir);
	try {
		const result = checkSpace(staged);
		console.log(formatReport(result));
		return result.ok;
	} finally {
		rmSync(staged, { recursive: true, force: true });
	}
}

async function publish(dir, slugArg, wait) {
	const me = login();
	const handle = me.toLowerCase();
	const slug = slugArg ?? slugify(basename(resolve(dir)));
	if (!validId(handle, slug))
		die(`"${slug}" cannot be a space name: use lowercase letters, digits and dashes (--slug my-page).`);
	if (!check(dir)) die("\nFix the problems above, then publish again.");
	if (DRY) {
		console.log(
			`\nDry run, nothing sent. A publish would open a pull request to ${REPO} adding spaces/${handle}/${slug}/,\nand the space would go live at ${SITE}@${handle}/${slug}/`,
		);
		return;
	}

	const fork = gh("api", "-X", "POST", `repos/${REPO}/forks`, "--jq", ".full_name");
	const work = mkdtempSync(join(tmpdir(), "pages-publish-"));
	const staged = stage(dir);
	try {
		const git = (...args) => run("git", args, { cwd: work });
		run("git", ["clone", "--quiet", "--depth=1", `https://github.com/${REPO}.git`, work]);
		const branch = `publish/${slug}-${Date.now().toString(36)}`;
		git("checkout", "--quiet", "-b", branch);
		const target = join(work, "spaces", handle, slug);
		rmSync(target, { recursive: true, force: true });
		cpSync(staged, target, { recursive: true });
		git("add", "-A", "spaces");
		git(
			"-c", `user.name=${me}`,
			"-c", `user.email=${me}@users.noreply.github.com`,
			"commit", "--quiet", "-m", `Publish @${handle}/${slug}`,
		);
		// gh's own credentials, so nothing else needs setting up.
		git("-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential", "push", "--quiet", `https://github.com/${fork}.git`, `HEAD:refs/heads/${branch}`);
		const pr = gh(
			"pr", "create", "-R", REPO, "--base", "main", "--head", `${fork.split("/")[0]}:${branch}`,
			"--title", `Publish @${handle}/${slug}`,
			"--body", `Publishing \`spaces/${handle}/${slug}/\` with \`bin/pages.mjs\`. The check runs on this pull request; when it passes, the space goes live at ${SITE}@${handle}/${slug}/ and this pull request is closed.`,
		);
		console.log(`\nPull request: ${pr}\nWill be live at: ${SITE}@${handle}/${slug}/`);
		if (wait) await waitFor(pr);
	} finally {
		rmSync(work, { recursive: true, force: true });
		rmSync(staged, { recursive: true, force: true });
	}
}

/** Waits up to five minutes for the publish workflow's answer on the pull request and prints it. */
async function waitFor(pr) {
	const number = pr.split("/").pop();
	for (let i = 0; i < 60; i++) {
		await new Promise((r) => setTimeout(r, 5000));
		const body = gh("api", `repos/${REPO}/issues/${number}/comments`, "--jq", '[.[] | select(.body | startswith("<!-- pages-publish -->"))][-1].body // ""');
		if (body) {
			console.log(`\n${body.replace("<!-- pages-publish -->\n", "")}`);
			if (!body.includes("✓")) process.exit(1);
			return;
		}
	}
	console.log("\nNo answer yet after five minutes; the pull request shows the result when the check finishes.");
}

function remove(slug) {
	const handle = login().toLowerCase();
	if (!validId(handle, slug)) die(`"${slug}" is not a space name.`);
	if (DRY) return console.log(`Dry run, nothing sent. Would open an issue "Remove @${handle}/${slug}" on ${REPO}.`);
	const url = gh("issue", "create", "-R", REPO, "--title", `Remove @${handle}/${slug}`, "--body", `Removing my space ${SITE}@${handle}/${slug}/ (opened with bin/pages.mjs).`);
	console.log(`Removal requested: ${url}\n${SITE}@${handle}/${slug}/ is gone after the next deploy, in a minute or two.`);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "check" && arg) {
	if (!existsSync(arg) || !statSync(arg).isDirectory()) die(`${arg} is not a folder.`);
	process.exit(check(arg) ? 0 : 1);
} else if (cmd === "publish" && arg) {
	if (!existsSync(arg) || !statSync(arg).isDirectory()) die(`${arg} is not a folder.`);
	await publish(arg, flag("slug"), process.argv.includes("--wait"));
} else if (cmd === "remove" && arg) remove(arg);
else if (cmd === "whoami") console.log(login().toLowerCase());
else
	die(
		"usage:\n  pages.mjs check <dir>\n  pages.mjs publish <dir> [--slug name] [--wait] [--dry-run]\n  pages.mjs remove <slug>\n  pages.mjs whoami",
		2,
	);
