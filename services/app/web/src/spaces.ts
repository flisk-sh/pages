// Spaces: one folder per space, /@<handle>/<slug>/, read from a directory the build fills from the space branches.
// Every HTML page a space serves passes through preparePage(), which puts the policy in front of the page's own head
// and the Pages bar after its body; an index.md is rendered into a page first.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { markdownToText, renderMarkdown } from "@flisk-sh/md2html";
import { checkSpace, csp, tags, validId } from "./check.mjs";
import { esc } from "./seo";
import { SITE } from "./site";

/** What the build knows about a space from its branch. */
export interface SpaceGit {
	/** The newest commit on the branch. */
	sha: string;
	/** Its committer date, ISO 8601. */
	updated: string;
	/** Commits on the branch: one per publish. */
	versions: number;
	/** A maintainer published it even though the check failed (a Pages-Approved-By trailer). */
	approved?: boolean;
	/** The CI run that published it (a Source: trailer on the commit), so "source" can open the publisher's own run. */
	origin?: string;
}

export interface Space extends SpaceGit {
	handle: string;
	slug: string;
	/** The folder holding the space's files. */
	dir: string;
	kind: "html" | "md";
	title: string;
	description: string;
	/** A shared (locked) page: served by its link, left out of every list, the sitemap and spaces.json. */
	unlisted: boolean;
}

export const spacePath = (s: { handle: string; slug: string }) =>
	`@${s.handle}/${s.slug}/`;

export const branchOf = (s: { handle: string; slug: string }) =>
	`space/${s.handle}/${s.slug}`;

const repoUrl = (path: string) => `https://github.com/${SITE.repoSlug}/${path}`;

/** The Source: trailer of a publish commit, only when it is a GitHub Actions run (nothing else is linked from the bar). */
export const originOf = (body: string) =>
	body.match(
		/^Source: (https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+)\s*$/m,
	)?.[1];

export const links = (s: {
	handle: string;
	slug: string;
	origin?: string;
}) => ({
	source: s.origin ?? repoUrl(`tree/${branchOf(s)}`),
	history: repoUrl(`commits/${branchOf(s)}`),
	report: repoUrl(
		`issues/new?template=report.yml&title=${encodeURIComponent(`Report: @${s.handle}/${s.slug}`)}`,
	),
});

const clip = (s: string, n: number) =>
	s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…`;

const decode = (s: string) =>
	s
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, "&");

/** Spaces a maintainer keeps off every list (src/hidden.json). They still open by their link. */
const HIDDEN: string[] = JSON.parse(
	readFileSync(join(import.meta.dir, "hidden.json"), "utf8"),
);

/**
 * Whether a space is the locked shell `pages share` writes: one index.html, marked, and small once its encrypted data
 * is taken out. Only that is left out of the lists, so a public page cannot hide itself by containing the marker.
 */
export function isSharedShell(dir: string, kind: "html" | "md"): boolean {
	if (kind !== "html" || readdirSync(dir).length !== 1) return false;
	const html = readFileSync(join(dir, "index.html"), "utf8");
	if (!html.includes("<body data-pages-shared>")) return false;
	const rest = html.replace(/const P=\{[\s\S]*?\},C=\{[\s\S]*?\};/, "");
	return (
		rest.length < 2500 &&
		!/<(?:script|iframe|img|link|form)\b[^>]*\b(?:src|href|action)=/i.test(rest)
	);
}

/** Title and description: the page's <title> and meta description, or the Markdown's first heading and paragraph. */
function describe(dir: string, kind: Space["kind"], slug: string) {
	if (kind === "md") {
		const md = readFileSync(join(dir, "index.md"), "utf8");
		const title = md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? slug;
		const body = markdownToText(md.replace(/^#\s+.+$/m, "")).trim();
		return { title, description: body.split(/\n\s*\n/)[0] ?? "" };
	}
	const html = readFileSync(join(dir, "index.html"), "utf8");
	const title = decode(
		html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ?? slug,
	);
	const meta = tags(html, "meta").find((m) => m.name === "description");
	return { title, description: decode(meta?.content ?? "") };
}

/**
 * The spaces under `root` (<root>/<handle>/<slug>/), newest first. A space whose folder no longer passes the check is
 * left out unless a maintainer approved it, so a rule added later also applies to what is already live.
 */
export function readSpaces(
	root: string,
	git: Record<string, SpaceGit> = {},
	log: (line: string) => void = () => {},
): Space[] {
	if (!existsSync(root)) return [];
	const out: Space[] = [];
	for (const handle of readdirSync(root).sort())
		for (const slug of existsSync(join(root, handle)) && !handle.includes(".")
			? readdirSync(join(root, handle)).sort()
			: []) {
			const dir = join(root, handle, slug);
			if (!validId(handle, slug)) continue;
			const meta = git[`${handle}/${slug}`] ?? {
				sha: "",
				updated: new Date(0).toISOString(),
				versions: 1,
			};
			const result = checkSpace(dir);
			if (!result.ok && !meta.approved) {
				log(
					`skip @${handle}/${slug}: ${result.errors.map((e) => e.rule).join(", ")}`,
				);
				continue;
			}
			const kind = existsSync(join(dir, "index.html")) ? "html" : "md";
			const { title, description } = describe(dir, kind, slug);
			out.push({
				handle,
				slug,
				dir,
				kind,
				...meta,
				title: clip(title, 90),
				description: clip(description, 200),
				unlisted:
					isSharedShell(dir, kind) || HIDDEN.includes(`${handle}/${slug}`),
			});
		}
	return out.sort((a, b) => b.updated.localeCompare(a.updated));
}

/** The small bar every space carries: who published it, its source and history, and a way to report it. */
export function bar(base: string, s: Space): string {
	const l = links(s);
	const a = 'style="color:inherit;text-decoration:none"';
	return `<div data-pages-bar style="position:fixed;right:10px;bottom:10px;z-index:2147483647;display:flex;gap:10px;align-items:center;font:12px/1.2 ui-sans-serif,system-ui,sans-serif;background:#141413;color:#fbfaf7;padding:7px 12px;border-radius:999px;opacity:.9;box-shadow:0 2px 10px rgba(0,0,0,.25)"><a ${a} href="${base}/"><b>pages</b>.flisk.si</a><a ${a} href="${base}/@${s.handle}/">@${esc(s.handle)}</a><a ${a} href="${l.history}" title="Every version of this page">v${s.versions}</a><a ${a} href="${l.source}" title="${s.origin ? "The CI run that published this page" : "The files of this page"}">source</a><a ${a} href="${l.report}" title="Report this page">report</a></div>`;
}

/**
 * One HTML file of a space, ready to serve: the policy and a canonical link go in before anything the page wrote, so
 * they apply to its first script, and the bar goes in at the end of the body.
 */
export function preparePage(
	html: string,
	base: string,
	s: Space,
	file = "index.html",
): string {
	const pageUrl = `${base}/${spacePath(s)}${file === "index.html" ? "" : file}`;
	const first = [
		// Always first: browsers look for the charset in the first 1024 bytes, and the policy alone is longer than
		// that. A second charset the page wrote later is ignored.
		'<meta charset="utf-8">',
		// One-click spaces come from a visitor with no account: they never run scripts.
		`<meta http-equiv="Content-Security-Policy" content="${csp({ scripts: s.handle !== "anon" })}">`,
		'<meta name="referrer" content="strict-origin-when-cross-origin">',
		/<link[^>]+rel=["']?canonical/i.test(html)
			? ""
			: `<link rel="canonical" href="${esc(pageUrl)}">`,
	].join("");
	const head = html.match(/<head\b[^>]*>/i);
	let out: string;
	if (head?.index !== undefined)
		out =
			html.slice(0, head.index + head[0].length) +
			first +
			html.slice(head.index + head[0].length);
	else {
		const doc =
			html.match(/^\s*(?:<!doctype[^>]*>\s*)?(?:<html\b[^>]*>)?/i)?.[0] ?? "";
		out = `${doc}<head>${first}</head>${html.slice(doc.length)}`;
	}
	const close = out.toLowerCase().lastIndexOf("</body>");
	return close === -1
		? out + bar(base, s)
		: out.slice(0, close) + bar(base, s) + out.slice(close);
}

const DOC_STYLE = `
:root{--bg:${SITE.themeColor.light};--fg:#1d1c1a;--muted:#6b6862;--line:#e6e2da;--card:#fff;--accent:#2d4cc8}
@media (prefers-color-scheme:dark){:root{--bg:${SITE.themeColor.dark};--fg:#efede8;--muted:#a19d95;--line:#2c2b28;--card:#1c1b19;--accent:#8ea2ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.65 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto;padding:48px 18px 96px}a{color:var(--accent)}img{max-width:100%}
h1{font-size:clamp(30px,6vw,46px);line-height:1.1;letter-spacing:-.02em}h2{margin-top:2em}
pre,code{font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}pre{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;overflow-x:auto}
:not(pre)>code{background:var(--card);border:1px solid var(--line);border-radius:5px;padding:1px 5px}
table{border-collapse:collapse;display:block;overflow-x:auto}th,td{border:1px solid var(--line);padding:6px 10px}
blockquote{margin:0;padding:2px 16px;border-left:3px solid var(--line);color:var(--muted)}
.markdown-alert{border-left:3px solid var(--accent);padding:2px 16px;margin:16px 0;background:var(--card)}
`;

/** An index.md as a page: rendered like a GitHub README (sanitized: no scripts), in a plain reading layout. */
export function markdownPage(md: string, base: string, s: Space): string {
	const body = renderMarkdown(md, {
		// Relative links stay on the site: a link to report.html opens that file of the space, not its GitHub blob.
		baseUrl: `${base}/${spacePath(s)}`,
		imageBaseUrl: `${base}/${spacePath(s)}`,
	});
	const html = `<!doctype html><html lang="${SITE.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(s.title)}</title><meta name="description" content="${esc(s.description)}"><meta property="og:title" content="${esc(s.title)}"><meta property="og:description" content="${esc(s.description)}"><meta property="og:image" content="${base}/og.png"><style>${DOC_STYLE}</style></head><body><main>${body}</main></body></html>`;
	return preparePage(html, base, s);
}
