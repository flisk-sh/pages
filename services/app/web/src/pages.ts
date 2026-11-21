// The site's own pages, written once at build time with no JavaScript: home with the newest spaces, a publisher's
// spaces, about with the FAQ, and not found. Each one passes its own PageMeta to head(), which writes every SEO tag.
// GitHub Pages sends no headers, so the policy that allows no scripts is a <meta> at the top of the head.
import { FRAME_HOSTS, LIMITS, SCRIPT_HOSTS } from "./check.mjs";
import {
	COPY,
	DEFAULT_LANG,
	DETECT,
	DETECT_HASH,
	LANG_NAME,
	LANGS,
	type Lang,
	langPath,
} from "./i18n";
import { esc, faqJsonLd, head, type PageMeta } from "./seo";
import { SITE } from "./site";
import { links, type Space, spacePath } from "./spaces";

// Spaces are previewed live in sandboxed frames (no allow-same-origin, so a space cannot reach this page), and
// publishers' GitHub avatars, the DevHunt footer badge and Flisk org-bar icons are the images from elsewhere.
const policyFor = (lang: Lang) =>
	`default-src 'none'; script-src ${lang === DEFAULT_LANG ? `${DETECT_HASH} ` : ""}https://flisk.si https://flisk.sh; connect-src https://analytics.flisk.si https://flisk.si; style-src 'unsafe-inline' https://flisk.si; font-src https://flisk.si; img-src 'self' https://avatars.githubusercontent.com https://devhunt.org https://flisk.si; media-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'`;

const STYLE = `
:root{--bg:${SITE.themeColor.light};--fg:#141413;--muted:#66625b;--faint:#97928a;--line:#e7e2d8;--line2:#d6d0c3;--card:#fff;--soft:#f3f0e9;--accent:#2d4cc8;--accent2:#5b74ff;--mark:#ffe27a;--ink:#141413;--onink:#f4f2ec;--shadow:0 1px 2px rgba(20,20,19,.06),0 12px 40px -12px rgba(20,20,19,.18)}
@media (prefers-color-scheme:dark){:root{--bg:${SITE.themeColor.dark};--fg:#f1efe9;--muted:#aaa59b;--faint:#7d796f;--line:#2a2926;--line2:#3a3834;--card:#1c1b19;--soft:#201f1c;--accent:#8ea2ff;--accent2:#b3c0ff;--mark:rgba(142,162,255,.38);--ink:#0b0b0a;--onink:#f1efe9;--shadow:0 1px 2px rgba(0,0,0,.4),0 16px 48px -16px rgba(0,0,0,.7)}}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Devanagari","Kohinoor Devanagari","Nirmala UI",Mangal,sans-serif;-webkit-font-smoothing:antialiased}
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
footer .langs{display:flex;gap:8px;align-items:center}footer .langs a[aria-current]{color:var(--fg);font-weight:700;text-decoration:none}
html[lang=hi] body{line-height:1.75}html[lang=hi] :is(h1,h2,.brand,.strip b,.steps b,.why b,.meta b,dt,.eyebrow,.pill b){letter-spacing:0;text-transform:none}
html[lang=hi] h1{line-height:1.3;font-weight:800}html[lang=hi] h2{line-height:1.35}html[lang=hi] .lede,html[lang=hi] .sub{max-width:none}
footer .wrap{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}footer a{color:var(--muted)}footer .badge{flex-basis:100%}footer .badge img{display:block}
`;

const rootOf = (base: string) =>
	new URL(`${base}/`).pathname.replace(/\/$/, "");

/** The same page in every language: "about" → { en: "about", hi: "hi/about" }. */
const altOf = (rel: string): Partial<Record<Lang, string>> =>
	Object.fromEntries(LANGS.map((l) => [l, langPath(l, rel)]));

function layout(
	base: string,
	meta: PageMeta,
	body: string,
	policy = policyFor(meta.lang ?? DEFAULT_LANG),
): string {
	const root = rootOf(base);
	const lang = meta.lang ?? DEFAULT_LANG;
	const t = COPY[lang];
	// Hindi pages carry no script of their own; going back to English asks the English page to remember it (?lang=en).
	const switcher = LANGS.map((l) => {
		const target = meta.alt?.[l] ?? langPath(l, "");
		const href = `${root}/${target}${l === DEFAULT_LANG && lang !== DEFAULT_LANG ? "?lang=en" : ""}`;
		return `<a href="${href}" hreflang="${l}" lang="${l}"${l === lang ? ' aria-current="true"' : ""}>${esc(LANG_NAME[l])}</a>`;
	}).join(" · ");
	const home = `${root}/${langPath(lang, "")}`;
	const about = `${root}/${langPath(lang, "about")}`;
	return `<!doctype html><html lang="${lang}"><head>
<meta http-equiv="Content-Security-Policy" content="${policy}">
${head(base, meta)}
${lang === DEFAULT_LANG ? `<script>${DETECT}</script>\n` : ""}<style>${STYLE}</style><script defer data-domain="pages.flisk.si" src="https://flisk.sh/a.js"></script><script src="https://flisk.si/assets/bar.js" data-product="Pages" data-icon="put-my-page-online" data-accent="#2d4cc8" data-text="Put a page online with a public link in one step." defer></script></head><body>
<header class="top"><div class="wrap"><a class="brand" href="${home}"><img src="${root}/icon.svg" alt="" width="26" height="26">${esc(SITE.name)}<span>.flisk.si</span></a><nav aria-label="${esc(t.navLabel)}"><a class="hide-sm" href="${home}#spaces">${esc(t.navSpaces)}</a><a class="hide-sm" href="${home}#how">${esc(t.navHow)}</a><a href="${about}">${esc(t.navFaq)}</a><a class="gh" href="${SITE.repo}">GitHub</a></nav></div></header>
<main>
${body}
</main>
<footer><div class="wrap"><span>${t.footerHtml(`<a href="${SITE.repo}">${SITE.repoSlug}</a>`)}</span><span>${t.madeByHtml(`<a href="${SITE.author.url}">${esc(SITE.author.name)}</a>`, `<a href="${about}">${esc(t.navFaq)}</a>`, `<a href="${root}/spaces.json">spaces.json</a>`)}</span><span class="langs" role="group" aria-label="${esc(t.switcherLabel)}">${switcher}</span><div class="badge"><a href="https://devhunt.org/tool/pages" target="_blank" rel="noopener" title="Pages on DevHunt"><img src="https://devhunt.org/badge/pages.svg" alt="Pages - Featured on DevHunt" width="220" height="54" loading="lazy"></a></div></div></footer>
</body></html>`;
}

const ago = (iso: string, now: Date, lang: Lang) =>
	COPY[lang].ago(Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000));

const avatar = (handle: string) =>
	handle === "anon"
		? '<span class="av" aria-hidden="true"></span>'
		: `<img src="https://avatars.githubusercontent.com/${esc(handle)}?s=48" alt="" width="22" height="22" loading="lazy">`;

/** A live, scaled-down view of the space in a sandboxed frame; the page bar removes itself inside it. */
function preview(root: string, s: Space): string {
	return `<div class="view"><iframe src="${root}/${spacePath(s)}" sandbox="allow-scripts" loading="lazy" tabindex="-1" aria-hidden="true" title="${esc(s.title)}" referrerpolicy="no-referrer"></iframe></div>`;
}

// A space's title and description are its publisher's words and are shown as written, in every language.
function cards(
	base: string,
	spaces: Space[],
	now: Date,
	lang: Lang,
	withHandle = true,
): string {
	if (!spaces.length) return `<p class="empty">${esc(COPY[lang].noSpaces)}</p>`;
	const root = rootOf(base);
	return `<ul class="grid">${spaces
		.map(
			(s) =>
				`<li><a class="card" href="${root}/${spacePath(s)}">${preview(root, s)}<div class="meta"><b>${esc(s.title)}</b>${s.description ? `<span>${esc(s.description)}</span>` : ""}<small class="who">${withHandle ? `${avatar(s.handle)}<strong>@${esc(s.handle)}</strong> · ` : ""}v${s.versions} · ${esc(ago(s.updated, now, lang))}</small></div></a></li>`,
		)
		.join("")}</ul>`;
}

/** The one-minute demo on the home page: static/, rendered by flisk-video-factory's render-pages. */
export const DEMO = {
	video: "demo.mp4",
	poster: "demo.jpg",
	captions: "demo.vtt",
} as const;

// Commands and what the terminal prints stay as they are in every language: they are what the reader types.
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
	lang: Lang = DEFAULT_LANG,
): string {
	const t = COPY[lang];
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
			lang,
			path: langPath(lang, ""),
			alt: altOf(""),
			title: `${SITE.name}: ${t.tagline}`,
			description: t.description,
		},
		`<div class="hero"><div class="wrap">
<div>
<p class="pill"><b>${esc(t.pillTag)}</b>${esc(t.pillText)}</p>
<h1>${t.heroHtml}</h1>
<p class="lede">${t.ledeHtml(host)}</p>
<div class="ctas"><a class="btn primary" href="#install">${esc(t.ctaInstall)}</a><a class="btn" href="#spaces">${esc(t.ctaSpaces)}</a></div>
<ul class="facts">${t.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
</div>
<div class="stage">
<div class="win"><div class="bar"><span class="dots"><i></i><i></i><i></i></span><span class="url">${heroUrl}</span></div>${
			hero
				? `<div class="view"><iframe src="${root}/${spacePath(hero)}" sandbox="allow-scripts" tabindex="-1" aria-hidden="true" title="${esc(hero.title)}" referrerpolicy="no-referrer"></iframe></div>`
				: `<div class="view"><img src="${root}/${DEMO.poster}" alt="" style="width:100%;height:100%;object-fit:cover"></div>`
		}</div>
<div class="term mono" aria-label="${esc(t.termLabel)}"><div class="t"><i></i><i></i><i></i></div>
<p><span class="p">›</span> publish ./${esc(hero?.slug ?? "my-page")} to pages</p>
<p><span class="ok">✓</span> ${esc(t.termChecked)} <span class="dim">${esc(t.termDim)}</span></p>
<p><span class="ok">✓</span> ${esc(t.termPr)}</p>
<p><span class="ok">✓</span> ${esc(t.termLive)} <u>${host}/${heroPath}</u></p>
</div>
</div>
</div></div>
<div class="strip"><ul class="wrap">
${t.strip.map(([b, rest]) => `<li><b>${esc(b)}</b>${esc(rest)}</li>`).join("\n")}
</ul></div>
<div class="wrap">
<section id="spaces"><div class="head"><div><p class="eyebrow">${esc(t.showEyebrow(SITE.name))}</p><h2>${esc(t.showTitle)}</h2><p class="sub">${esc(t.showSub)}</p></div><a class="btn" href="${root}/spaces.json">${esc(t.showJson)}</a></div>
${cards(base, showcase(spaces), now, lang)}</section>
<section id="how"><p class="eyebrow">${esc(t.howEyebrow)}</p><h2>${esc(t.howTitle)}</h2><p class="sub">${esc(t.howSub)}</p>
<ol class="steps">
${t.steps.map(([b, rest]) => `<li><b>${esc(b)}</b>${rest(host)}</li>`).join("\n")}
</ol></section>
<section><p class="eyebrow">${esc(t.watchEyebrow)}</p><h2>${esc(t.watchTitle)}</h2><p class="sub">${esc(t.watchSub)}</p>
<figure class="demo"><video controls playsinline preload="none" poster="${root}/${DEMO.poster}" aria-label="${esc(t.videoLabel(host))}"><source src="${root}/${DEMO.video}" type="video/mp4"><track kind="captions" src="${root}/${DEMO.captions}" srclang="en" label="${esc(t.videoTrackLabel)}" default></video></figure></section>
<section><p class="eyebrow">${esc(t.whyEyebrow(SITE.name))}</p><h2>${esc(t.whyTitle)}</h2><p class="sub">${esc(t.whySub)}</p>
<div class="why">
${t.why.map(([b, rest]) => `<div><b>${esc(b)}</b>${esc(rest)}</div>`).join("\n")}
</div></section>
<div class="install" id="install"><div><p class="eyebrow">${esc(t.installEyebrow)}</p><h2>${esc(t.installTitle)}</h2><p>${t.installHtml(SITE.repo)}</p></div>
<pre>${INSTALL}</pre></div>
</div>`,
	);
}

export function handlePage(
	base: string,
	handle: string,
	spaces: Space[],
	now = new Date(),
	lang: Lang = DEFAULT_LANG,
): string {
	const t = COPY[lang];
	const rel = `@${handle}/`;
	return layout(
		base,
		{
			lang,
			path: langPath(lang, rel),
			alt: altOf(rel),
			title: t.handleTitle(handle),
			description: t.handleDescription(spaces.length, handle, SITE.name),
			crumbs: [{ name: `@${handle}`, path: langPath(lang, rel) }],
		},
		`<div class="wrap"><section style="padding-top:56px"><p class="who" style="font-size:15px">${avatar(handle)}<strong>@${esc(handle)}</strong></p><h1>@${esc(handle)}</h1>
<p class="lede">${esc(t.handleCount(spaces.length))}${handle === "anon" ? "" : ` <a href="https://github.com/${esc(handle)}">github.com/${esc(handle)}</a>`}</p>
${cards(base, spaces, now, lang, false)}</section></div>`,
	);
}

export function aboutPage(base: string, lang: Lang = DEFAULT_LANG): string {
	const t = COPY[lang];
	return layout(
		base,
		{
			lang,
			path: langPath(lang, "about"),
			alt: altOf("about"),
			title: t.aboutTitle,
			description: t.aboutDescription(SITE.name),
			jsonLd: [faqJsonLd(lang)],
			crumbs: [{ name: t.aboutEyebrow, path: langPath(lang, "about") }],
		},
		`<div class="wrap page"><p class="eyebrow">${esc(t.aboutEyebrow)}</p><h1>${esc(t.aboutH1(SITE.name))}</h1>
<p class="lede">${esc(t.description)}</p>
<h2>${esc(t.aboutQuestions)}</h2>
<dl>${t.faq.map((f) => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`).join("")}</dl>
<h2>${esc(t.aboutRules)}</h2>
<p>${t.rulesHtml(
			LIMITS.files,
			LIMITS.totalBytes / 1048576,
			SCRIPT_HOSTS.map(esc).join(", "),
			FRAME_HOSTS.map(esc).join(", "),
			`<a href="${SITE.repo}/blob/main/services/app/web/src/check.mjs">${esc(t.rulesCheck)}</a>`,
		)}</p></div>`,
	);
}

// The share page runs one same-origin script and nothing else. It is the only page that allows scripts.
const sharePolicyFor = (lang: Lang) =>
	`default-src 'none'; script-src 'self' ${lang === DEFAULT_LANG ? `${DETECT_HASH} ` : ""}https://flisk.si https://flisk.sh; connect-src https://analytics.flisk.si https://flisk.si; style-src 'unsafe-inline' https://flisk.si; font-src https://flisk.si; img-src 'self' https://devhunt.org https://flisk.si; base-uri 'none'; form-action 'none'`;

export function sharePage(
	base: string,
	integrity: string,
	scriptPath: string,
	lang: Lang = DEFAULT_LANG,
): string {
	const t = COPY[lang];
	return layout(
		base,
		{
			lang,
			path: langPath(lang, "share"),
			alt: altOf("share"),
			title: t.shareTitle,
			description: t.shareDescription,
			jsonLd: [],
			crumbs: [{ name: "Share", path: langPath(lang, "share") }],
		},
		`<style>
#f label{display:block;margin:16px 0 0;font-size:1rem}
#f input,#f textarea{display:block;width:100%;box-sizing:border-box;min-height:44px;margin-top:8px;padding:10px;font:inherit;border:1px solid var(--line2);border-radius:8px;background:var(--card);color:var(--fg)}
#f textarea{min-height:110px}
#f button,.card a.btn{display:block;width:100%;box-sizing:border-box;min-height:48px;margin-top:16px;padding:12px;font:inherit;font-weight:600;border:0;border-radius:10px;background:var(--fg);color:var(--bg);text-align:center;text-decoration:none;cursor:pointer}
.card{border:1px solid var(--line);border-radius:12px;padding:16px;margin:16px 0;background:var(--card)}
.card .pass{font:600 1.25rem ui-monospace,monospace;letter-spacing:.06em;overflow-wrap:anywhere}
.card label{display:flex;gap:10px;align-items:flex-start;margin:12px 0;font-size:.95rem}
.card label input{width:22px;height:22px;min-height:0;margin:2px 0 0;flex:none}
.card a.btn[aria-disabled="true"]{opacity:.45;pointer-events:none}
.card button{display:block;width:100%;min-height:48px;margin-top:10px;border-radius:10px;border:1px solid var(--line2);background:var(--card);color:var(--fg);font:inherit;font-weight:600}
</style>
<div class="wrap page"><p class="eyebrow">${esc(t.shareEyebrow)}</p><h1>${esc(t.shareH1)}</h1>
<p class="lede">${esc(t.shareLede)}</p>
<form id="f" ${Object.entries(t.shareJs)
			.map(([k, v]) => `data-${k}="${esc(v)}"`)
			.join(
				" ",
			)}><label>${esc(t.sharePage)} <input id="page" type="file" accept=".html,text/html"></label>
<label>${esc(t.sharePaste)} <textarea id="paste" rows="6" spellcheck="false" autocapitalize="off"></textarea></label>
<label>${esc(t.shareNames)} <textarea id="names" rows="3" placeholder="${esc(t.shareNamesExample)}"></textarea></label>
<button type="submit">${esc(t.shareSubmit)}</button></form>
<p id="m" role="status"></p><div id="out"></div>
<p class="muted">${t.shareWarnHtml(`${SITE.repo}/blob/main/bin/seal.js`)}</p>
<script type="module" src="${rootOf(base)}${scriptPath}" integrity="${integrity}" crossorigin="anonymous"></script></div>`,
		sharePolicyFor(lang),
	);
}

// Not found is one file (GitHub Pages serves 404.html for every missing address), so it is English only.
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
