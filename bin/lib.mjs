// What bin/pages.mjs does that is worth testing on its own: reading what to publish (a folder, or one .html or .md
// file), the anonymous publish through publish.flisk.si for Markdown, the tokens it keeps to publish a new version,
// and waiting for a link to answer. Nothing here runs git or gh.
import {
	chmodSync,
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";

export const SKIP = new Set([".DS_Store", ".git", "Thumbs.db", "node_modules"]);

// In the repository and the Claude Code plugin the check sits in the web service; the npm package ships a copy next
// to this file.
const packed = new URL("./check.mjs", import.meta.url);
export const { checkSpace, formatReport, validId } = await import(
	existsSync(packed) ? packed.href : new URL("../services/app/web/src/check.mjs", import.meta.url).href
);

/** A slug from a folder or file name: "My GPU Explainer" → "my-gpu-explainer". */
export function slugify(name) {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 63);
}

/**
 * What a path publishes as: a folder as it is, or one .html or .md file as the space's index. Returns
 * {dir | file, index, name, markdown} or {error}. `markdown` is the page's text when the space is a single index.md,
 * the only kind the anonymous publish takes.
 */
export function sourceOf(path) {
	if (!existsSync(path)) return { error: `${path} does not exist.` };
	const abs = resolve(path);
	if (statSync(abs).isDirectory()) {
		const files = new Set(readdirSafe(abs).filter((f) => !SKIP.has(f)));
		const md = files.size === 1 && files.has("index.md");
		return {
			dir: abs,
			index: files.has("index.html") ? "index.html" : files.has("index.md") ? "index.md" : "",
			name: basename(abs),
			markdown: md ? readFileSync(join(abs, "index.md"), "utf8") : undefined,
		};
	}
	const ext = extname(abs).toLowerCase();
	const index = ext === ".html" || ext === ".htm" ? "index.html" : ext === ".md" || ext === ".markdown" ? "index.md" : "";
	if (!index) return { error: `${path} is not a folder, an .html file or an .md file.` };
	const name = basename(abs, extname(abs));
	return {
		file: abs,
		index,
		name: name.toLowerCase() === "index" ? basename(dirname(abs)) : name,
		markdown: index === "index.md" ? readFileSync(abs, "utf8") : undefined,
	};
}

function readdirSafe(dir) {
	try {
		return readdirSync(dir);
	} catch {
		return [];
	}
}

/** The source as a folder of its own, without the files every OS and editor leaves behind. */
export function stage(source) {
	const out = mkdtempSync(join(tmpdir(), "pages-stage-"));
	if (source.file) cpSync(source.file, join(out, source.index));
	else cpSync(source.dir, out, { recursive: true, filter: (src) => !SKIP.has(basename(src)) });
	return out;
}

/** Where anonymous spaces' tokens are kept: one file, readable only by you. */
export function storePath(env = process.env) {
	const base = env.XDG_CONFIG_HOME || join(env.HOME || homedir(), ".config");
	return join(base, "pages", "anon.json");
}

/** The anonymous space published from this path before, or undefined. */
export function savedSpace(path, file = storePath()) {
	return readStore(file)[resolve(path)];
}

export function saveSpace(path, space, file = storePath()) {
	const all = readStore(file);
	if (space) all[resolve(path)] = space;
	else delete all[resolve(path)];
	mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
	writeFileSync(file, `${JSON.stringify(all, null, "\t")}\n`, { mode: 0o600 });
	chmodSync(file, 0o600);
}

function readStore(file) {
	try {
		return JSON.parse(readFileSync(file, "utf8")) ?? {};
	} catch {
		return {};
	}
}

/**
 * Publishes Markdown anonymously through publish.flisk.si, or a new version when `saved` has its token. Returns the
 * space {id, url, token, manage} or throws with the service's reason.
 */
export async function publishAnon(api, markdown, saved, fetcher = fetch) {
	const res = await fetcher(saved ? `${api}/v1/spaces/${saved.id}` : `${api}/v1/spaces`, {
		method: saved ? "PUT" : "POST",
		headers: {
			"content-type": "application/json",
			...(saved ? { authorization: `Bearer ${saved.token}` } : {}),
		},
		body: JSON.stringify(saved ? { markdown } : { markdown, source: "cli" }),
	});
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(body.error || `publish.flisk.si answered ${res.status}`);
	return saved ? { ...saved, url: body.url ?? saved.url } : { id: body.id, url: body.url, token: body.token, manage: body.manage };
}

export async function removeAnon(api, saved, fetcher = fetch) {
	const res = await fetcher(`${api}/v1/spaces/${saved.id}`, {
		method: "DELETE",
		headers: { authorization: `Bearer ${saved.token}` },
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(body.error || `publish.flisk.si answered ${res.status}`);
	}
}

/** The files of a staged space as [{path, base64}], what POST /v1/ci/spaces takes. */
export function readFolder(dir, at = dir, out = []) {
	for (const name of readdirSync(at).sort()) {
		const path = join(at, name);
		if (statSync(path).isDirectory()) readFolder(dir, path, out);
		else out.push({ path: path.slice(dir.length + 1).split("\\").join("/"), base64: readFileSync(path).toString("base64") });
	}
	return out;
}

/** This GitHub Actions job's OIDC token for `api`, or throws saying what the job is missing. */
async function oidcToken(api, env, fetcher) {
	const ask = env.ACTIONS_ID_TOKEN_REQUEST_URL;
	if (!ask || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)
		throw new Error("No GitHub Actions OIDC token: give the job `permissions: id-token: write` (and contents: read).");
	const issued = await fetcher(`${ask}&audience=${encodeURIComponent(api)}`, {
		headers: { authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
	}).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
	if (typeof issued.value !== "string") throw new Error("GitHub Actions did not issue an OIDC token for this job.");
	return issued.value;
}

/**
 * Publishes a staged space from a GitHub Actions job with the job's OIDC token (the job needs `permissions: id-token:
 * write`), so no key is set up. The space goes under the repository's owner. Returns {url, runs} or throws.
 */
export async function publishFromActions(api, slug, dir, env = process.env, fetcher = fetch) {
	const token = await oidcToken(api, env, fetcher);
	const res = await fetcher(`${api}/v1/ci/spaces`, {
		method: "POST",
		headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
		body: JSON.stringify({ slug, files: readFolder(dir) }),
	});
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(body.error || `publish.flisk.si answered ${res.status}`);
	return { url: body.url, runs: body.runs };
}

/** How many versions the space has on the live site (0 when it is not there yet), from spaces.json. */
export async function versionsOf(site, handle, slug, fetcher = fetch) {
	try {
		const res = await fetcher(`${site}spaces.json?t=${Date.now()}`, { cache: "no-store" });
		const list = res.ok ? await res.json() : [];
		return list.find((s) => s.handle === handle && s.slug === slug)?.versions ?? 0;
	} catch {
		return 0;
	}
}

/**
 * Waits until the space shows more than `before` versions, since its link already answers with the old version on
 * an update. True when it did within `seconds`.
 */
export async function waitVersion(site, handle, slug, before, { seconds = 300, every = 5, fetcher = fetch } = {}) {
	const until = Date.now() + seconds * 1000;
	for (;;) {
		if ((await versionsOf(site, handle, slug, fetcher)) > before) return true;
		if (Date.now() + every * 1000 > until) return false;
		await new Promise((r) => setTimeout(r, every * 1000));
	}
}

/** Takes down /@<repository owner>/<slug>/ from a GitHub Actions job of that owner, with the job's OIDC token. */
export async function removeFromActions(api, slug, env = process.env, fetcher = fetch) {
	const token = await oidcToken(api, env, fetcher);
	const res = await fetcher(`${api}/v1/ci/spaces/${slug}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(body.error || `publish.flisk.si answered ${res.status}`);
	return { url: body.url };
}

/** Polls a link until it answers 200, for up to `seconds`. True when it did. */
export async function waitLive(url, { seconds = 180, every = 5, fetcher = fetch } = {}) {
	const until = Date.now() + seconds * 1000;
	for (;;) {
		try {
			const res = await fetcher(url, { method: "GET", cache: "no-store" });
			if (res.status === 200) return true;
		} catch {}
		if (Date.now() + every * 1000 > until) return false;
		await new Promise((r) => setTimeout(r, every * 1000));
	}
}
