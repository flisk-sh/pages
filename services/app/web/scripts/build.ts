// The static site for GitHub Pages: gathers every space branch into .spaces/, then asks the app for every page and
// file and writes the answers under _site/. What the preview serves is exactly what goes online.
//   bun run build                    gather from refs/remotes/origin/space/* and build
//   bun run build -- --no-gather     build from the .spaces/ already there
//   bun run gather                   gather only (for `bun run dev`)
// Options: --out <dir> (_site), --spaces <dir> (.spaces), --refs <prefix> (refs/remotes/origin/space/)
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { createApp } from "../src/app";
import { validId } from "../src/check.mjs";
import { DEMO } from "../src/pages";
import { ICONS } from "../src/seo";
import { SITE } from "../src/site";
import { originOf, readSpaces, type SpaceGit, spacePath } from "../src/spaces";

const here = join(import.meta.dir, "..");
const arg = (name: string, fallback: string) => {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 ? (process.argv[i + 1] as string) : fallback;
};
const OUT = resolve(here, arg("out", "_site"));
const SPACES = resolve(here, arg("spaces", ".spaces"));
const REFS = arg("refs", "refs/remotes/origin/space/");
// From the top of the checkout: git archive run in a subfolder archives only that subfolder of each branch.
const top = execFileSync("git", ["rev-parse", "--show-toplevel"], {
	cwd: here,
	encoding: "utf8",
}).trim();
const git = (...args: string[]) =>
	execFileSync("git", args, {
		cwd: top,
		encoding: "utf8",
		maxBuffer: 1 << 28,
	}).trim();

/** Each space branch's files into .spaces/<handle>/<slug>/, and what the branch says about it into git.json. */
export function gather(): Record<string, SpaceGit> {
	rmSync(SPACES, { recursive: true, force: true });
	mkdirSync(SPACES, { recursive: true });
	const meta: Record<string, SpaceGit> = {};
	const refs = git(
		"for-each-ref",
		"--format=%(refname) %(objectname) %(committerdate:iso-strict)",
		REFS,
	);
	for (const line of refs ? refs.split("\n") : []) {
		const [ref, sha, updated] = line.split(" ") as [string, string, string];
		const [handle, slug, ...rest] = ref.slice(REFS.length).split("/");
		if (!handle || !slug || rest.length || !validId(handle, slug)) {
			console.log(`skip ${ref}: not space/<handle>/<slug>`);
			continue;
		}
		const dir = join(SPACES, handle, slug);
		mkdirSync(dir, { recursive: true });
		// A git tree cannot hold both a link and files under it, so nothing is written outside the folder; links
		// themselves are refused by the check in readSpaces() before anything is served.
		execFileSync(
			"sh",
			["-c", `git archive --format=tar "$0" | tar -x -C "$1"`, ref, dir],
			{ cwd: top },
		);
		const body = git("log", "-1", "--format=%B", ref);
		meta[`${handle}/${slug}`] = {
			sha,
			updated: new Date(updated).toISOString(),
			versions: Number(git("rev-list", "--count", ref)),
			approved: /^Pages-Approved-By: \S+/m.test(body),
			origin: originOf(body),
		};
	}
	writeFileSync(join(SPACES, "git.json"), JSON.stringify(meta, null, 2));
	console.log(`gathered ${Object.keys(meta).length} space branches`);
	return meta;
}

function files(dir: string): string[] {
	const out: string[] = [];
	const visit = (at: string) => {
		for (const e of readdirSync(at, { withFileTypes: true }))
			if (e.isDirectory()) visit(join(at, e.name));
			else if (e.isFile())
				out.push(relative(dir, join(at, e.name)).split(sep).join("/"));
	};
	visit(dir);
	return out;
}

export async function build(meta: Record<string, SpaceGit>) {
	const spaces = readSpaces(SPACES, meta, console.log);
	const app = createApp({
		publicUrl: process.env.PUBLIC_URL || SITE.url,
		spaces,
	});
	rmSync(OUT, { recursive: true, force: true });
	const write = async (path: string, file: string) => {
		const res = await app.request(path);
		if (res.status >= 300 && path !== "/404.html")
			throw new Error(`${path} answered ${res.status}`);
		const to = join(OUT, file);
		mkdirSync(dirname(to), { recursive: true });
		writeFileSync(to, new Uint8Array(await res.arrayBuffer()));
	};
	const site: [string, string][] = [
		["/", "index.html"],
		["/about", "about.html"],
		["/404.html", "404.html"],
		["/spaces.json", "spaces.json"],
		["/robots.txt", "robots.txt"],
		["/sitemap.xml", "sitemap.xml"],
		["/llms.txt", "llms.txt"],
		["/site.webmanifest", "site.webmanifest"],
		["/.well-known/security.txt", ".well-known/security.txt"],
		...Object.values(ICONS).map((n): [string, string] => [`/${n}`, n]),
		...Object.values(DEMO).map((n): [string, string] => [`/${n}`, n]),
	];
	for (const [path, file] of site) await write(path, file);
	for (const handle of new Set(
		spaces.filter((s) => !s.unlisted).map((s) => s.handle),
	))
		await write(`/@${handle}/`, `@${handle}/index.html`);
	for (const s of spaces) {
		const prefix = spacePath(s);
		const list = files(s.dir);
		if (s.kind === "md" && !list.includes("index.html"))
			list.push("index.html");
		for (const f of list)
			await write(
				`/${prefix}${f.split("/").map(encodeURIComponent).join("/")}`,
				`${prefix}${f}`,
			);
	}
	writeFileSync(join(OUT, "CNAME"), `${new URL(SITE.url).host}\n`);
	writeFileSync(join(OUT, ".nojekyll"), "");
	console.log(
		`built ${spaces.length} spaces into ${relative(process.cwd(), OUT) || "."}`,
	);
}

if (import.meta.main) {
	const meta = process.argv.includes("--no-gather")
		? JSON.parse(
				await Bun.file(join(SPACES, "git.json"))
					.text()
					.catch(() => "{}"),
			)
		: gather();
	if (!process.argv.includes("--gather-only")) await build(meta);
}
