// The pages, rendered on the server with no JavaScript (the Content-Security-Policy allows none): home, a result,
// about with the FAQ, and not found. Each one passes its own PageMeta to head(), which writes every SEO tag.
import { type Result, summarize } from "./contrast";
import { esc, faqJsonLd, head, type PageMeta } from "./seo";
import { SITE } from "./site";

const STYLE = `
:root{--bg:${SITE.themeColor.light};--fg:#1d1c1a;--muted:#6b6862;--line:#e6e2da;--card:#fff;--pass:#1f7a4d;--fail:#b3261e;--accent:#2d4cc8}
@media (prefers-color-scheme:dark){:root{--bg:${SITE.themeColor.dark};--fg:#efede8;--muted:#a19d95;--line:#2c2b28;--card:#1c1b19;--pass:#5fc28e;--fail:#f07a70;--accent:#8ea2ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto;padding:40px 16px 80px}a{color:var(--accent)}
h1{font-size:clamp(28px,6vw,44px);line-height:1.1;letter-spacing:-.02em;margin:0 0 12px}h2{font-size:20px;margin:36px 0 8px}
.lede{color:var(--muted);font-size:18px;margin:0 0 28px}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:28px;font-size:14px}.top>a{color:var(--fg);text-decoration:none;font-weight:700;display:flex;gap:8px;align-items:center}
form{display:flex;gap:8px;flex-wrap:wrap;align-items:center}label{display:flex;gap:8px;align-items:center;font-weight:600}
input[type=color]{width:52px;height:44px;padding:2px;border:1px solid var(--line);border-radius:10px;background:var(--card)}
button{font:inherit;font-weight:600;padding:11px 18px;border:0;border-radius:10px;background:var(--fg);color:var(--bg);cursor:pointer}
.chips{margin:16px 0 0;color:var(--muted);font-size:14px;display:flex;gap:10px;flex-wrap:wrap}
.chip{display:inline-flex;gap:6px;align-items:center;text-decoration:none;color:var(--fg);border:1px solid var(--line);border-radius:999px;padding:4px 10px;background:var(--card)}
.sw{width:14px;height:14px;border-radius:50%;border:1px solid var(--line);display:inline-block}
.sample{border-radius:14px;padding:28px 24px;border:1px solid var(--line);margin:8px 0 20px}.sample p{margin:0}.sample .big{font-size:24px;font-weight:700}
.ratio{font-size:clamp(40px,10vw,64px);font-weight:800;letter-spacing:-.03em;margin:0}
ul.levels{list-style:none;padding:0;margin:16px 0}ul.levels li{display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding:10px 2px}
.pass{color:var(--pass);font-weight:700}.fail{color:var(--fail);font-weight:700}
pre{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px;overflow-x:auto;font-size:13px;white-space:pre-wrap;word-break:break-all}
dt{font-weight:700;margin-top:16px}dd{margin:4px 0 0}
footer{margin-top:48px;color:var(--muted);font-size:14px}
`;

function layout(base: string, meta: PageMeta, body: string): string {
	const root = new URL(`${base}/`).pathname.replace(/\/$/, "");
	return `<!doctype html><html lang="${SITE.lang}"><head>
${head(base, meta)}
<style>${STYLE}</style></head><body><main>
<nav class="top" aria-label="Site"><a href="${root}/"><img src="${root}/icon.svg" alt="" width="24" height="24">${esc(SITE.name)}</a><a href="${root}/about">About</a></nav>
${body}
<footer>${esc(SITE.name)}: no JavaScript, no cookies, nothing stored. <a href="${SITE.repo}">Open source</a>, made by <a href="${SITE.author.url}">${esc(SITE.author.name)}</a>.</footer>
</main></body></html>`;
}

const form = (root: string, fg = "1d1c1a", bg = "fbfaf7") =>
	`<form action="${root}/check" method="get"><label>Text <input type="color" name="fg" value="#${fg}"></label><label>Background <input type="color" name="bg" value="#${bg}"></label><button type="submit">Check</button></form>`;

const chips = (root: string) =>
	`<p class="chips">${SITE.examples
		.map(
			([fg, bg]) =>
				`<a class="chip" href="${root}/${fg}/${bg}"><span class="sw" style="background:#${fg}"></span><span class="sw" style="background:#${bg}"></span>#${fg} on #${bg}</a>`,
		)
		.join("")}</p>`;

export function homePage(base: string): string {
	const root = new URL(`${base}/`).pathname.replace(/\/$/, "");
	return layout(
		base,
		{
			path: "",
			title: `${SITE.name}: ${SITE.tagline}`,
			description: SITE.description,
		},
		`<h1>${esc(SITE.tagline)}</h1>
<p class="lede">${esc(SITE.description)}</p>
${form(root)}
${chips(root)}
<h2>Or type it</h2>
<pre>${esc(base)}/1d1c1a/fbfaf7</pre>`,
	);
}

export function resultPage(base: string, r: Result): string {
	const root = new URL(`${base}/`).pathname.replace(/\/$/, "");
	const path = `${r.fg}/${r.bg}`;
	const passes = r.levels.filter((l) => l.pass).length;
	const meta: PageMeta = {
		path,
		title: `#${r.fg} on #${r.bg}: ${r.ratio.toFixed(2)}:1 contrast`,
		description: summarize(r).slice(0, 160),
		crumbs: [{ name: `#${r.fg} on #${r.bg}`, path }],
	};
	return layout(
		base,
		meta,
		`<h1 class="ratio">${r.ratio.toFixed(2)}:1</h1>
<p class="lede">#${r.fg} text on #${r.bg}: passes ${passes} of ${r.levels.length} WCAG 2.2 checks.</p>
<div class="sample" style="color:#${r.fg};background:#${r.bg}"><p class="big">Large text, 24px bold</p><p>Body text at 16px, the size most paragraphs use.</p></div>
<ul class="levels">${r.levels
			.map(
				(l) =>
					`<li><span>${esc(l.label)} (${l.min}:1)</span><span class="${l.pass ? "pass" : "fail"}">${l.pass ? "Pass" : "Fail"}</span></li>`,
			)
			.join("")}</ul>
${r.suggestion ? `<p>Nearest text color that passes AA body text: <a href="${root}/${r.suggestion}/${r.bg}"><span class="sw" style="background:#${r.suggestion}"></span> #${r.suggestion}</a></p>` : ""}
<h2>Try other colors</h2>
${form(root, r.fg, r.bg)}
<h2>Embed or call it</h2>
<pre>![contrast](${esc(base)}/badge/${path}.svg)
curl '${esc(base)}/api/contrast?fg=${r.fg}&amp;bg=${r.bg}'</pre>
<p><img src="${root}/badge/${path}.svg" alt="Contrast badge for #${r.fg} on #${r.bg}" width="150" height="20"></p>`,
	);
}

export function aboutPage(base: string): string {
	return layout(
		base,
		{
			path: "about",
			title: "About and FAQ",
			description:
				`How ${SITE.name} works, what it stores and how to call it from code or an AI assistant. ${SITE.tagline}.`.slice(
					0,
					160,
				),
			jsonLd: [faqJsonLd()],
			crumbs: [{ name: "About", path: "about" }],
		},
		`<h1>About ${esc(SITE.name)}</h1>
<p class="lede">${esc(SITE.description)}</p>
<h2>Questions</h2>
<dl>${SITE.faq.map((f) => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`).join("")}</dl>
<h2>Use it from an AI assistant</h2>
<pre>claude mcp add --transport http ${esc(SITE.name.toLowerCase())} ${esc(base)}/mcp</pre>`,
	);
}

export function notFoundPage(base: string): string {
	const root = new URL(`${base}/`).pathname.replace(/\/$/, "");
	return layout(
		base,
		{
			path: "404",
			title: "Page not found",
			description: `This address is not a page on ${SITE.name}. A result address is two hex colors: /1d1c1a/fbfaf7.`,
			noindex: true,
		},
		`<h1>Page not found</h1><p class="lede">A result address is two hex colors, text first: <a href="${root}/1d1c1a/fbfaf7">/1d1c1a/fbfaf7</a>.</p>${form(root)}`,
	);
}

/** A shields-style badge, 150×20, with the ratio colored by the AA verdict. */
export function badge(r: Result): string {
	const pass = r.levels[0].pass;
	const value = `${r.ratio.toFixed(2)}:1 ${pass ? "AA" : "fail"}`;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="20" role="img" aria-label="contrast: ${value}"><title>contrast: ${value}</title><rect width="66" height="20" fill="#555"/><rect x="66" width="84" height="20" fill="${pass ? "#1f7a4d" : "#b3261e"}"/><g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle"><text x="33" y="14">contrast</text><text x="108" y="14">${value}</text></g></svg>`;
}
