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
	/** The page is the locked shell `pages share` writes: only people with their own link can read it. */
	locked: boolean;
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
				locked: isSharedShell(dir, kind),
			});
		}
	return out.sort((a, b) => b.updated.localeCompare(a.updated));
}

/** The small bar every space carries: who published it, its source and history, and a way to report it. */
export function bar(base: string, s: Space): string {
	const l = links(s);
	const url = `${base}/${spacePath(s)}`;
	const mail = `mailto:?subject=${encodeURIComponent(s.title)}&body=${encodeURIComponent(url)}`;
	return `<div data-pages-bar><style>[data-pages-bar]{position:fixed;right:12px;bottom:12px;z-index:2147483647;display:flex;align-items:center;font:12px/1 ui-sans-serif,system-ui,sans-serif;background:#fff;color:#1b1b1f;border:1px solid #e4e4ea;border-radius:7px;box-shadow:0 1px 8px rgba(0,0,0,.08);overflow:visible}[data-pages-bar] a,[data-pages-bar] span{position:relative;display:inline-flex;align-items:center;color:#5b5b66;text-decoration:none;padding:6px 9px;border-left:1px solid #e4e4ea}[data-pages-bar] span{gap:5px;padding:6px 9px;color:#1b1b1f;font-weight:600}[data-pages-bar] a:hover,[data-pages-bar] a:focus-visible{background:#f5f6fa;color:#1b1b1f;outline:0}[data-pages-bar] a:last-child:hover{border-radius:0 6px 6px 0}[data-pages-bar] [data-tip]:hover::after,[data-pages-bar] [data-tip]:focus-visible::after{content:attr(data-tip);position:absolute;right:0;bottom:calc(100% + 10px);width:max-content;max-width:250px;white-space:normal;background:#1b1b1f;color:#fff;padding:8px 11px;border-radius:6px;font:12px/1.4 ui-sans-serif,system-ui,sans-serif;box-shadow:0 2px 12px rgba(0,0,0,.25);pointer-events:none}@media (prefers-color-scheme:dark){[data-pages-bar]{background:#1c1c24;color:#ececf1;border-color:#2c2c36}[data-pages-bar] a{color:#a4a4b0;border-color:#2c2c36}[data-pages-bar] span{color:#ececf1}[data-pages-bar] a:hover,[data-pages-bar] a:focus-visible{background:#26262f;color:#ececf1}[data-pages-bar] [data-tip]:hover::after,[data-pages-bar] [data-tip]:focus-visible::after{background:#ececf1;color:#14141a}}</style><span data-tip="${s.locked ? "Private: only people with their own link can read this page" : "Public: anyone with the link can read this page"}">${s.locked ? '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>' : '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/></svg>'}${s.locked ? "private" : "public"}</span><a href="${base}/" data-tip="pages.flisk.si: free pages that an agent published. Open the home page"><b>pages</b>.flisk.si</a><a href="${base}/@${s.handle}/" data-tip="Everything @${esc(s.handle)} has published">@${esc(s.handle)}</a><a href="${l.history}" data-tip="Version ${s.versions}. Open the full history of this page on GitHub">v${s.versions}</a><a href="${l.source}" data-tip="${s.origin ? "The CI run that published this page" : "The files of this page: read exactly what it contains"}">source</a><a href="${mail}" data-tip="Share: copy this page's link (on a private page it includes your own key, so send it only to someone you trust)" onclick="if(navigator.clipboard){event.preventDefault();var t=this;navigator.clipboard.writeText(location.href).then(function(){t.textContent='copied';setTimeout(function(){t.textContent='share'},1500)})}">share</a><a href="https://github.com/flisk-sh/pages#share-only-the-people-you-name" data-tip="Private: how to share a page with only the people you name, one locked link each">private</a><a href="${l.report}" data-tip="Report: tell us this page is abusive, a scam or broken">report</a></div>`;
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
