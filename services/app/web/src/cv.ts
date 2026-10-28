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
		levels: { id: string; name: string; goal: string }[];
		tracks: {
			id: string;
			name: string;
			blurb: string;
			stops: Record<string, { main: string[]; side: string[] }>;
		}[];
	};
	github: Record<string, { stars?: number; release?: string } | null>;
	logos: string[];
}

export interface CvLinks {
	portfolio: string;
	radar: string;
	github?: string;
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

const DOTS = ["", "●○○", "●●○", "●●●"];
const LEVEL = ["not rated", "have used", "use often", "expert"];

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
	const col = (id: string) => FAM[BY[id]?.fam ?? ""]?.color ?? "#888";
	const lv = (id: string) => me[id] ?? 0;

	// The same scoring as roadmap's portfolio, so the numbers match.
	const fit = data.roles.roles
		.map((r) => {
			let got = 0;
			let max = 0;
			for (const [key, w] of [
				["core", 3],
				["daily", 2],
				["nice", 1],
			] as const)
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
			o += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${s.f.color}" stroke="var(--bg)" stroke-width="2"/>`;
			const [lx, ly] = pt(i, 1.22);
			const anchor = Math.abs(lx - c) < 8 ? "middle" : lx > c ? "start" : "end";
			o += `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="${anchor}" fill="${s.f.color}">${e(s.f.name)}</text>`;
		});
		return `${o}</svg>`;
	};

	// Best fit, as on roadmap's Roles view: the family bar, then must have, every day and good to know.
	const roleIds = ["core", "daily", "nice"]
		.flatMap(
			(k) =>
				((top.r as Record<string, unknown>)[k] as string[] | undefined) ?? [],
		)
		.filter((id) => BY[id]);
	const fbar = fams
		.map(
			(f) => [f, roleIds.filter((id) => BY[id]?.fam === f.id).length] as const,
		)
		.filter(([, n]) => n)
		.map(([f, n]) => `<i style="flex:${n};background:${f.color}"></i>`)
		.join("");
	const roleRows = (
		[
			["core", "Must have"],
			["daily", "Every day"],
			["nice", "Good to know"],
		] as const
	)
		.map(([key, label]) => {
			const ids = (top.r[key] ?? []).filter((id) => BY[id]);
			if (!ids.length) return "";
			return `<div class="rrow"><span class="lbl ${key}">${label}<b>${ids.filter((id) => lv(id)).length}/${ids.length}</b></span><div class="chips">${ids.map(chip).join("")}</div></div>`;
		})
		.join("");
	const others = fit
		.slice(1, 6)
		.map(
			(x) =>
				`<li><span>${e(x.r.name)}</span><span class="pbar"><i style="width:${x.pct}%"></i></span><b>${x.pct}%</b></li>`,
		)
		.join("");

	// The journey: the track this person covers best, level by level, as on roadmap's Journeys view.
	const levels = Object.fromEntries(data.journeys.levels.map((l) => [l.id, l]));
	const score = (t: RoadmapData["journeys"]["tracks"][number]) =>
		Object.values(t.stops)
			.flatMap((s) => [...s.main, ...s.side])
			.reduce((a, id) => a + lv(id), 0);
	const track = [...data.journeys.tracks].sort(
		(a, b) => score(b) - score(a),
	)[0];
	let done = 0;
	const steps = Object.entries(track?.stops ?? {})
		.map(([lid, stop], k) => {
			const L = levels[lid];
			const main = stop.main.filter((id) => BY[id]);
			const side = stop.side.filter((id) => BY[id]);
			const known = [...main, ...side].filter((id) => lv(id)).length;
			const state = main.some((id) => lv(id))
				? "done"
				: known
					? "part"
					: "todo";
			if (state === "done") done++;
			return `<li class="step ${state}"><span class="num">${k + 1}</span><div class="card"><p class="lbl lvl">Level ${k + 1} <b>${known}/${main.length + side.length} known</b></p><h4>${e(L?.name ?? lid)}</h4><p class="goal">${e(L?.goal ?? "")}</p>
<div class="rrow"><span class="lbl">On the line</span><div class="chips">${main.map(chip).join("")}</div></div>
<div class="rrow"><span class="lbl">Branches</span><div class="chips">${side.map(chip).join("")}</div></div></div></li>`;
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
	const restExpert = experts.slice(9);

	const desc = `${name}, ${top.r.name}: ${rated} developer tools rated, ${count(3)} at expert level, across ${families} tool families.`;
	const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(name)} · ${e(top.r.name)} · Developer CV</title><meta name="description" content="${e(desc)}"><style>${CSS}</style></head><body><div class="wrap">
<nav class="top"><a class="brand" href="https://roadmap.flisk.si/"><i>&gt;_</i>DevEx CV</a><div class="links"><a href="${e(links.portfolio)}">Portfolio</a><a href="${e(links.radar)}">Radar</a>${links.github ? `<a href="${e(links.github)}">GitHub</a>` : ""}</div></nav>
<div class="hero"><div>
<span class="badge">Developer CV</span>
<h1>${e(name)}</h1>
<p class="role">${e(top.r.name)} <span class="pill">${top.pct}% MATCH</span></p>
<p class="what">${e(top.r.what)}</p>
<div class="stats"><div><b>${rated}</b><span>tools rated</span></div><div><b>${count(3)}</b><span>expert</span></div><div><b>${count(2)}</b><span>use often</span></div><div><b>${families}/${fams.length}</b><span>families</span></div></div>
<div class="btns"><a class="btn p" href="${e(links.portfolio)}">Interactive portfolio →</a><a class="btn" href="${e(links.radar)}">My tools on the radar</a>${links.github ? `<a class="btn" href="${e(links.github)}">GitHub</a>` : ""}</div>
</div><div>${spider()}</div></div>

<section><div class="sh"><h2>Role fit</h2><p>Scored on the tools each role needs. Solid rings are tools I use; dashed ones I haven't rated.</p></div>
<div class="rolegrid"><div class="rolecard"><div class="rhead"><div><p class="lbl">Best fit</p><h3>${e(top.r.name)}</h3><p class="what">${e(top.r.what)}</p></div><div class="pctbig"><b>${top.pct}<small>%</small></b><span>match</span></div></div><div class="fbar">${fbar}</div>${roleRows}</div><div class="rolecard"><p class="lbl">Also fits</p><ul class="others">${others}</ul></div></div></section>
${
	track
		? `<section class="track"><div class="head"><span class="badge" style="margin:0">${e(track.name)} line</span><p>${e(track.blurb)} ${done} of ${Object.keys(track.stops).length} levels on the line.</p></div>
<ol class="steps">${steps}</ol></section>`
		: ""
}
${
	experts.length
		? `<section><div class="sh"><h2>Expert in</h2><p>${count(3) === 1 ? "One tool" : `${count(3)} tools`} I'd teach. Scores are roadmap's public checklist, 10 points a check.</p></div><div class="tgrid">${cards}</div>${restExpert.length ? `<div class="panel" style="margin-top:14px"><div class="wall"><h3><i>●●●</i>Also expert <small>${restExpert.length}</small></h3><div class="chips">${restExpert.map(chip).join("")}</div></div></div>` : ""}</section>`
		: ""
}
<section><div class="sh"><h2>Also in my toolkit</h2></div><div class="panel">
${count(2) ? `<div class="wall"><h3><i>●●○</i>Use often <small>${count(2)}</small></h3><div class="chips">${wall(2)}</div></div>` : ""}
${count(1) ? `<div class="wall"><h3><i>●○○</i>Have used <small>${count(1)}</small></h3><div class="chips">${wall(1)}</div></div>` : ""}</div></section>

<footer><span>Ratings are self-reported. Every tool is scored by a public checklist on <a href="https://roadmap.flisk.si/">roadmap.flisk.si</a>.</span><span>Published with <a href="https://pages.flisk.si/">pages.flisk.si</a></span></footer>
</div></body></html>`;
	return { html, logos: [...used] };
}
