#!/usr/bin/env node
// Publish a page to pages.flisk.si from your own machine. Runs on node 18+ or bun, with no install:
// `npx -y @flisk-sh/pages publish page.html`, or `node bin/pages.mjs …` from a checkout of this repository.
//
//   pages check <path>                                    the same check the publish runs, nothing sent
//   pages publish <path> [--slug name] [--wait] [--anon] [--oidc] [--dry-run]
//   pages share <path> [--to name]... [--slug name] [--wait]   one locked link per person; asks who if no --to
//   pages remove <slug | path> [--oidc]                   take one of your spaces down
//   pages whoami                                          the login your spaces go under
//
// <path> is a folder with an index.html or index.md, or a single .html or .md file, which becomes the index.
//
// Signed in to the GitHub CLI (gh auth login), publish copies the page to spaces/<your login>/<slug>/ on a branch of
// your fork of flisk-sh/pages and opens a pull request. The repository's workflow checks it, commits it to
// space/<login>/<slug> and closes the pull request with the link. Publishing the same slug again adds a version.
//
// Not signed in, or with --anon, a Markdown page (one index.md, or one .md file) goes to publish.flisk.si instead and
// is live at /@anon/<id>/ with no account. Its token is kept in ~/.config/pages/anon.json, so publishing the same
// path again adds a version and `pages remove <path>` takes it down. HTML needs the GitHub CLI.
//
// In a GitHub Actions job that may ask for an OIDC token (`permissions: id-token: write`), or with --oidc, publish sends
// the page to publish.flisk.si with that token instead, and it goes live at /@<repository owner>/<slug>/: no key, no
// fork. This is what the flisk-sh/pages Action does when it is given no token.
//
// PAGES_REPO overrides the repository and PAGES_PUBLISH_URL the anonymous service (for testing). --dry-run (or
// PAGES_DRY_RUN=1, EVAL_PAGES_DRY_RUN=1) checks and prints what it would do, and sends nothing; with PAGES_LOGIN set
// it does not ask GitHub who you are either.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	checkSpace,
	formatReport,
	publishAnon,
	publishFromActions,
	removeFromActions,
	versionsOf,
	waitCommitted,
	waitVersion,
	removeAnon,
	saveSpace,
	savedSpace,
	slugify,
	sourceOf,
	stage,
	storePath,
	validId,
	waitLive,
} from "./lib.mjs";

const REPO = process.env.PAGES_REPO || "flisk-sh/pages";
const SITE = process.env.PAGES_URL || "https://pages.flisk.si/";
const API = (process.env.PAGES_PUBLISH_URL || "https://publish.flisk.si").replace(/\/+$/, "");

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

/** Your GitHub login, or "" when the GitHub CLI is missing or not signed in. */
function signedIn() {
	const preset = process.env.PAGES_LOGIN || process.env.EVAL_PAGES_LOGIN;
	if (preset && DRY) return preset;
	try {
		return gh("api", "user", "--jq", ".login");
	} catch {
		return "";
	}
}

function login() {
	return signedIn() || die("Not signed in to GitHub. Run: gh auth login");
}

function source(path) {
	const s = sourceOf(path);
	if (s.error) die(s.error);
	return s;
}

function check(src) {
	const staged = stage(src);
	try {
		const result = checkSpace(staged);
		console.log(formatReport(result));
		return result.ok;
	} finally {
		rmSync(staged, { recursive: true, force: true });
	}
}

async function publish(path, slugArg, wait, anon, oidc, names) {
	const src = source(path);
	if (oidc) return publishWithOidc(src, slugArg, wait);
	const me = anon ? "" : signedIn();
	if (!me && !anon && process.env.ACTIONS_ID_TOKEN_REQUEST_URL) return publishWithOidc(src, slugArg, wait);
	if (!me && src.markdown === undefined)
		die(
			anon
				? "--anon publishes Markdown only: one index.md in the folder, or a single .md file."
				: "Publishing this page needs the GitHub CLI signed in (gh auth login). Only a Markdown page (one .md file,\nor a folder holding just index.md) publishes without it, at pages.flisk.si/@anon/<id>/.",
		);
	if (!check(src)) die("\nFix the problems above, then publish again.");
	if (names && !me) die("share needs the GitHub CLI signed in (gh auth login).");
	if (!me) return publishAnonymously(path, src, slugArg, wait);

	const handle = me.toLowerCase();
	const slug = slugArg ?? slugify(src.name);
	if (!validId(handle, slug))
		die(`"${slug}" cannot be a space name: use lowercase letters, digits and dashes (--slug my-page).`);
	if (DRY) {
		console.log(
			`\nDry run, nothing sent. A publish would open a pull request to ${REPO} adding spaces/${handle}/${slug}/,\nand the space would go live at ${SITE}@${handle}/${slug}/`,
		);
		return;
	}

	const fork = gh("api", "-X", "POST", `repos/${REPO}/forks`, "--jq", ".full_name");
	const work = mkdtempSync(join(tmpdir(), "pages-publish-"));
	const staged = stage(src);
	try {
		const keys = names ? shareOrDie(staged, names) : {};
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
		for (const [id, key] of Object.entries(keys)) console.log(`\nFor ${id}: ${SITE}@${handle}/${slug}/#${id}.${key}`);
		if (names) console.log("\nSend each person their own whole link. The part after # is the key. Lose it, lose the page.");
		if (wait && (await waitFor(pr))) await live(`${SITE}@${handle}/${slug}/`);
	} finally {
		rmSync(work, { recursive: true, force: true });
		rmSync(staged, { recursive: true, force: true });
	}
}

function shareOrDie(staged, names) {
	try {
		return shareStaged(staged, names);
	} catch (e) {
		return die(e.message);
	}
}

/** Who is it for? --to a --to b, or ask. */
async function recipients() {
	const given = process.argv.flatMap((a, i, all) => (a === "--to" && all[i + 1] ? [all[i + 1]] : []));
	if (given.length) return given;
	if (!process.stdin.isTTY) die("Say who it is for: pages share <path> --to alice --to bob");
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const answer = await rl.question("Who is this page for? (names, separated by commas): ");
	rl.close();
	return answer.split(",");
}

async function publishWithOidc(src, slugArg, wait) {
	const slug = slugArg ?? slugify(src.name);
	if (!validId("ci", slug)) die(`"${slug}" cannot be a space name: use lowercase letters, digits and dashes (--slug my-page).`);
	if (!check(src)) die("\nFix the problems above, then publish again.");
	const owner = (process.env.GITHUB_REPOSITORY_OWNER || "<repository owner>").toLowerCase();
	if (DRY)
		return console.log(`\nDry run, nothing sent. A publish would send this page to ${API} with this job's OIDC token,\nand the space would go live at ${SITE}@${owner}/${slug}/`);
	const before = await versionsOf(SITE, owner, slug);
	const staged = stage(src);
	let sent;
	try {
		sent = await publishFromActions(API, slug, staged);
	} catch (e) {
		die(`\n✗ ${e.message}`);
	} finally {
		rmSync(staged, { recursive: true, force: true });
	}
	console.log(`\n✓ Sent from GitHub Actions: ${sent.url}\nThe check and the commit run at ${sent.runs}`);
	if (!wait) return console.log("It is live in a minute or two; --wait waits until it is.");
	// First the real answer: publish.flisk.si checked this run's page again and committed it.
	const run = `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
	console.log("\nWaiting for the check and the commit…");
	if (!(await waitCommitted(API, owner, slug, run)))
		die(`✗ Not committed after ten minutes: the check on publish.flisk.si refused it, or a newer run of the same page replaced it. See ${sent.runs}`);
	console.log(`✓ Checked and committed as version ${before + 1}`);
	// Then the deploy, which is one queue for the whole site: when it is slow the page is still on its way.
	console.log("Waiting for it to be live…");
	if (await waitVersion(SITE, owner, slug, before, { seconds: 600 })) console.log(`✓ Live now: ${sent.url} (version ${before + 1})`);
	else console.log(`::warning::Committed, but the site's deploy queue has not reached it after ten minutes; ${sent.url} shows version ${before + 1} when it does.`);
}

async function publishAnonymously(path, src, slugArg, wait) {
	const saved = savedSpace(path);
	if (slugArg) console.log(`\nAnonymous spaces get a random name, so --slug ${slugArg} is not used.`);
	if (DRY) {
		console.log(
			saved
				? `\nDry run, nothing sent. A publish would add a version to ${saved.url}`
				: `\nDry run, nothing sent. Not signed in to GitHub, so a publish would send this Markdown to ${API}\nand the space would go live at ${SITE}@anon/<id>/`,
		);
		return;
	}
	let space;
	try {
		space = await publishAnon(API, src.markdown, saved);
	} catch (e) {
		die(`\n✗ ${e.message}`);
	}
	saveSpace(path, space);
	console.log(
		saved
			? `\n✓ Published a new version of ${space.url}`
			: `\n✓ Published anonymously (not signed in to GitHub): ${space.url}\nManage or take it down: ${space.manage}\nIts key is kept in ${storePath()}; publish the same path again to add a version.`,
	);
	if (wait) await live(space.url);
	else console.log("It is live in a minute or two; --wait waits until it is.");
}

/** Waits for the link itself to answer, since the deploy follows the publish by a minute or so. */
async function live(url) {
	console.log("\nWaiting for the link to answer…");
	console.log((await waitLive(url)) ? `✓ Live now: ${url}` : `Not live after three minutes; try ${url} again shortly.`);
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
			return true;
		}
	}
	console.log("\nNo answer yet after five minutes; the pull request shows the result when the check finishes.");
	return false;
}

async function remove(arg, oidc) {
	if (oidc) {
		if (!validId("ci", arg)) die(`"${arg}" is not a space name.`);
		if (DRY) return console.log(`Dry run, nothing sent. Would take down ${SITE}@<repository owner>/${arg}/ with this job's OIDC token.`);
		try {
			const { url } = await removeFromActions(API, arg);
			if (!process.argv.includes("--wait")) return console.log(`Sent: ${url} is gone after the next deploy, in a minute or two.`);
			const owner = (process.env.GITHUB_REPOSITORY_OWNER || "").toLowerCase();
			console.log(`Sent. Waiting for ${url} to be gone…`);
			const until = Date.now() + 300_000;
			while ((await versionsOf(SITE, owner, arg)) > 0) {
				if (Date.now() > until) die(`Still live after five minutes; see https://github.com/${REPO}/actions/workflows/publish-anon.yml`);
				await new Promise((r) => setTimeout(r, 5000));
			}
			return console.log(`✓ Removed: ${url}`);
		} catch (e) {
			die(`✗ ${e.message}`);
		}
	}
	const saved = existsSync(arg) ? savedSpace(arg) : undefined;
	if (saved) {
		if (DRY) return console.log(`Dry run, nothing sent. Would take down ${saved.url}`);
		try {
			await removeAnon(API, saved);
		} catch (e) {
			die(`✗ ${e.message}`);
		}
		saveSpace(arg, undefined);
		return console.log(`Removed: ${saved.url} is gone after the next deploy, in a minute or two.`);
	}
	const handle = login().toLowerCase();
	if (!validId(handle, arg)) die(`"${arg}" is not a space name, or a path you published anonymously from here.`);
	if (DRY) return console.log(`Dry run, nothing sent. Would open an issue "Remove @${handle}/${arg}" on ${REPO}.`);
	const url = gh("issue", "create", "-R", REPO, "--title", `Remove @${handle}/${arg}`, "--body", `Removing my space ${SITE}@${handle}/${arg}/ (opened with bin/pages.mjs).`);
	console.log(`Removal requested: ${url}\n${SITE}@${handle}/${arg}/ is gone after the next deploy, in a minute or two.`);
}

const [cmd, arg] = process.argv.slice(2);
const has = (f) => process.argv.includes(f);
if (cmd === "check" && arg) process.exit(check(source(arg)) ? 0 : 1);
else if (cmd === "publish" && arg) await publish(arg, flag("slug"), has("--wait"), has("--anon"), has("--oidc"), null);
else if (cmd === "share" && arg) await publish(arg, flag("slug"), has("--wait"), false, false, await recipients());
else if (cmd === "remove" && arg) await remove(arg, has("--oidc"));
else if (cmd === "whoami") console.log(login().toLowerCase());
else
	die(
		"usage:\n  pages check <path>\n  pages publish <path> [--slug name] [--wait] [--anon] [--oidc] [--dry-run]\n  pages share <path> [--to name]... [--slug name] [--wait]   only the people you name can read it; asks who if no --to\n  pages remove <slug | path> [--oidc]\n  pages whoami\n\n<path> is a folder with an index.html or index.md, or one .html or .md file (share: one .html file).",
		2,
	);
