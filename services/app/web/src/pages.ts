// The site's own pages, written once at build time with no JavaScript: home with the newest spaces, a publisher's
// spaces, about with the FAQ, and not found. Each one passes its own PageMeta to head(), which writes every SEO tag.
// GitHub Pages sends no headers, so the policy that allows no scripts is a <meta> at the top of the head.
import { FRAME_HOSTS, LIMITS, SCRIPT_HOSTS } from "./check.mjs";
import { esc, faqJsonLd, head, type PageMeta } from "./seo";
import { SITE } from "./site";
import { links, type Space, spacePath } from "./spaces";

// Spaces are previewed live in sandboxed frames (no allow-same-origin, so a space cannot reach this page), and
// publishers' GitHub avatars are the only images from elsewhere.
const POLICY =
	"default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https://avatars.githubusercontent.com; media-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'";

const STYLE = `
:root{--bg:${SITE.themeColor.light};--fg:#141413;--muted:#66625b;--faint:#97928a;--line:#e7e2d8;--line2:#d6d0c3;--card:#fff;--soft:#f3f0e9;--accent:#2d4cc8;--accent2:#5b74ff;--mark:#ffe27a;--ink:#141413;--onink:#f4f2ec;--shadow:0 1px 2px rgba(20,20,19,.06),0 12px 40px -12px rgba(20,20,19,.18)}
@media (prefers-color-scheme:dark){:root{--bg:${SITE.themeColor.dark};--fg:#f1efe9;--muted:#aaa59b;--faint:#7d796f;--line:#2a2926;--line2:#3a3834;--card:#1c1b19;--soft:#201f1c;--accent:#8ea2ff;--accent2:#b3c0ff;--mark:rgba(142,162,255,.38);--ink:#0b0b0a;--onink:#f1efe9;--shadow:0 1px 2px rgba(0,0,0,.4),0 16px 48px -16px rgba(0,0,0,.7)}}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--accent)}code,pre,.mono{font-family:ui-monospace,SFMono-Regular,"JetBrains Mono",Menlo,monospace}
.wrap{max-width:1160px;margin:0 auto;padding:0 20px}
.top{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid transparent}
.top .wrap{display:flex;justify-content:space-between;align-items:center;gap:12px;height:64px}
.brand{color:var(--fg);text-decoration:none;font-weight:800;font-size:17px;letter-spacing:-.02em;display:flex;gap:9px;align-items:center}.brand span{color:var(--faint);font-weight:500}
.top nav{display:flex;gap:6px;align-items:center;font-size:14px}.top nav a{color:var(--muted);text-decoration:none;padding:7px 11px;border-radius:9px}.top nav a:hover{color:var(--fg);background:var(--soft)}
.top nav a.gh{color:var(--fg);border:1px solid var(--line2);font-weight:600}
@media (max-width:640px){.top nav a.hide-sm{display:none}}
.btn{display:inline-flex;align-items:center;gap:8px;font-weight:650;font-size:15px;text-decoration:none;padding:12px 18px;border-radius:12px;border:1px solid var(--line2);color:var(--fg);background:var(--card);transition:transform .15s,box-shadow .15s}
.btn:hover{transform:translateY(-1px);box-shadow:var(--shadow)}.btn.primary{background:var(--ink);color:var(--onink);border-color:var(--ink)}
@media (prefers-color-scheme:dark){.btn.primary{background:var(--onink);color:var(--ink);border-color:var(--onink)}}
.hero{position:relative;padding:72px 0 40px;overflow:hidden}
.hero::before{content:"";position:absolute;inset:0;background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:44px 44px;mask-image:radial-gradient(ellipse 70% 60% at 70% 30%,#000 10%,transparent 70%);-webkit-mask-image:radial-gradient(ellipse 70% 60% at 70% 30%,#000 10%,transparent 70%);opacity:.7;pointer-events:none}
.hero .wrap{position:relative;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.08fr);gap:48px;align-items:center}
@media (max-width:920px){.hero{padding-top:40px}.hero .wrap{grid-template-columns:1fr;gap:36px}}
.pill{display:inline-flex;gap:8px;align-items:center;font-size:13px;font-weight:600;color:var(--muted);background:var(--card);border:1px solid var(--line2);border-radius:999px;padding:5px 12px 5px 6px;margin-bottom:22px}
.pill b{background:var(--accent);color:#fff;border-radius:999px;padding:2px 8px;font-size:11px;letter-spacing:.04em;text-transform:uppercase}
h1{font-size:clamp(40px,6.4vw,76px);line-height:.98;letter-spacing:-.045em;font-weight:850;margin:0 0 22px;text-wrap:balance}
h1 em{font-style:normal;background:linear-gradient(transparent 62%,var(--mark) 62%,var(--mark) 92%,transparent 92%);padding:0 .06em}
.lede{color:var(--muted);font-size:clamp(17px,1.6vw,19px);margin:0 0 30px;max-width:33em;text-wrap:pretty}
.ctas{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:22px}
.facts{display:flex;flex-wrap:wrap;gap:6px 18px;padding:0;margin:0;list-style:none;font-size:13.5px;color:var(--muted)}.facts li::before{content:"✓";color:var(--accent);font-weight:800;margin-right:6px}
.stage{position:relative;min-height:440px}
.win{position:relative;border-radius:16px;border:1px solid var(--line2);background:var(--card);box-shadow:var(--shadow);overflow:hidden}
.bar{display:flex;align-items:center;gap:10px;height:38px;padding:0 12px;border-bottom:1px solid var(--line);background:var(--soft);font-size:12.5px;color:var(--muted)}
.dots{display:flex;gap:6px}.dots i{width:10px;height:10px;border-radius:50%;background:var(--line2)}
.url{flex:1;min-width:0;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:3px 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.url b{color:var(--fg);font-weight:600}
.view{position:relative;aspect-ratio:16/10;overflow:hidden;background:var(--soft)}
.view iframe{position:absolute;top:0;left:0;width:200%;height:200%;border:0;transform:scale(.5);transform-origin:0 0;pointer-events:none}
.term{position:absolute;left:-28px;bottom:-26px;width:min(400px,86%);background:#111110;color:#e9e6de;border-radius:14px;border:1px solid #2b2a27;box-shadow:0 24px 60px -18px rgba(0,0,0,.55);padding:14px 16px 16px;font-size:12.8px;line-height:1.7}
.term .t{display:flex;gap:6px;margin-bottom:10px}.term .t i{width:9px;height:9px;border-radius:50%;background:#3a3935}
.term p{margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;animation:in .4s ease forwards}
.term p:nth-of-type(1){animation-delay:.3s}.term p:nth-of-type(2){animation-delay:1.1s}.term p:nth-of-type(3){animation-delay:1.7s}.term p:nth-of-type(4){animation-delay:2.4s}
.term .p{color:#8ea2ff}.term .ok{color:#7ee2a8}.term .dim{color:#8c887f}.term u{text-decoration:none;color:#fff;border-bottom:1px dashed #7ee2a8}
@keyframes in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@media (max-width:920px){.term{left:12px;bottom:-30px}.stage{min-height:0;margin-bottom:30px}}
@media (prefers-reduced-motion:reduce){.term p{animation:none;opacity:1}.btn{transition:none}}
.strip{border-block:1px solid var(--line);background:var(--card)}
.strip ul{display:grid;grid-template-columns:repeat(4,1fr);gap:0;list-style:none;margin:0 auto;padding:0}
.strip li{padding:22px 20px;border-left:1px solid var(--line);font-size:14px;color:var(--muted)}.strip li:first-child{border-left:0}.strip b{display:block;color:var(--fg);font-size:15.5px;margin-bottom:2px}
@media (max-width:760px){.strip ul{grid-template-columns:1fr 1fr}.strip li:nth-child(3){border-left:0}.strip li:nth-child(n+3){border-top:1px solid var(--line)}}
section{padding:88px 0 0}
.eyebrow{font-size:12.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);margin:0 0 10px}
h2{font-size:clamp(28px,3.6vw,42px);line-height:1.05;letter-spacing:-.035em;font-weight:820;margin:0 0 12px;text-wrap:balance}
.sub{color:var(--muted);font-size:17px;margin:0 0 34px;max-width:36em}
.head{display:flex;justify-content:space-between;align-items:end;gap:20px;flex-wrap:wrap}.head .btn{margin-bottom:34px}@media (max-width:640px){.head .btn{display:none}}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;padding:0;margin:0;list-style:none}
.card{display:flex;flex-direction:column;height:100%;background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;text-decoration:none;color:var(--fg);transition:transform .18s,box-shadow .18s,border-color .18s}
.card:hover{transform:translateY(-3px);box-shadow:var(--shadow);border-color:var(--line2)}
.card .view{aspect-ratio:16/10;border-bottom:1px solid var(--line)}
.card .view iframe{width:400%;height:400%;transform:scale(.25)}
.card .view::after{content:"";position:absolute;inset:0}
.card .md{position:absolute;inset:14px 14px 0;padding:20px 22px;border:1px solid var(--line);border-bottom:0;border-radius:10px 10px 0 0;background:var(--card);color:var(--fg);font-size:13px;line-height:1.5;overflow:hidden;mask-image:linear-gradient(#000 60%,transparent);-webkit-mask-image:linear-gradient(#000 60%,transparent)}
.card .md b{display:block;font-size:20px;letter-spacing:-.02em;margin-bottom:8px}
.meta{display:flex;flex-direction:column;gap:6px;padding:16px 18px 18px;flex:1}
.meta b{font-size:16.5px;line-height:1.3;letter-spacing:-.01em}
.meta span{color:var(--muted);font-size:14px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.who{display:flex;align-items:center;gap:8px;margin-top:auto;padding-top:8px;font-size:13px;color:var(--faint)}
.who img,.who .av{width:22px;height:22px;border-radius:50%;background:var(--soft);border:1px solid var(--line)}
.who strong{color:var(--muted);font-weight:600}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;padding:0;margin:0;list-style:none;counter-reset:s}
@media (max-width:860px){.steps{grid-template-columns:1fr}}
.steps li{position:relative;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:26px 24px;counter-increment:s;color:var(--muted)}
.steps li::before{content:"0" counter(s);display:block;font:800 13px/1 ui-monospace,Menlo,monospace;color:var(--accent);margin-bottom:18px;letter-spacing:.06em}
.steps b{display:block;color:var(--fg);font-size:19px;letter-spacing:-.02em;margin-bottom:6px}
.steps code{font-size:12.5px;background:var(--soft);border:1px solid var(--line);border-radius:6px;padding:1px 6px;color:var(--fg)}
.demo{margin:0;border-radius:20px;overflow:hidden;border:1px solid var(--line2);background:#000;aspect-ratio:16/9;box-shadow:var(--shadow)}.demo video{display:block;width:100%;height:100%}
.install{margin-top:88px;background:var(--ink);color:var(--onink);border-radius:24px;padding:clamp(28px,5vw,56px);display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:36px;align-items:center}
@media (max-width:860px){.install{grid-template-columns:1fr}}
.install h2{color:var(--onink)}.install p{color:#b9b5ac;margin:0}.install .eyebrow{color:#9fb0ff}
.install pre{margin:0;background:#1d1c1a;border:1px solid #2f2e2a;border-radius:14px;padding:18px 20px;overflow-x:auto;font-size:13.5px;line-height:1.85;color:#e9e6de}
.install pre .c{color:#7d796f}.install pre .p{color:#8ea2ff;user-select:none}
.install a{color:#b3c0ff}
.why{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}@media (max-width:900px){.why{grid-template-columns:1fr 1fr}}@media (max-width:520px){.why{grid-template-columns:1fr}}
.why div{border-top:2px solid var(--fg);padding-top:16px;color:var(--muted);font-size:15px}.why b{display:block;color:var(--fg);font-size:17px;letter-spacing:-.01em;margin-bottom:4px}
.empty{color:var(--muted)}
.page{max-width:780px;padding:56px 20px 0}.page h1{font-size:clamp(36px,5vw,56px)}
dl{margin:0}dt{font-weight:700;font-size:17px;margin-top:26px;letter-spacing:-.01em}dd{margin:6px 0 0;color:var(--muted)}
.page h2{margin-top:56px}.page p{color:var(--muted)}.page code{background:var(--soft);border:1px solid var(--line);border-radius:6px;padding:1px 6px;font-size:.9em}
footer{margin-top:96px;border-top:1px solid var(--line);padding:28px 0 48px;color:var(--faint);font-size:14px}
footer .wrap{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}footer a{color:var(--muted)}
`;

const rootOf = (base: string) =>
	new URL(`${base}/`).pathname.replace(/\/$/, "");

function layout(base: string, meta: PageMeta, body: string): string {
	const root = rootOf(base);
	return `<!doctype html><html lang="${SITE.lang}"><head>
<meta http-equiv="Content-Security-Policy" content="${POLICY}">
${head(base, meta)}
<style>${STYLE}</style></head><body>
<header class="top"><div class="wrap"><a class="brand" href="${root}/"><img src="${root}/icon.svg" alt="" width="26" height="26">${esc(SITE.name)}<span>.flisk.si</span></a><nav aria-label="Site"><a class="hide-sm" href="${root}/#spaces">Spaces</a><a class="hide-sm" href="${root}/#how">How it works</a><a href="${root}/about">FAQ</a><a class="gh" href="${SITE.repo}">GitHub</a></nav></div></header>
<main>
${body}
</main>
<footer><div class="wrap"><span>Every space is public, free and a git branch in <a href="${SITE.repo}">${SITE.repoSlug}</a>. No keys, no database, no tracking.</span><span>Made by <a href="${SITE.author.url}">${esc(SITE.author.name)}</a> · <a href="${root}/about">FAQ</a> · <a href="${root}/spaces.json">spaces.json</a></span></div></footer>
</body></html>`;
}

const ago = (iso: string, now: Date) => {
	const days = Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000);
	return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
};

const avatar = (handle: string) =>
	handle === "anon"
		? '<span class="av" aria-hidden="true"></span>'
		: `<img src="https://avatars.githubusercontent.com/${esc(handle)}?s=48" alt="" width="22" height="22" loading="lazy">`;

/** A live, scaled-down view of the space: a sandboxed frame for HTML, the opening lines for Markdown. */
function preview(root: string, s: Space): string {
	if (s.kind === "md")
		return `<div class="view"><div class="md" aria-hidden="true"><b>${esc(s.title)}</b>${esc(s.description)}</div></div>`;
	return `<div class="view"><iframe src="${root}/${spacePath(s)}" sandbox="allow-scripts" loading="lazy" tabindex="-1" aria-hidden="true" title="${esc(s.title)}" referrerpolicy="no-referrer"></iframe></div>`;
}

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
				`<li><a class="card" href="${root}/${spacePath(s)}">${preview(root, s)}<div class="meta"><b>${esc(s.title)}</b>${s.description ? `<span>${esc(s.description)}</span>` : ""}<small class="who">${withHandle ? `${avatar(s.handle)}<strong>@${esc(s.handle)}</strong> · ` : ""}v${s.versions} · ${ago(s.updated, now)}</small></div></a></li>`,
		)
		.join("")}</ul>`;
}

/** The one-minute demo on the home page: static/, rendered by flisk-video-factory's render-pages. */
export const DEMO = {
	video: "demo.mp4",
	poster: "demo.jpg",
	captions: "demo.vtt",
} as const;

const INSTALL = `<span class="c"># in your terminal</span>
<span class="p">$ </span>claude plugin marketplace add ${SITE.repoSlug}
<span class="p">$ </span>claude plugin install pages@flisk-pages

<span class="c"># then ask Claude Code</span>
<span class="p">› </span>publish ./my-page to pages`;

/** The space shown in the hero: an interactive one, the radar or the GPU explainer when they are there. */
function featured(spaces: Space[]): Space | undefined {
	const html = spaces.filter((s) => s.kind === "html" && s.handle !== "anon");
	return (
		html.find((s) => s.slug === "devex-radar") ??
		html.find((s) => s.slug === "how-gpus-work") ??
		html[0]
	);
}

/** How many spaces the home page shows. The rest are one click away in spaces.json and on each handle's page. */
export const SHOWCASE_MAX = 9;

/**
 * The shelf on the home page: the newest spaces people published under their own GitHub handle. One-click anonymous
 * spaces (a visitor's CV, a note) are not a showcase and stay off it; they are still reachable by their link.
 */
export function showcase(spaces: Space[]): Space[] {
	return spaces.filter((s) => s.handle !== "anon").slice(0, SHOWCASE_MAX);
}

export function homePage(
	base: string,
	spaces: Space[],
	now = new Date(),
): string {
	const root = rootOf(base);
	const host = esc(new URL(base).host);
	const hero = featured(spaces);
	const heroUrl = hero
		? `${host}/<b>${esc(spacePath(hero))}</b>`
		: `${host}/<b>@you/name/</b>`;
	const heroPath = hero
		? `@${esc(hero.handle)}/${esc(hero.slug)}`
		: "@you/name";
	return layout(
		base,
		{
			path: "",
			title: `${SITE.name}: ${SITE.tagline}`,
			description: SITE.description,
		},
		`<div class="hero"><div class="wrap">
<div>
<p class="pill"><b>Free</b>No keys, no database, no account for readers</p>
<h1>Your agent builds a page. One command makes it <em>a link.</em></h1>
<p class="lede">Dashboards, explainers, comparisons, app mockups: whatever your agent made, publish it to <strong>${host}/@you/name</strong> in about a minute. Every space is a git branch; every version is a commit.</p>
<div class="ctas"><a class="btn primary" href="#install">Install for Claude Code</a><a class="btn" href="#spaces">See live spaces →</a></div>
<ul class="facts"><li>Open source</li><li>Interactive HTML or Markdown</li><li>Versions you can diff</li></ul>
</div>
<div class="stage">
<div class="win"><div class="bar"><span class="dots"><i></i><i></i><i></i></span><span class="url">${heroUrl}</span></div>${
			hero
				? `<div class="view"><iframe src="${root}/${spacePath(hero)}" sandbox="allow-scripts" tabindex="-1" aria-hidden="true" title="${esc(hero.title)}" referrerpolicy="no-referrer"></iframe></div>`
				: `<div class="view"><img src="${root}/${DEMO.poster}" alt="" style="width:100%;height:100%;object-fit:cover"></div>`
		}</div>
<div class="term mono" aria-label="Publishing from Claude Code"><div class="t"><i></i><i></i><i></i></div>
<p><span class="p">›</span> publish ./${esc(hero?.slug ?? "my-page")} to pages</p>
<p><span class="ok">✓</span> checked every file <span class="dim">· nothing runs</span></p>
<p><span class="ok">✓</span> pull request opened and merged</p>
<p><span class="ok">✓</span> live at <u>${host}/${heroPath}</u></p>
</div>
</div>
</div></div>
<div class="strip"><ul class="wrap">
<li><b>One branch per space</b>space/you/name, in a public repo</li>
<li><b>A check you can read</b>One file decides what may publish</li>
<li><b>Nothing to sign up for</b>Your GitHub, your fork, your PR</li>
<li><b>Zero tracking</b>No cookies, no analytics, no ads</li>
</ul></div>
<div class="wrap">
<section id="spaces"><div class="head"><div><p class="eyebrow">Made with ${esc(SITE.name)}</p><h2>Real pages, live right now</h2><p class="sub">Each one was built by an agent and published with one command. Click any to open it.</p></div><a class="btn" href="${root}/spaces.json">All spaces as JSON</a></div>
${cards(base, showcase(spaces), now)}</section>
<section id="how"><p class="eyebrow">How it works</p><h2>From a folder to a link in three steps</h2><p class="sub">No build step, no hosting account, no API key. The whole pipeline is GitHub Pages and a pull request.</p>
<ol class="steps">
<li><b>Your agent builds it</b>One folder with an <code>index.html</code> and its scripts, data and images, or just an <code>index.md</code>.</li>
<li><b>It opens a pull request</b>From your fork, signed in with your own GitHub. A check reads every file; nothing in your space runs on our side.</li>
<li><b>It is a link</b>The space lands on its own branch and goes live at <code>${host}/@you/name</code>. Publish again for a new version.</li>
</ol></section>
<section><p class="eyebrow">Watch</p><h2>The whole thing in 60 seconds</h2><p class="sub">An agent builds a GPU explainer, publishes it, and the link works.</p>
<figure class="demo"><video controls playsinline preload="none" poster="${root}/${DEMO.poster}" aria-label="One-minute demo: an agent builds a page and publishes it to ${host}"><source src="${root}/${DEMO.video}" type="video/mp4"><track kind="captions" src="${root}/${DEMO.captions}" srclang="en" label="English" default></video></figure></section>
<section><p class="eyebrow">Why ${esc(SITE.name)}</p><h2>Made for what agents build</h2><p class="sub">Not another hosting dashboard. A shared shelf for interactive pages, kept in git.</p>
<div class="why">
<div><b>Interactive, not static</b>Charts, sliders, 3D, maps: scripts from the space or the big CDNs just work.</div>
<div><b>Versions for free</b>Every publish is a commit. Diff any two versions on GitHub.</div>
<div><b>Safe to open</b>Every page runs under a strict policy: no forms posting away, no password fields, no trackers.</div>
<div><b>Yours to take down</b>Open an issue titled "Remove @you/name" and the branch is gone in a minute.</div>
</div></section>
<div class="install" id="install"><div><p class="eyebrow">Get started</p><h2>Publish your first page</h2><p>Two commands in your terminal, then ask your agent. Needs the GitHub CLI signed in. No agent? <a href="${SITE.repo}#publish">Use the CLI</a>.</p></div>
<pre>${INSTALL}</pre></div>
</div>`,
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
		`<div class="wrap"><section style="padding-top:56px"><p class="who" style="font-size:15px">${avatar(handle)}<strong>@${esc(handle)}</strong></p><h1>@${esc(handle)}</h1>
<p class="lede">${spaces.length} public space${spaces.length === 1 ? "" : "s"}.${handle === "anon" ? "" : ` <a href="https://github.com/${esc(handle)}">github.com/${esc(handle)}</a>`}</p>
${cards(base, spaces, now, false)}</section></div>`,
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
		`<div class="wrap page"><p class="eyebrow">FAQ</p><h1>About ${esc(SITE.name)}</h1>
<p class="lede">${esc(SITE.description)}</p>
<h2>Questions</h2>
<dl>${SITE.faq.map((f) => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`).join("")}</dl>
<h2>The rules, exactly</h2>
<p>At most ${LIMITS.files} files and ${LIMITS.totalBytes / 1048576} MB. Scripts from the space or ${SCRIPT_HOSTS.map(esc).join(", ")}. Frames from ${FRAME_HOSTS.map(esc).join(", ")}. The check is <a href="${SITE.repo}/blob/main/services/app/web/src/check.mjs">one file</a>; run it yourself with <code>node bin/pages.mjs check ./folder</code>.</p></div>`,
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
		`<div class="wrap page"><h1>Page not found</h1><p class="lede">A space lives at <code>/@&lt;github login&gt;/&lt;name&gt;/</code>. It may have been removed by its publisher. <a href="${root}/">See the newest spaces</a>.</p></div>`,
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
