// The site's own pages, written once at build time with no JavaScript: home with the newest spaces, a publisher's
// spaces, about with the FAQ, and not found. Each one passes its own PageMeta to head(), which writes every SEO tag.
// GitHub Pages sends no headers, so the policy that allows no scripts is a <meta> at the top of the head.
import { FRAME_HOSTS, LIMITS, SCRIPT_HOSTS } from "./check.mjs";
import { esc, faqJsonLd, head, type PageMeta } from "./seo";
import { SITE } from "./site";
import { links, type Space, spacePath } from "./spaces";

const POLICY =
	"default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'";

const STYLE = `
:root{--bg:${SITE.themeColor.light};--fg:#1d1c1a;--muted:#6b6862;--line:#e6e2da;--card:#fff;--accent:#2d4cc8}
@media (prefers-color-scheme:dark){:root{--bg:${SITE.themeColor.dark};--fg:#efede8;--muted:#a19d95;--line:#2c2b28;--card:#1c1b19;--accent:#8ea2ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:960px;margin:0 auto;padding:40px 16px 80px}a{color:var(--accent)}
h1{font-size:clamp(30px,6.5vw,52px);line-height:1.05;letter-spacing:-.03em;margin:0 0 14px;max-width:16em}h2{font-size:20px;margin:44px 0 10px}
.lede{color:var(--muted);font-size:18px;margin:0 0 28px;max-width:40em}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:36px;font-size:14px}.top>a{color:var(--fg);text-decoration:none;font-weight:700;display:flex;gap:8px;align-items:center}
.top nav{display:flex;gap:16px}
pre{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;overflow-x:auto;font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;margin:0 0 12px}
.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;padding:0;list-style:none;counter-reset:s}
.steps li{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;counter-increment:s}
.steps li::before{content:counter(s);display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--fg);color:var(--bg);font-weight:700;font-size:13px;margin-right:8px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;padding:0;list-style:none}
.card{display:flex;flex-direction:column;gap:6px;height:100%;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;text-decoration:none;color:var(--fg)}
.card:hover{border-color:var(--accent)}.card b{font-size:17px;line-height:1.25}.card span{color:var(--muted);font-size:14px}.card small{color:var(--muted);margin-top:auto}
.empty{color:var(--muted)}
dt{font-weight:700;margin-top:16px}dd{margin:4px 0 0}
footer{margin-top:56px;color:var(--muted);font-size:14px}
`;

const rootOf = (base: string) =>
	new URL(`${base}/`).pathname.replace(/\/$/, "");

function layout(base: string, meta: PageMeta, body: string): string {
	const root = rootOf(base);
	return `<!doctype html><html lang="${SITE.lang}"><head>
<meta http-equiv="Content-Security-Policy" content="${POLICY}">
${head(base, meta)}
<style>${STYLE}</style></head><body><main>
<div class="top"><a href="${root}/"><img src="${root}/icon.svg" alt="" width="24" height="24">${esc(SITE.name)}<span style="color:var(--muted);font-weight:400">.flisk.si</span></a><nav aria-label="Site"><a href="${root}/about">About</a><a href="${SITE.repo}">GitHub</a></nav></div>
${body}
<footer>Every space is public, free and a git branch in <a href="${SITE.repo}">${SITE.repoSlug}</a>. No keys, no database, no tracking. Made by <a href="${SITE.author.url}">${esc(SITE.author.name)}</a>.</footer>
</main></body></html>`;
}

const ago = (iso: string, now: Date) => {
	const days = Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000);
	return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
};

function cards(
	base: string,
	spaces: Space[],
	now: Date,
	withHandle = true,
): string {
	if (!spaces.length)
		return '<p class="empty">No spaces yet. Be the first: the command is above.</p>';
	const root = rootOf(base);
	return `<ul class="grid">${spaces
		.map(
			(s) =>
				`<li><a class="card" href="${root}/${spacePath(s)}"><b>${esc(s.title)}</b>${s.description ? `<span>${esc(s.description)}</span>` : ""}<small>${withHandle ? `@${esc(s.handle)} · ` : ""}v${s.versions} · ${ago(s.updated, now)}</small></a></li>`,
		)
		.join("")}</ul>`;
}

const PUBLISH = `claude plugin marketplace add ${SITE.repoSlug}
claude plugin install pages@flisk-pages
# then, in Claude Code:  publish ./my-page to pages`;

export function homePage(
	base: string,
	spaces: Space[],
	now = new Date(),
): string {
	return layout(
		base,
		{
			path: "",
			title: `${SITE.name}: ${SITE.tagline}`,
			description: SITE.description,
		},
		`<h1>${esc(SITE.tagline)}</h1>
<p class="lede">${esc(SITE.description)}</p>
<pre>${esc(PUBLISH)}</pre>
<ol class="steps">
<li><b>Your agent builds it.</b> Dashboards, explainers, comparisons, app mockups: one folder with an index.html, or an index.md.</li>
<li><b>It opens a pull request.</b> From your fork, signed in with your own GitHub. A check reads every file; nothing runs.</li>
<li><b>It is a link.</b> The space lands on its own branch and goes live at ${esc(new URL(base).host)}/@you/name. Publish again for a new version.</li>
</ol>
<h2>Newest spaces</h2>
${cards(base, spaces.slice(0, 48), now)}`,
	);
}

export function handlePage(
	base: string,
	handle: string,
	spaces: Space[],
	now = new Date(),
): string {
	const path = `@${handle}/`;
	return layout(
		base,
		{
			path,
			title: `@${handle}'s spaces`,
			description: `${spaces.length} public space${spaces.length === 1 ? "" : "s"} by @${handle} on ${SITE.name}: interactive pages published from an agent, each one a git branch.`,
			crumbs: [{ name: `@${handle}`, path }],
		},
		`<h1>@${esc(handle)}</h1>
<p class="lede">${spaces.length} public space${spaces.length === 1 ? "" : "s"}. <a href="https://github.com/${esc(handle)}">github.com/${esc(handle)}</a></p>
${cards(base, spaces, now, false)}`,
	);
}

export function aboutPage(base: string): string {
	return layout(
		base,
		{
			path: "about",
			title: "About and FAQ",
			description: `How ${SITE.name} publishes a page, what a space may contain, where versions live and how to take one down. Free, public, no keys.`,
			jsonLd: [faqJsonLd()],
			crumbs: [{ name: "About", path: "about" }],
		},
		`<h1>About ${esc(SITE.name)}</h1>
<p class="lede">${esc(SITE.description)}</p>
<h2>Questions</h2>
<dl>${SITE.faq.map((f) => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`).join("")}</dl>
<h2>The rules, exactly</h2>
<p>At most ${LIMITS.files} files and ${LIMITS.totalBytes / 1048576} MB. Scripts from the space or ${SCRIPT_HOSTS.map(esc).join(", ")}. Frames from ${FRAME_HOSTS.map(esc).join(", ")}. The check is <a href="${SITE.repo}/blob/main/services/app/web/src/check.mjs">one file</a>; run it yourself with <code>node bin/pages.mjs check ./folder</code>.</p>`,
	);
}

export function notFoundPage(base: string): string {
	const root = rootOf(base);
	return layout(
		base,
		{
			path: "404",
			title: "Page not found",
			description: `This address is not a space on ${SITE.name}. A space lives at /@<github login>/<name>/, for as long as its branch does.`,
			noindex: true,
		},
		`<h1>Page not found</h1><p class="lede">A space lives at <code>/@&lt;github login&gt;/&lt;name&gt;/</code>. It may have been removed by its publisher. <a href="${root}/">See the newest spaces</a>.</p>`,
	);
}

/** The public index of every space, for agents and scripts: /spaces.json. */
export function spacesJson(base: string, spaces: Space[]): string {
	return JSON.stringify(
		spaces.map((s) => ({
			url: `${base}/${spacePath(s)}`,
			handle: s.handle,
			slug: s.slug,
			title: s.title,
			description: s.description,
			kind: s.kind,
			versions: s.versions,
			updated: s.updated,
			...links(s),
		})),
		null,
		2,
	);
}
