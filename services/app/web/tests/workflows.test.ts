// publish.yml runs on pull_request_target, which has write tokens. It is safe only because it checks out main and
// reads the pull request's files as data. These tests fail if that rule is broken in any workflow.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dir, "../../../../.github/workflows");
const files = readdirSync(dir).filter((f) => f.endsWith(".yml"));
const text = (f: string) => readFileSync(join(dir, f), "utf8");
// A pull request's head, however a workflow spells it.
const HEAD =
	/github\.event\.pull_request\.head|github\.head_ref|refs\/pull\/|github\.event\.pull_request\.merge_commit_sha/;

/** The `with:` block lines of every `actions/checkout` step (up to the next step). */
function checkouts(src: string): string[] {
	const steps = src.split(/\n\s+- /).slice(1);
	return steps.filter((s) => /uses:\s*actions\/checkout@/.test(s));
}

describe("workflows never run pull request code", () => {
	test("the workflows are found", () => {
		for (const f of ["publish.yml", "publish-anon.yml", "remove.yml"])
			expect(files).toContain(f);
	});

	test("publish.yml is the pull_request_target workflow and every checkout in it is ref: main", () => {
		const src = text("publish.yml");
		expect(src).toMatch(/^\s+pull_request_target:/m);
		const found = checkouts(src);
		expect(found.length).toBeGreaterThan(0);
		for (const step of found) expect(step).toMatch(/^\s+ref:\s*main\s*$/m);
	});

	test("every pull_request_target workflow checks out main only", () => {
		for (const f of files) {
			const src = text(f);
			if (!/^\s+pull_request_target:/m.test(src)) continue;
			for (const step of checkouts(src))
				expect(step, f).toMatch(/^\s+ref:\s*main\s*$/m);
		}
	});

	test("no workflow checks out a pull request head, by ref, repository or a git/gh command", () => {
		for (const f of files) {
			const src = text(f);
			for (const step of checkouts(src))
				expect(step, `${f} checkout`).not.toMatch(HEAD);
			expect(src, `${f} gh pr checkout`).not.toMatch(/gh pr checkout/);
			// git checkout / fetch / switch of anything that names a pull request
			for (const line of src
				.split("\n")
				.filter((l) =>
					/git\s+(checkout|switch|fetch|merge|cherry-pick)\b/.test(l),
				)) {
				expect(line, `${f}: ${line.trim()}`).not.toMatch(
					/pull|\bpr\b|head_ref|refs\/pull/i,
				);
			}
		}
	});

	test("pull_request_target workflows run no script from the pull request's files", () => {
		for (const f of files) {
			const src = text(f);
			if (!/^\s+pull_request_target:/m.test(src)) continue;
			// A step that runs a file out of a PR path (spaces/**), or the PR head, or an extracted pull request archive
			for (const line of src
				.split("\n")
				.filter((l) => /^\s+(- )?run:/.test(l))) {
				expect(line, `${f}: ${line.trim()}`).not.toMatch(
					/spaces\/|\.\/spaces|\bsh\s+-c|\beval\b|bash\s+<\(/,
				);
				expect(line, `${f}: ${line.trim()}`).not.toMatch(HEAD);
			}
			// The only script it runs is scripts/publish-pr.ts, from the main checkout
			expect(src).toMatch(/bun scripts\/publish-pr\.ts/);
		}
	});

	test("the checker catches the unsafe change", () => {
		const bad = text("publish.yml").replace(
			/ref: main/,
			"ref: github.event.pull_request.head.sha",
		);
		const [step] = checkouts(bad);
		expect(step).toMatch(HEAD);
		expect(step).not.toMatch(/^\s+ref:\s*main\s*$/m);
	});
});
