// The developer CV: a page built from someone's tool ratings on roadmap.flisk.si and roadmap's own data.json, in
// roadmap's look. Static HTML and CSS, no scripts. roadmap's one-click publish sends only the ratings and a name, and
// the anonymous publish (scripts/publish-anon.ts) builds the page here, so nobody publishes markup of their own.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CSS = readFileSync(join(import.meta.dir, "cv.css"), "utf8");

/** The parts of roadmap's assets/data.json the CV reads. */
export interface RoadmapData {
	families: { id: string; name: string; color: string }[];
	tools: Record<
		string,
		{
			id: string;
			name: string;
			sym: string;
			cat: string;
			tagline?: string;
			ring?: string;
			dx?: string[];
			parity?: string[];
		}[]
	>;
	roles: {
		roles: {
			id: string;
			name: string;
			what: string;
			core?: string[];
			daily?: string[];
			nice?: string[];
		}[];
	};
	journeys: {
		levels: { id: string; n?: number; name: string; goal: string }[];
		tracks: {
			id: string;
			name: string;
			blurb: string;
			stops: Record<string, { main: string[]; side: string[]; tip?: string }>;
		}[];
	};
	/** Agent skills on roadmap's Skills tab, each with the score Haiku got for picking and following it. */
	skills?: {
		id: string;
		name: string;
		source: string;
		path?: string;
		what: string;
		result?: { score?: number } | null;
		repo_info?: { stars?: number } | null;
	}[];
	github: Record<string, { stars?: number; release?: string } | null>;
	logos: string[];
}

export interface CvLinks {
	portfolio: string;
	radar: string;
	github?: string;
	/** Where "make your own" leads: roadmap's Portfolio with nothing rated, so a visitor starts their own. */
	make?: string;
	/** The page's own public address. With it the page gets share links, README badge snippets and link-preview tags. */
	url?: string;
}

export const MAKE_URL = "https://roadmap.flisk.si/portfolio/?from=cv";

/** shields.io static-badge text: a dash is written twice, an underscore twice, a space as an underscore. */
const badgeText = (t: string) =>
	encodeURIComponent(
		t.replace(/-/g, "--").replace(/_/g, "__").replace(/ /g, "_"),
	);

/** Share intents are plain links, so they work with no script on the page. Each opens that network's own composer. */
export function shareLinks(
	url: string,
	text: string,
): { name: string; href: string }[] {
	const u = encodeURIComponent(url);
	const t = encodeURIComponent(text);
	return [
		{ name: "X", href: `https://twitter.com/intent/tweet?text=${t}&url=${u}` },
		{
			name: "LinkedIn",
			href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
		},
		{
			name: "Bluesky",
			href: `https://bsky.app/intent/compose?text=${encodeURIComponent(`${text} ${url}`)}`,
		},
		{
			name: "Reddit",
			href: `https://www.reddit.com/submit?url=${u}&title=${t}`,
		},
		{
			name: "Hacker News",
			href: `https://news.ycombinator.com/submitlink?u=${u}&t=${t}`,
		},
		{
			name: "Facebook",
			href: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
		},
		{
			name: "WhatsApp",
			href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
		},
		{ name: "Telegram", href: `https://t.me/share/url?url=${u}&text=${t}` },
		{ name: "Email", href: `mailto:?subject=${t}&body=${u}` },
	];
}

/** Ratings as roadmap writes them in ?me=: "bun3,helm2,k9s3". At most 400 tools, levels 1 to 3. */
export const ME_PATTERN = /^[a-z0-9-]+[1-3](?:,[a-z0-9-]+[1-3]){0,399}$/;

export function parseMe(me: string): Record<string, number> {
	const out: Record<string, number> = {};
	for (const pair of me.split(",")) {
		const m = /^([a-z0-9-]+?)([1-3])$/.exec(pair.trim());
		if (m?.[1] && m[2]) out[m[1]] = Number(m[2]);
	}
	return out;
}

/** A display name: plain text, one line, at most 60 characters. */
export const cleanName = (name: string) =>
	name.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);

const e = (s: string) =>
	s.replace(
		/[&<>"']/g,
		(c) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				c
			] as string,
	);
/** Colours come from roadmap's data and go into style attributes, so only plain hex gets through. */
const hex = (c?: string) => (c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : "#888");

const DOTS = ["", "●○○", "●●○", "●●●"];
const LEVEL = ["not rated", "have used", "use often", "expert"];
const LEVEL_TITLE = ["", "Have used", "Use often", "Expert"];
/** A role's tools, and what each slot weighs in roadmap's portfolio score. */
const SLOTS = [
	["core", "Must have", 3],
	["daily", "Every day", 2],
	["nice", "Good to know", 1],
] as const;
const FIT_LABELS = ["Best fit", "Second fit", "Third fit"];

/** The page, and the logo files (from roadmap's assets/logos/) it points at under logos/. */
export function cvPage(
	data: RoadmapData,
	ratings: Record<string, number>,
	rawName: string,
	links: CvLinks,
	now = new Date(),
): { html: string; logos: string[] } {
	const name = cleanName(rawName) || "A developer";
	const fams = data.families;
	const FAM = Object.fromEntries(fams.map((f) => [f.id, f]));
	const tools = Object.entries(data.tools).flatMap(([fam, list]) =>
		list.map((t) => ({ ...t, fam })),
	);
	const BY = Object.fromEntries(tools.map((t) => [t.id, t]));
	const me: Record<string, number> = {};
	for (const [id, lv] of Object.entries(ratings)) if (BY[id]) me[id] = lv;
	const logoExt: Record<string, string> = {};
	for (const f of data.logos) {
		const dot = f.lastIndexOf(".");
		logoExt[f.slice(0, dot)] = f.slice(dot + 1);
	}
	const used = new Set<string>();
	const col = (id: string) => hex(FAM[BY[id]?.fam ?? ""]?.color);
	const lv = (id: string) => me[id] ?? 0;

	// The same scoring as roadmap's portfolio, so the numbers match.
	const fit = data.roles.roles
		.map((r) => {
			let got = 0;
			let max = 0;
			for (const [key, , w] of SLOTS)
				for (const id of r[key] ?? [])
					if (BY[id]) {
						max += w * 3;
						got += w * lv(id);
					}
			return { r, pct: max ? Math.round((got / max) * 100) : 0 };
		})
		.sort((a, b) => b.pct - a.pct);
	const top = fit[0] ?? {
		r: { id: "", name: "Developer", what: "", core: [] },
		pct: 0,
	};
	const shape = fams.map((f) => {
		const ts = tools.filter((t) => t.fam === f.id);
		return {
			f,
			sum: ts.reduce((a, t) => a + lv(t.id), 0),
			known: ts.filter((t) => lv(t.id)).length,
		};
	});
	const count = (l: number) => Object.values(me).filter((v) => v === l).length;
	const rated = Object.keys(me).length;
	const families = shape.filter((s) => s.known).length;

	const mark = (id: string, size = "") => {
		const t = BY[id];
		const ext = logoExt[id];
		if (!t) return "";
		if (!ext)
			return `<span class="mk sym ${size}" style="--c:${col(id)}">${e(t.sym)}</span>`;
		const file = `${id}.${ext}`;
		used.add(file);
		return ext === "png"
			? `<span class="mk png ${size}" style="--c:${col(id)}"><img src="logos/${e(file)}" alt="" loading="lazy"></span>`
			: `<span class="mk ${size}" style="--c:${col(id)}"><b class="glyph" style="--logo:url(logos/${e(file)})"></b></span>`;
	};
	const chip = (id: string) => {
		const t = BY[id];
		if (!t) return "";
		const l = lv(id);
		return `<span class="chip l${l}${l ? "" : " off"}" style="--c:${col(id)}" title="${e(`${t.name}: ${LEVEL[l]}`)}">${mark(id)}<span>${e(t.name)}</span>${l ? `<i>${DOTS[l]}</i>` : ""}</span>`;
	};

	const spider = (size = 340) => {
		const c = size / 2;
		const R = size / 2 - 52;
		const n = shape.length;
		const max = Math.max(3, ...shape.map((s) => s.sum));
		const pt = (i: number, v: number) => {
			const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
			return [c + Math.cos(a) * R * v, c + Math.sin(a) * R * v] as const;
		};
		const poly = (f: (i: number) => readonly [number, number]) =>
			shape
				.map((_, i) =>
					f(i)
						.map((x) => x.toFixed(1))
						.join(","),
				)
				.join(" ");
		let o = `<svg viewBox="-70 -6 ${size + 140} ${size + 12}" class="spider" role="img" aria-label="Skill shape across ${n} tool families">`;
		for (const k of [0.25, 0.5, 0.75, 1])
			o += `<polygon class="ring" points="${poly((i) => pt(i, k))}"/>`;
		shape.forEach((_, i) => {
			const [x, y] = pt(i, 1);
			o += `<line class="axis" x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
		});
		const v = (i: number) => Math.max(0.05, (shape[i]?.sum ?? 0) / max);
		o += `<polygon class="shape" points="${poly((i) => pt(i, v(i)))}"/>`;
		shape.forEach((s, i) => {
			const [x, y] = pt(i, v(i));
			o += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${hex(s.f.color)}" stroke="var(--bg)" stroke-width="2"/>`;
			const [lx, ly] = pt(i, 1.22);
			const anchor = Math.abs(lx - c) < 8 ? "middle" : lx > c ? "start" : "end";
			o += `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="${anchor}" fill="${hex(s.f.color)}">${e(s.f.name)}</text>`;
		});
		return `${o}</svg>`;
	};

	// The three best fits as roadmap's Roles cards: the family strip weighted 3 / 2 / 1 as on roadmap, then must
	// have, every day and good to know, stacked.
	const roleCard = ({ r, pct }: (typeof fit)[number], k: number) => {
		const weight: Record<string, number> = {};
		for (const [key, , w] of SLOTS)
			for (const id of r[key] ?? []) {
				const fam = BY[id]?.fam;
				if (fam) weight[fam] = (weight[fam] ?? 0) + w;
			}
		const fbar = fams
			.filter((f) => weight[f.id])
			.map(
				(f) =>
					`<i style="flex:${weight[f.id]};background:${hex(f.color)}"></i>`,
			)
			.join("");
		const groups = SLOTS.map(([key, label]) => {
			const ids = (r[key] ?? []).filter((id) => BY[id]);
			if (!ids.length) return "";
			return `<div class="rgroup"><span class="lbl ${key}">${label}<b>${ids.filter((id) => lv(id)).length}/${ids.length}</b></span><div class="chips">${ids.map(chip).join("")}</div></div>`;
		}).join("");
		return `<div class="rolecard${k ? "" : " best"}"><div class="rhead"><div><p class="lbl">${FIT_LABELS[k]}</p><h3>${e(r.name)}</h3></div><div class="pctbig"><b>${pct}<small>%</small></b><span>match</span></div></div><p class="rwhat">${e(r.what)}</p><div class="fbar">${fbar}</div>${groups}</div>`;
	};
	const roleCards = fit.slice(0, 3).map(roleCard).join("");
	const others = fit
		.slice(3, 9)
		.map(
			(x) =>
				`<li><span>${e(x.r.name)}</span><span class="pbar"><i style="width:${x.pct}%"></i></span><b>${x.pct}%</b></li>`,
		)
		.join("");

	// The journey: the track this person covers best, drawn like roadmap's Journeys view, a card per level with
	// the level's tip from roadmap as its note.
	const score = (t: RoadmapData["journeys"]["tracks"][number]) =>
		Object.values(t.stops)
			.flatMap((s) => [...s.main, ...s.side])
			.reduce((a, id) => a + lv(id), 0);
	const track = [...data.journeys.tracks].sort(
		(a, b) => score(b) - score(a),
	)[0];
	const stops = data.journeys.levels.filter((L) => track?.stops[L.id]);
	let done = 0;
	const steps = stops
		.map((L, k) => {
			const stop = track?.stops[L.id] ?? { main: [], side: [] };
			const main = stop.main.filter((id) => BY[id]);
			const side = stop.side.filter((id) => BY[id]);
			const known = [...main, ...side].filter((id) => lv(id)).length;
			const state = main.some((id) => lv(id))
				? "done"
				: known
					? "part"
					: "todo";
			if (state === "done") done++;
			const n = Number(L.n) || k + 1;
			const row = (label: string, ids: string[]) =>
				ids.length
					? `<div class="rrow"><span class="lbl">${label}</span><div class="chips">${ids.map(chip).join("")}</div></div>`
					: "";
			return `<li class="step ${state}"><span class="num">${n}</span><div class="card"><p class="lbl lvl">Level ${n}<b>${known}/${main.length + side.length} known</b></p><h3>${e(L.name)}</h3><p class="goal">${e(L.goal)}</p>
${row("On the line", main)}${row("Branches", side)}${stop.tip ? `<p class="note">${e(stop.tip)}</p>` : ""}</div></li>`;
		})
		.join("");

	// Expert tools as roadmap's tool cards: ring, both checklist scores, stars and last release.
	const ago = (iso?: string) => {
		if (!iso) return "";
		const days = Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000);
		return days <= 0
			? "today"
			: days < 60
				? `${days} days ago`
				: `${Math.floor(days / 30)} months ago`;
	};
	const stars = (n: number) =>
		n >= 10_000
			? `${Math.round(n / 1000)}k`
			: n >= 1000
				? `${(n / 1000).toFixed(1)}k`
				: String(n);
	const experts = Object.keys(me)
		.filter((id) => me[id] === 3)
		.sort(
			(a, b) =>
				(data.github[b]?.stars ?? 0) - (data.github[a]?.stars ?? 0) ||
				a.localeCompare(b),
		);
	const cards = experts
		.slice(0, 9)
		.map((id) => {
			const t = BY[id];
			if (!t) return "";
			const g = data.github[id] ?? {};
			const dx = (t.dx?.length ?? 0) * 10;
			const par = (t.parity?.length ?? 0) * 10;
			const meta = [
				g.stars ? `★ ${stars(g.stars)}` : "",
				g.release ? `released ${ago(g.release)}` : "",
			]
				.filter(Boolean)
				.join(" · ");
			const ring = /^(adopt|trial|assess|hold)$/.test(t.ring ?? "")
				? (t.ring as string)
				: "";
			return `<div class="tcard" style="--c:${col(id)}"><div class="thead">${mark(id, "big")}<div><b>${e(t.name)}</b><span>${e(FAM[t.fam]?.name ?? "")} · ${e(t.cat)}</span></div>${ring ? `<em class="ring ${ring}">${ring}</em>` : ""}</div>
<p class="tag">${e(t.tagline ?? "")}</p>
<div class="sc"><span>Easy to use</span><b>${dx}</b><span class="pbar"><i style="width:${dx}%"></i></span></div>
<div class="sc"><span>Big real systems</span><b>${par}</b><span class="pbar"><i style="width:${par}%"></i></span></div>
<p class="tmeta">${meta}</p></div>`;
		})
		.join("");

	// Agent skills from roadmap's Skills tab whose subject is a tool I rated expert or use often: the tool's id opens
	// the skill's name (terraform-test, prisma-cli), or the description names the tool and the name can't be an
	// everyday word (Next.js, Claude Code, LangChain; not Make or kind). Up to two per tool, best scored first, and
	// each tool's best one before any tool's second, so six cards cover as many tools as they can.
	// They match my tools; nothing says I use them.
	type Skill = NonNullable<RoadmapData["skills"]>[number];
	const words = (s: string) =>
		s
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter(Boolean);
	const distinct = (n: string) =>
		/[^A-Za-z]/.test(n) || /[A-Z]/.test(n.slice(1));
	const skillScore = (s: Skill) =>
		typeof s.result?.score === "number" ? Math.round(s.result.score) : -1;
	const strong = Object.keys(me)
		.filter((id) => lv(id) >= 2)
		.sort(
			(a, b) =>
				lv(b) - lv(a) ||
				(data.github[b]?.stars ?? 0) - (data.github[a]?.stars ?? 0) ||
				a.localeCompare(b),
		);
	const picks = strong.map((id) => {
		const t = BY[id];
		if (!t) return [];
		const key = id.split("-");
		const named = new RegExp(
			`(?<![\\w./-])${t.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`,
		);
		return (data.skills ?? [])
			.map((s) => {
				const head = words(s.name).slice(0, key.length).join("-") === id;
				return {
					s,
					id,
					head,
					hit: head || (distinct(t.name) && named.test(s.what)),
				};
			})
			.filter((h) => h.hit)
			.sort(
				(a, b) =>
					Number(b.head) - Number(a.head) ||
					skillScore(b.s) - skillScore(a.s) ||
					(b.s.repo_info?.stars ?? 0) - (a.s.repo_info?.stars ?? 0) ||
					a.s.name.localeCompare(b.s.name),
			)
			.slice(0, 2);
	});
	const matched = new Map<string, { s: Skill; by: string[] }>();
	for (const round of [0, 1])
		for (const list of picks) {
			const p = list[round];
			if (!p) continue;
			const m = matched.get(p.s.id);
			if (!m) matched.set(p.s.id, { s: p.s, by: [p.id] });
			else if (!m.by.includes(p.id)) m.by.push(p.id);
		}
	const skillCards = [...matched.values()]
		.slice(0, 6)
		.map(({ s, by }) => {
			const v = skillScore(s);
			const grade = v >= 80 ? "good" : v >= 50 ? "mid" : "bad";
			const repo = /^[\w.-]+\/[\w.-]+$/.test(s.source) ? s.source : "";
			const file = /^[\w./-]+$/.test(s.path ?? "")
				? `/blob/HEAD/${s.path}`
				: "";
			const fits = by
				.map((id) => `<b>${e(BY[id]?.name ?? id)}</b> (${LEVEL[lv(id)]})`)
				.join(", ");
			return `<div class="skill"><div class="top"><code>${e(s.name)}</code>${v < 0 ? `<span class="stag">not tested</span>` : `<span class="stag ${grade}" title="Haiku's score on roadmap's Skills tab">${v}/100</span>`}</div>
${repo ? `<a class="src" href="https://github.com/${e(repo + file)}">${e(repo)}</a>` : ""}<p>${e(s.what)}</p><span class="fits">Matches ${fits}</span></div>`;
		})
		.join("");

	// The toolkit wall: every rated tool, grouped by level, then by family.
	const famOrder = fams.map((f) => f.id);
	const wall = (l: number) =>
		Object.keys(me)
			.filter((id) => me[id] === l)
			.sort(
				(a, b) =>
					famOrder.indexOf(BY[a]?.fam ?? "") -
						famOrder.indexOf(BY[b]?.fam ?? "") ||
					(BY[a]?.name ?? "").localeCompare(BY[b]?.name ?? ""),
			)
			.map(chip)
			.join("");
	// Expert and use-often tools get a row each, the chip beside roadmap's one-line description of the tool, as in the
	// portfolio's "toolkit, with the evidence"; the tools only tried stay chips.
	const evidence = (l: number) =>
		Object.keys(me)
			.filter((id) => me[id] === l)
			.sort(
				(a, b) =>
					famOrder.indexOf(BY[a]?.fam ?? "") -
						famOrder.indexOf(BY[b]?.fam ?? "") ||
					(BY[a]?.name ?? "").localeCompare(BY[b]?.name ?? ""),
			)
			.map(
				(id) =>
					`<div class="ev">${chip(id)}<p>${e(BY[id]?.tagline ?? "")}</p></div>`,
			)
			.join("");
	const toolkit = [3, 2, 1]
		.filter((l) => count(l))
		.map(
			(l) =>
				`<div class="lvlhead"><i>${DOTS[l]}</i><h3>${LEVEL_TITLE[l]}</h3><small>${count(l)}</small></div>${l > 1 ? `<div class="evidence">${evidence(l)}</div>` : `<div class="chips">${wall(l)}</div>`}`,
		)
		.join("");

	const desc = `${name}, ${top.r.name}: ${rated} developer tools rated, ${count(3)} at expert level, across ${families} tool families.`;
	const make = links.make ?? MAKE_URL;
	const makeBar = `<aside class="make"><p><b>Want a page like this?</b> Click the tools you use, then publish. About a minute, no account needed.</p><a class="btn p" href="${e(make)}">Make my own CV →</a></aside>`;
	const pageTitle = `${name} · ${top.r.name} · Developer CV`;
	const preview = links.url
		? `<meta property="og:type" content="profile"><meta property="og:title" content="${e(pageTitle)}"><meta property="og:description" content="${e(desc)}"><meta property="og:url" content="${e(links.url)}"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${e(pageTitle)}"><meta name="twitter:description" content="${e(desc)}">`
		: "";
	const share = links.url
		? (() => {
				const text = `${name}: ${top.r.name}. My developer toolkit, ${rated} tools rated.`;
				const badge = `[![DevEx CV](https://img.shields.io/badge/${badgeText("DevEx CV")}-${badgeText(`${top.r.name} ${top.pct}%`)}-22c55e?style=for-the-badge)](${links.url})`;
				const html = `<a href="${links.url}"><img alt="DevEx CV" src="https://img.shields.io/badge/${badgeText("DevEx CV")}-${badgeText(`${top.r.name} ${top.pct}%`)}-22c55e?style=for-the-badge"></a>`;
				const snippets = [
					["Markdown, for a README", badge],
					["HTML", html],
					["Plain link", links.url],
				]
					.map(
						([label, code]) =>
							`<div class="snip"><span class="lbl">${e(label)}</span><pre><code>${e(code)}</code></pre></div>`,
					)
					.join("");
				return `<section class="share" id="share"><div class="sh"><h2>Share this CV</h2><p>One click opens each network's own post box.</p></div><div class="panel"><div class="sharebtns">${shareLinks(
					links.url,
					text,
				)
					.map(
						(l) =>
							`<a class="btn" rel="noopener" href="${e(l.href)}">${e(l.name)}</a>`,
					)
					.join(
						"",
					)}</div><details class="badges"><summary>Add a badge to your README or site</summary>${snippets}<p class="fine">Select a snippet and copy it. The badge image comes from shields.io when someone views your README, not from this page.</p></details></div></section>`;
			})()
		: "";
	const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(pageTitle)}</title><meta name="description" content="${e(desc)}">${preview}<style>${CSS}</style></head><body><div class="wrap">
<nav class="top"><a class="brand" href="https://roadmap.flisk.si/"><i>&gt;_</i>DevEx CV</a><div class="links"><a href="${e(links.portfolio)}">Portfolio</a><a href="${e(links.radar)}">Radar</a>${links.github ? `<a href="${e(links.github)}">GitHub</a>` : ""}</div></nav>
${makeBar}
<div class="hero"><div>
<span class="badge">Developer CV</span>
<h1><span>${e(name)}</span></h1>
<p class="role">${e(top.r.name)} <span class="pill">${top.pct}% MATCH</span></p>
<p class="what">${e(top.r.what)}</p>
<div class="stats"><div><b>${rated}</b><span>tools rated</span></div><div><b>${count(3)}</b><span>expert</span></div><div><b>${count(2)}</b><span>use often</span></div><div><b>${families}/${fams.length}</b><span>families</span></div></div>
<div class="btns"><a class="btn p" href="${e(links.portfolio)}">Interactive portfolio →</a><a class="btn" href="${e(links.radar)}">My tools on the radar</a>${links.github ? `<a class="btn" href="${e(links.github)}">GitHub</a>` : ""}${links.url ? `<a class="btn" href="#share">Share</a>` : ""}</div>
<div class="trust"><span><b>Self-reported</b> ratings</span><span><b>Scored</b> by a public checklist</span><span><b>No scripts</b>, no tracking</span></div>
</div><div>${spider()}</div></div>
${
	roleCards
		? `<section><div class="sh"><h2>Role fit</h2><p>Scored with roadmap's job loadouts: a must-have tool counts 3, an every-day tool 2, a good-to-know tool 1, times my level. Solid rings are tools I rated; dashed ones I haven't.</p></div>
<div class="roles">${roleCards}</div>${others ? `<div class="panel more"><p class="lbl">Next closest roles</p><ul class="others">${others}</ul></div>` : ""}</section>`
		: ""
}
${
	track && steps
		? `<section class="track"><div class="head"><span class="badge">${e(track.name)} line</span><p>${e(track.blurb)} ${done} of ${stops.length} levels on the line.</p></div>
<ol class="steps">${steps}</ol></section>`
		: ""
}
${
	experts.length
		? `<section><div class="sh"><h2>Expert in</h2><p>${count(3) === 1 ? "One tool" : `${count(3)} tools`} I'd teach. Scores are roadmap's public checklist, 10 points a check.</p></div><div class="tgrid">${cards}</div></section>`
		: ""
}
${
	skillCards
		? `<section><div class="sh"><h2>Agent skills</h2><p>Skills on roadmap's Skills tab that match the tools I rated expert or use often, with the score Haiku got for picking and following each one. They match my tools; this page doesn't say I use them.</p></div><div class="skills">${skillCards}</div></section>`
		: ""
}
${
	toolkit
		? `<section><div class="sh"><h2>Toolkit</h2><p>All ${rated === 1 ? "one tool" : `${rated} tools`} I rated, by level.</p></div><div class="panel">${toolkit}</div></section>`
		: ""
}
${share}
${makeBar}
<footer><p>Ratings are self-reported. Tools, roles and skills are scored by the public checklist on <a href="https://roadmap.flisk.si/">roadmap.flisk.si</a>.</p><p>Published with <a href="https://pages.flisk.si/">pages.flisk.si</a></p></footer>
</div></body></html>`;
	return { html, logos: [...used] };
}
