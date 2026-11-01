// publish.flisk.si: one-click publishing to pages.flisk.si with no account and no key for the visitor.
//
//   POST   /v1/spaces        {markdown, source?}  → 202 {id, url, token, manage}   a new space at /@anon/<id>/
//   PUT    /v1/spaces/<id>   {markdown | cv}  Bearer <token>  → 202 {id, url}           a new version
// cv is {me: "bun3,helm2", name?}: roadmap's ratings. The workflow builds the developer CV page from them and
// roadmap's own data, so a visitor only ever sends Markdown or ratings, never markup of their own.
//   DELETE /v1/spaces/<id>   Bearer <token>  → 202 {id}                            take it down
//   GET    /manage/<id>#<token>   a page with the link and a delete button (the token stays in the fragment)
//
// A developer CV needs a GitHub sign-in: one CV per account, at /@<login>/cv/. (Anonymous CVs are refused; the ones
// published before that rule can still be updated or deleted with their key.)
//   GET    /auth/github?return=<url>   send the visitor to GitHub (no scope: public profile only)
//   GET    /auth/callback              GitHub sends them back; we read their login, keep no token, and return them
//                                      to <url>#gh=<session>, a signed one-hour session that holds only the login
//   GET    /v1/me                      Bearer <session> → {login}
//   PUT    /v1/me/space  {cv}          Bearer <session> → 202 {url}   save the CV at /@<login>/cv/ (new or new version)
//   DELETE /v1/me/space                Bearer <session> → 202 {url}   take it down
// The GitHub access token is used once to read /user and is then dropped. Secrets: GITHUB_CLIENT_ID is a var;
// GITHUB_CLIENT_SECRET and SESSION_SECRET are secrets.
//
// Nothing is stored here. The worker checks the request, then sends a repository_dispatch to flisk-sh/pages; the
// publish-anon workflow runs the same check as every other publish and commits the branch space/anon/<id>. Only
// sha256(token) leaves the worker, as a commit trailer the workflow compares on update and delete.
//
// Publishing from GitHub Actions needs no key either: the workflow's own OIDC token says which repository it is.
//   POST   /v1/ci/spaces  {slug, files: [{path, base64}]}  Bearer <OIDC token, audience PUBLISH_ORIGIN>
//                                      → 202 {url}   the space /@<repository owner>/<slug>/, new or a new version
//   DELETE /v1/ci/spaces/<slug>        Bearer <the same kind of token>  → 202 {url}   take it down
//   GET    /v1/spaces/<handle>/<slug>/head  → {sha, source, date} of the space's newest version, or {sha: null}
//                                      (public; what a CI job waits on: its version is checked and committed)
//
// Settings (wrangler.toml [vars]): PAGES_REPO, PAGES_ORIGIN, PUBLISH_ORIGIN, ALLOWED_ORIGINS (comma-separated),
// MAX_PER_IP_HOUR, MAX_PER_IP_DAY, MAX_PER_HOUR, MAX_CI_PER_HOUR, MAX_CI_PER_DAY. Secret: GITHUB_TOKEN (fine-grained, flisk-sh/pages only,
// Contents: read and write, which repository_dispatch needs).

export const MAX_MARKDOWN_BYTES = 40_000;
const ID = /^[a-z0-9]{10}$/;
const TOKEN = /^[a-f0-9]{48}$/;
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no 0/o, 1/l

/** A 10-character id, cuid-style: lowercase, unambiguous, 50 bits of randomness. */
export function newId() {
	const bytes = crypto.getRandomValues(new Uint8Array(10));
	return [...bytes].map((b) => ALPHABET[b % 32]).join("");
}

export function newToken() {
	return [...crypto.getRandomValues(new Uint8Array(24))]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export async function sha256(text) {
	const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** What a visitor may publish this way: Markdown only (rendered sanitized, no scripts), within the size cap. */
export function checkMarkdown(markdown) {
	if (typeof markdown !== "string" || !markdown.trim()) return "markdown is required";
	if (new TextEncoder().encode(markdown).length > MAX_MARKDOWN_BYTES)
		return `markdown is over ${MAX_MARKDOWN_BYTES / 1000} KB`;
	if (/<\s*(script|iframe|form|object|embed)\b/i.test(markdown)) return "markdown may not contain scripts, frames or forms";
	if (/<input[^>]+type\s*=\s*["']?password/i.test(markdown)) return "markdown may not contain a password field";
	return "";
}

// The same rules as ME_PATTERN and cleanName in services/app/web/src/cv.ts.
const ME = /^[a-z0-9-]+[1-3](?:,[a-z0-9-]+[1-3]){0,399}$/;

/** What a visitor sends: {markdown} or {cv: {me, name?}}. Returns [payload fields, problem]. */
export function readContent(body) {
	if (body && body.cv !== undefined) {
		const cv = body.cv;
		if (!cv || typeof cv.me !== "string" || !ME.test(cv.me)) return [null, "cv.me must be ratings such as bun3,helm2"];
		if (cv.name !== undefined && typeof cv.name !== "string") return [null, "cv.name must be text"];
		const name = String(cv.name ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
		return [{ cv: name ? { me: cv.me, name } : { me: cv.me } }, ""];
	}
	const problem = checkMarkdown(body?.markdown);
	return problem ? [null, problem] : [{ markdown: body.markdown }, ""];
}

const json = (body, status, headers = {}) =>
	new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function cors(request, env) {
	const origin = request.headers.get("origin") ?? "";
	const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
	if (!allowed.includes(origin)) return {};
	return {
		"access-control-allow-origin": origin,
		"access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
		"access-control-allow-headers": "content-type, authorization",
		"access-control-max-age": "86400",
		vary: "origin",
	};
}

// Per data center counters in the Cache API, as in demo.flisk.sh: enough to stop a burst from one address. A
// Cloudflare rate limiting rule on /v1/ is the global cap.
async function count(origin, key) {
	try {
		const hit = await caches.default.match(new Request(`${origin}/__count/${key}`));
		return hit ? Number(await hit.text()) || 0 : 0;
	} catch {
		return 0;
	}
}
async function bump(origin, key, ttl) {
	try {
		const n = (await count(origin, key)) + 1;
		await caches.default.put(
			new Request(`${origin}/__count/${key}`),
			new Response(String(n), { headers: { "cache-control": `s-maxage=${ttl}` } }),
		);
	} catch {}
}
async function overLimit(env, origin, ip, perHour = Number(env.MAX_PER_IP_HOUR ?? 5), perDay = Number(env.MAX_PER_IP_DAY ?? 20)) {
	const hour = Math.floor(Date.now() / 3_600_000);
	const day = Math.floor(Date.now() / 86_400_000);
	const keys = [
		[`ip-${ip}-h${hour}`, perHour, 3600],
		[`ip-${ip}-d${day}`, perDay, 86400],
		[`all-h${hour}`, Number(env.MAX_PER_HOUR ?? 120), 3600],
	];
	for (const [key, max] of keys) if ((await count(origin, key)) >= max) return true;
	for (const [key, , ttl] of keys) await bump(origin, key, ttl);
	return false;
}

async function dispatch(env, payload, fetcher = fetch) {
	const res = await fetcher(`https://api.github.com/repos/${env.PAGES_REPO}/dispatches`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${env.GITHUB_TOKEN}`,
			accept: "application/vnd.github+json",
			"user-agent": "pages-publish-worker",
			"content-type": "application/json",
		},
		body: JSON.stringify({ event_type: "pages-anon", client_payload: payload }),
	});
	return res.status === 204;
}

const bearer = (request) => (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");

async function readJson(request) {
	try {
		return await request.json();
	} catch {
		return null;
	}
}

export function managePage(env, id) {
	const url = `${env.PAGES_ORIGIN}/@anon/${id}/`;
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Manage your space</title>
<style>body{margin:0;background:#fbfaf7;color:#1d1c1a;font:16px/1.55 ui-sans-serif,system-ui,sans-serif}main{max-width:620px;margin:0 auto;padding:56px 18px}h1{font-size:32px;letter-spacing:-.02em;margin:0 0 8px}p{color:#6b6862}a{color:#2d4cc8}code{background:#fff;border:1px solid #e6e2da;border-radius:6px;padding:2px 6px}button{font:inherit;font-weight:700;border:0;border-radius:10px;padding:11px 18px;background:#b3261e;color:#fff;cursor:pointer}#msg{font-weight:600;color:#1d1c1a}</style></head>
<body><main><h1>Your space</h1><p><a href="${url}">${url}</a></p><p>Keep this page's address: it holds the key that deletes or updates the space. Anyone with it can.</p>
<p><button id="del">Delete this space</button></p><p id="msg"></p></main>
<script>
const token = location.hash.slice(1);
const msg = document.getElementById("msg");
if (!/^[a-f0-9]{48}$/.test(token)) { document.getElementById("del").disabled = true; msg.textContent = "This address has no key. Use the full link you were given."; }
document.getElementById("del").onclick = async () => {
  if (!document.getElementById("del").dataset.sure) { document.getElementById("del").dataset.sure = 1; document.getElementById("del").textContent = "Click again to delete for good"; return; }
  const r = await fetch("/v1/spaces/${id}", { method: "DELETE", headers: { authorization: "Bearer " + token } });
  msg.textContent = r.ok ? "Deleted. The page is gone in a minute or two." : "Could not delete: " + ((await r.json().catch(() => ({}))).error || r.status);
};
</script></body></html>`;
}

// ---- Sign in with GitHub ------------------------------------------------------------------------------------

const SESSION_SECONDS = 3600;
const HANDLE = /^[a-z0-9](?:[a-z0-9-]{0,38})$/;
const b64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (text) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function hmac(secret, text) {
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	return b64(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text))));
}

/** A signed session `gh1.<payload>.<mac>` holding only the lowercased login and when it ends. */
export async function signSession(env, login, now = Date.now()) {
	const payload = b64(new TextEncoder().encode(JSON.stringify({ login: login.toLowerCase(), exp: Math.floor(now / 1000) + SESSION_SECONDS })));
	return `gh1.${payload}.${await hmac(env.SESSION_SECRET, `gh1.${payload}`)}`;
}

/** The login a session belongs to, or "" when it is forged, malformed or over. */
export async function readSession(env, token, now = Date.now()) {
	const m = /^gh1\.([\w-]+)\.([\w-]+)$/.exec(token ?? "");
	if (!m || !env.SESSION_SECRET) return "";
	if ((await hmac(env.SESSION_SECRET, `gh1.${m[1]}`)) !== m[2]) return "";
	try {
		const { login, exp } = JSON.parse(new TextDecoder().decode(unb64(m[1])));
		return HANDLE.test(login) && exp > now / 1000 ? login : "";
	} catch {
		return "";
	}
}

/** Only an http(s) page on an allowed site may be returned to, so the redirect cannot be turned on another site. */
export function safeReturn(env, value) {
	try {
		const u = new URL(value);
		const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
		return allowed.includes(u.origin) ? u.origin + u.pathname + u.search : "";
	} catch {
		return "";
	}
}

const cookie = (value, maxAge) => `gh_state=${value}; Max-Age=${maxAge}; Path=/auth; HttpOnly; Secure; SameSite=Lax`;

async function startLogin(request, env) {
	const url = new URL(request.url);
	const back = safeReturn(env, url.searchParams.get("return") ?? "");
	if (!back || !env.GITHUB_CLIENT_ID || !env.SESSION_SECRET) return json({ error: "sign-in is not set up for that page" }, 400);
	const state = newToken();
	const q = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, redirect_uri: `${env.PUBLISH_ORIGIN}/auth/callback`, state, allow_signup: "false" });
	return new Response(null, {
		status: 302,
		headers: { location: `https://github.com/login/oauth/authorize?${q}`, "set-cookie": cookie(`${state}.${b64(new TextEncoder().encode(back))}`, 600) },
	});
}

async function finishLogin(request, env, fetcher) {
	const url = new URL(request.url);
	const [state, back64] = (/(?:^|;\s*)gh_state=([^;]+)/.exec(request.headers.get("cookie") ?? "")?.[1] ?? "").split(".");
	const code = url.searchParams.get("code") ?? "";
	if (!TOKEN.test(state ?? "") || state !== url.searchParams.get("state") || !code || !back64)
		return json({ error: "that sign-in did not start here; try again" }, 400);
	const back = safeReturn(env, new TextDecoder().decode(unb64(back64)));
	if (!back) return json({ error: "bad return page" }, 400);
	const token = await fetcher("https://github.com/login/oauth/access_token", {
		method: "POST",
		headers: { accept: "application/json", "content-type": "application/json", "user-agent": "pages-publish-worker" },
		body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: `${env.PUBLISH_ORIGIN}/auth/callback` }),
	}).then((r) => r.json()).catch(() => ({}));
	if (typeof token.access_token !== "string") return json({ error: "GitHub did not accept that sign-in; try again" }, 400);
	const me = await fetcher("https://api.github.com/user", {
		headers: { authorization: `Bearer ${token.access_token}`, accept: "application/vnd.github+json", "user-agent": "pages-publish-worker" },
	}).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
	const login = String(me.login ?? "").toLowerCase();
	if (!HANDLE.test(login)) return json({ error: "could not read your GitHub login" }, 502);
	// The access token goes no further than this function.
	return new Response(null, {
		status: 302,
		headers: { location: `${back}#gh=${await signSession(env, login)}`, "set-cookie": cookie("", 0), "referrer-policy": "no-referrer" },
	});
}

async function ownSpace(request, env, fetcher, headers, url) {
	const login = await readSession(env, bearer(request));
	if (!login) return json({ error: "sign in with GitHub first" }, 401, headers);
	if (request.method === "GET") return json({ login }, 200, headers);
	let content = {};
	if (request.method === "PUT") {
		const [c, problem] = readContent(await readJson(request));
		if (problem || !c.cv) return json({ error: problem || "send a cv" }, 400, headers);
		content = c;
	}
	const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
	if (await overLimit(env, url.origin, ip)) return json({ error: "Too many changes from here; try again in an hour." }, 429, headers);
	const op = request.method === "PUT" ? "save" : "remove";
	if (!(await dispatch(env, { op, owner: login, ...content }, fetcher)))
		return json({ error: "Could not reach GitHub; try again." }, 502, headers);
	return json({ login, url: `${env.PAGES_ORIGIN}/@${login}/cv/`, live_in_seconds: 120 }, 202, headers);
}

// ---- Publish from GitHub Actions ----------------------------------------------------------------------------
//
// The job asks GitHub for an OIDC token (`permissions: id-token: write`), so nobody sets up a secret. The token is
// checked against GitHub's keys and the space goes under the repository's owner, the one thing it proves:
// whoever can run a workflow in a repository of that owner can publish under /@<owner>/. The files are stored as one
// blob in PAGES_REPO and the publish-anon workflow checks them like every other publish before committing the branch
// space/<owner>/<slug>.

const OIDC_ISSUER = "https://token.actions.githubusercontent.com";
/** Handles that are not a GitHub owner's space. */
const RESERVED = new Set(["anon"]);
// LIMITS in services/app/web/src/check.mjs, which the workflow checks again.
export const CI_LIMITS = { files: 300, totalBytes: 10 * 1024 * 1024 };
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
const PATH_PART = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** The claims of a GitHub Actions OIDC token meant for this service, or null when it is not one. */
export async function verifyOidc(env, jwt, fetcher = fetch, now = Date.now()) {
	const parts = (jwt ?? "").split(".");
	if (parts.length !== 3) return null;
	let header;
	let claims;
	try {
		header = JSON.parse(new TextDecoder().decode(unb64(parts[0])));
		claims = JSON.parse(new TextDecoder().decode(unb64(parts[1])));
	} catch {
		return null;
	}
	if (header?.alg !== "RS256" || typeof header.kid !== "string") return null;
	const jwks = await fetcher(`${OIDC_ISSUER}/.well-known/jwks`, { headers: { "user-agent": "pages-publish-worker" } })
		.then((r) => (r.ok ? r.json() : {}))
		.catch(() => ({}));
	const jwk = (jwks.keys ?? []).find((k) => k.kid === header.kid && k.kty === "RSA");
	if (!jwk) return null;
	try {
		const key = await crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
		const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
		if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, unb64(parts[2]), signed))) return null;
	} catch {
		return null;
	}
	const t = now / 1000;
	const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
	if (claims.iss !== OIDC_ISSUER || !aud.includes(env.PUBLISH_ORIGIN) || !(claims.exp > t) || claims.nbf > t + 60) return null;
	return claims;
}

/** What a workflow sends: {slug, files: [{path, base64}]}. Returns [{slug, files}, problem]. */
export function readFiles(body) {
	if (!SLUG.test(body?.slug ?? "")) return [null, "slug must be lowercase letters, digits and dashes"];
	if (!Array.isArray(body.files) || !body.files.length) return [null, "files is required"];
	if (body.files.length > CI_LIMITS.files) return [null, `${body.files.length} files: the limit is ${CI_LIMITS.files}`];
	const paths = new Set();
	let bytes = 0;
	for (const f of body.files) {
		if (typeof f?.path !== "string" || typeof f.base64 !== "string" || !BASE64.test(f.base64))
			return [null, "each file is {path, base64}"];
		if (!f.path.split("/").every((part) => PATH_PART.test(part)) || paths.has(f.path))
			return [null, `bad file path: ${f.path.slice(0, 120)}`];
		paths.add(f.path);
		bytes += Math.floor((f.base64.length * 3) / 4);
	}
	if (bytes > CI_LIMITS.totalBytes) return [null, `over ${CI_LIMITS.totalBytes / 1048576} MB in all`];
	if (!paths.has("index.html") && !paths.has("index.md")) return [null, "the page needs an index.html or index.md"];
	return [{ slug: body.slug, files: body.files.map(({ path, base64 }) => ({ path, base64 })) }, ""];
}

/** The repository owner a request's OIDC token proves, or a Response saying why not. */
async function ciOwner(request, env, fetcher, headers) {
	const claims = await verifyOidc(env, bearer(request), fetcher);
	if (!claims)
		return [null, json({ error: `send a GitHub Actions OIDC token for audience ${env.PUBLISH_ORIGIN} (the job needs permissions: id-token: write)` }, 401, headers)];
	const owner = String(claims.repository_owner ?? "").toLowerCase();
	if (!HANDLE.test(owner) || RESERVED.has(owner)) return [null, json({ error: `cannot publish under @${owner}` }, 403, headers)];
	return [{ owner, claims }, null];
}

async function ciRemove(request, env, fetcher, headers, url, slug) {
	const [who, refused] = await ciOwner(request, env, fetcher, headers);
	if (refused) return refused;
	if (!SLUG.test(slug)) return json({ error: "unknown space" }, 404, headers);
	if (await overLimit(env, url.origin, `ci-${who.owner}`, Number(env.MAX_CI_PER_HOUR ?? 20), Number(env.MAX_CI_PER_DAY ?? 100)))
		return json({ error: `Too many changes for @${who.owner}; try again in an hour.` }, 429, headers);
	const source = `https://github.com/${who.claims.repository}/actions/runs/${who.claims.run_id}`;
	if (!(await dispatch(env, { op: "ci-remove", owner: who.owner, slug, source }, fetcher)))
		return json({ error: "Could not reach GitHub; try again." }, 502, headers);
	return json({ url: `${env.PAGES_ORIGIN}/@${who.owner}/${slug}/` }, 202, headers);
}

/**
 * The newest commit of the branch space/<handle>/<slug>: its sha, the run it came from (Source:) and when. Answers
 * are cached for a few seconds, since every CI job that publishes polls this.
 */
async function spaceHead(env, fetcher, headers, handle, slug) {
	if (!validIdPair(handle, slug)) return json({ error: "unknown space" }, 404, headers);
	const key = new Request(`${env.PUBLISH_ORIGIN}/__head/${handle}/${slug}`);
	try {
		const hit = await caches.default.match(key);
		if (hit) return new Response(hit.body, { status: 200, headers: { "content-type": "application/json", ...headers } });
	} catch {}
	const res = await fetcher(`https://api.github.com/repos/${env.PAGES_REPO}/commits/space/${handle}/${slug}`, {
		headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "user-agent": "pages-publish-worker" },
	}).catch(() => null);
	if (!res || (res.status !== 200 && res.status !== 404 && res.status !== 422)) return json({ error: "Could not reach GitHub; try again." }, 502, headers);
	const c = res.status === 200 ? await res.json() : null;
	const body = JSON.stringify(
		c ? { sha: c.sha, source: /^Source: (\S+)$/m.exec(c.commit?.message ?? "")?.[1] ?? null, date: c.commit?.committer?.date ?? null } : { sha: null },
	);
	try {
		await caches.default.put(key, new Response(body, { headers: { "cache-control": "s-maxage=4" } }));
	} catch {}
	return new Response(body, { status: 200, headers: { "content-type": "application/json", ...headers } });
}

const validIdPair = (handle, slug) => HANDLE.test(handle) && SLUG.test(slug);

async function ciPublish(request, env, fetcher, headers, url) {
	const [who, refused] = await ciOwner(request, env, fetcher, headers);
	if (refused) return refused;
	const { owner, claims } = who;
	const [content, problem] = readFiles(await readJson(request));
	if (problem) return json({ error: problem }, 400, headers);
	if (await overLimit(env, url.origin, `ci-${owner}`, Number(env.MAX_CI_PER_HOUR ?? 20), Number(env.MAX_CI_PER_DAY ?? 100)))
		return json({ error: `Too many publishes for @${owner}; try again in an hour.` }, 429, headers);
	// A dispatch payload is too small for a page, so the files go to the repository as one blob the workflow reads.
	const blob = await fetcher(`https://api.github.com/repos/${env.PAGES_REPO}/git/blobs`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${env.GITHUB_TOKEN}`,
			accept: "application/vnd.github+json",
			"user-agent": "pages-publish-worker",
			"content-type": "application/json",
		},
		body: JSON.stringify({ content: JSON.stringify(content.files), encoding: "utf-8" }),
	})
		.then((r) => (r.status === 201 ? r.json() : {}))
		.catch(() => ({}));
	if (!/^[a-f0-9]{40}$/.test(blob.sha ?? "")) return json({ error: "Could not reach GitHub; try again." }, 502, headers);
	const payload = {
		op: "ci",
		owner,
		slug: content.slug,
		blob: blob.sha,
		source: `https://github.com/${claims.repository}/actions/runs/${claims.run_id}`,
	};
	if (!(await dispatch(env, payload, fetcher))) return json({ error: "Could not reach GitHub; try again." }, 502, headers);
	return json(
		{
			url: `${env.PAGES_ORIGIN}/@${owner}/${content.slug}/`,
			live_in_seconds: 120,
			runs: `https://github.com/${env.PAGES_REPO}/actions/workflows/publish-anon.yml`,
		},
		202,
		headers,
	);
}

export async function handle(request, env, fetcher = fetch) {
	const url = new URL(request.url);
	const origin = url.origin;
	const headers = cors(request, env);
	if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

	if (request.method === "GET" && url.pathname === "/")
		return Response.redirect(`${env.PAGES_ORIGIN}/about`, 302);
	if (request.method === "GET" && url.pathname === "/health") return json({ ok: true }, 200);
	const manage = url.pathname.match(/^\/manage\/([a-z0-9]{10})$/);
	if (request.method === "GET" && manage)
		return new Response(managePage(env, manage[1]), {
			headers: {
				"content-type": "text/html; charset=utf-8",
				"content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'",
				"referrer-policy": "no-referrer",
			},
		});

	if (request.method === "GET" && url.pathname === "/auth/github") return startLogin(request, env);
	if (request.method === "GET" && url.pathname === "/auth/callback") return finishLogin(request, env, fetcher);
	if (url.pathname === "/v1/me" && request.method === "GET") return ownSpace(request, env, fetcher, headers, url);
	if (url.pathname === "/v1/me/space" && (request.method === "PUT" || request.method === "DELETE"))
		return ownSpace(request, env, fetcher, headers, url);

	if (request.method === "POST" && url.pathname === "/v1/ci/spaces") return ciPublish(request, env, fetcher, headers, url);
	const head = url.pathname.match(/^\/v1\/spaces\/([^/]+)\/([^/]+)\/head$/);
	if (request.method === "GET" && head) return spaceHead(env, fetcher, headers, head[1], head[2]);
	const ciSpace = url.pathname.match(/^\/v1\/ci\/spaces\/([^/]+)$/);
	if (request.method === "DELETE" && ciSpace) return ciRemove(request, env, fetcher, headers, url, ciSpace[1]);

	const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
	if (request.method === "POST" && url.pathname === "/v1/spaces") {
		const body = await readJson(request);
		// One CV per GitHub account: a developer CV is only published under a sign-in (PUT /v1/me/space), so nobody can
		// pile up copies. Anonymous publishing stays for Markdown.
		if (body && body.cv !== undefined)
			return json({ error: "A CV needs a GitHub sign-in: you get one CV per GitHub account.", sign_in: `${env.PUBLISH_ORIGIN}/auth/github` }, 403, headers);
		const [content, problem] = readContent(body);
		if (problem) return json({ error: problem }, 400, headers);
		if (await overLimit(env, origin, ip)) return json({ error: "Too many publishes from here; try again in an hour." }, 429, headers);
		const id = newId();
		const token = newToken();
		const source = typeof body.source === "string" ? body.source.slice(0, 200) : "";
		if (!(await dispatch(env, { op: "publish", id, hash: await sha256(token), ...content, source }, fetcher)))
			return json({ error: "Could not reach GitHub; try again." }, 502, headers);
		return json(
			{ id, url: `${env.PAGES_ORIGIN}/@anon/${id}/`, token, manage: `${env.PUBLISH_ORIGIN}/manage/${id}#${token}`, live_in_seconds: 120 },
			202,
			headers,
		);
	}

	const one = url.pathname.match(/^\/v1\/spaces\/([^/]+)$/);
	if (one && (request.method === "PUT" || request.method === "DELETE")) {
		const id = one[1];
		const token = bearer(request);
		if (!ID.test(id) || !TOKEN.test(token)) return json({ error: "unknown space or key" }, 404, headers);
		if (await overLimit(env, origin, ip)) return json({ error: "Too many changes from here; try again in an hour." }, 429, headers);
		let content = {};
		if (request.method === "PUT") {
			const [c, problem] = readContent(await readJson(request));
			if (problem) return json({ error: problem }, 400, headers);
			content = c;
		}
		const op = request.method === "PUT" ? "update" : "delete";
		// The workflow compares this hash with the one on the branch; a wrong key changes nothing.
		if (!(await dispatch(env, { op, id, hash: await sha256(token), ...content }, fetcher)))
			return json({ error: "Could not reach GitHub; try again." }, 502, headers);
		return json({ id, url: `${env.PAGES_ORIGIN}/@anon/${id}/` }, 202, headers);
	}

	return json({ error: "not found" }, 404, headers);
}

export default { fetch: (request, env) => handle(request, env) };
