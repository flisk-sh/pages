import { describe, expect, it } from "bun:test";
import { checkMarkdown, handle, MAX_MARKDOWN_BYTES, newId, newToken, readSession, safeReturn, sha256, signSession } from "../src/worker.js";

const env = {
	PAGES_REPO: "flisk-sh/pages",
	PAGES_ORIGIN: "https://pages.test",
	PUBLISH_ORIGIN: "https://publish.test",
	ALLOWED_ORIGINS: "https://roadmap.test",
	GITHUB_TOKEN: "t",
};
/** A fetch that records the dispatches the worker sends and answers like GitHub. */
function github(status = 204) {
	const sent = [];
	const fetcher = async (url, init) => {
		sent.push({ url, body: JSON.parse(init.body), auth: init.headers.authorization });
		return new Response(null, { status });
	};
	return { sent, fetcher };
}
const req = (method, path, body, headers = {}) =>
	new Request(`https://publish.test${path}`, {
		method,
		headers: { "content-type": "application/json", origin: "https://roadmap.test", ...headers },
		body: body === undefined ? undefined : JSON.stringify(body),
	});

describe("publishing", () => {
	it("dispatches a new anonymous space and answers with its link, key and manage page", async () => {
		const gh = github();
		const res = await handle(req("POST", "/v1/spaces", { markdown: "# Hi\n\nA portfolio.", source: "roadmap.flisk.si/portfolio" }), env, gh.fetcher);
		expect(res.status).toBe(202);
		expect(res.headers.get("access-control-allow-origin")).toBe("https://roadmap.test");
		const out = await res.json();
		expect(out.id).toMatch(/^[a-z0-9]{10}$/);
		expect(out.url).toBe(`https://pages.test/@anon/${out.id}/`);
		expect(out.manage).toBe(`https://publish.test/manage/${out.id}#${out.token}`);
		expect(gh.sent).toHaveLength(1);
		expect(gh.sent[0].url).toBe("https://api.github.com/repos/flisk-sh/pages/dispatches");
		expect(gh.sent[0].body.event_type).toBe("pages-anon");
		const p = gh.sent[0].body.client_payload;
		expect(p).toMatchObject({ op: "publish", id: out.id, markdown: "# Hi\n\nA portfolio.", source: "roadmap.flisk.si/portfolio" });
		// only the hash of the key leaves the worker
		expect(p.hash).toBe(await sha256(out.token));
		expect(JSON.stringify(p)).not.toContain(out.token);
	});

	it.each([
		["no markdown", {}],
		["empty markdown", { markdown: "  " }],
		["a script", { markdown: "# x\n<script>alert(1)</script>" }],
		["an iframe", { markdown: "<iframe src=x>" }],
		["a password field", { markdown: '<input type="password">' }],
		["too big", { markdown: "x".repeat(MAX_MARKDOWN_BYTES + 1) }],
	])("refuses %s without calling GitHub", async (_, body) => {
		const gh = github();
		const res = await handle(req("POST", "/v1/spaces", body), env, gh.fetcher);
		expect(res.status).toBe(400);
		expect(gh.sent).toHaveLength(0);
	});

	it("says so when GitHub does not take the dispatch", async () => {
		expect((await handle(req("POST", "/v1/spaces", { markdown: "# x" }), env, github(401).fetcher)).status).toBe(502);
	});

	it("gives other sites no CORS headers", async () => {
		const res = await handle(req("POST", "/v1/spaces", { markdown: "# x" }, { origin: "https://evil.test" }), env, github().fetcher);
		expect(res.headers.get("access-control-allow-origin")).toBeNull();
	});

	it("answers the preflight from an allowed site", async () => {
		const res = await handle(req("OPTIONS", "/v1/spaces"), env);
		expect(res.status).toBe(204);
		expect(res.headers.get("access-control-allow-methods")).toContain("DELETE");
	});
});

describe("a CV request", () => {
	it("sends only the ratings and a cleaned name to GitHub", async () => {
		const gh = github();
		const res = await handle(req("POST", "/v1/spaces", { cv: { me: "bun3,helm2", name: " Sam  <b>Doe</b> " } }), env, gh.fetcher);
		expect(res.status).toBe(202);
		const p = gh.sent[0].body.client_payload;
		expect(p.cv).toEqual({ me: "bun3,helm2", name: "Sam bDoe/b" });
		expect(p.markdown).toBeUndefined();
	});

	it.each([
		["no ratings", { cv: {} }],
		["markup in the ratings", { cv: { me: "<script>" } }],
		["a level above 3", { cv: { me: "bun4" } }],
		["a name that is not text", { cv: { me: "bun3", name: 7 } }],
	])("refuses %s", async (_, body) => {
		expect((await handle(req("POST", "/v1/spaces", body), env, github().fetcher)).status).toBe(400);
	});
});

describe("updating and deleting", () => {
	const id = "abcdefghjk";
	const token = "a".repeat(48);

	it("sends the key's hash with the new version", async () => {
		const gh = github();
		const res = await handle(req("PUT", `/v1/spaces/${id}`, { markdown: "# v2" }, { authorization: `Bearer ${token}` }), env, gh.fetcher);
		expect(res.status).toBe(202);
		expect(gh.sent[0].body.client_payload).toEqual({ op: "update", id, hash: await sha256(token), markdown: "# v2" });
	});

	it("sends a delete with the key's hash", async () => {
		const gh = github();
		const res = await handle(req("DELETE", `/v1/spaces/${id}`, undefined, { authorization: `Bearer ${token}` }), env, gh.fetcher);
		expect(res.status).toBe(202);
		expect(gh.sent[0].body.client_payload).toEqual({ op: "delete", id, hash: await sha256(token) });
	});

	it("refuses a malformed id or key", async () => {
		const gh = github();
		expect((await handle(req("DELETE", "/v1/spaces/../x", undefined, { authorization: `Bearer ${token}` }), env, gh.fetcher)).status).toBe(404);
		expect((await handle(req("DELETE", `/v1/spaces/${id}`, undefined, { authorization: "Bearer nope" }), env, gh.fetcher)).status).toBe(404);
		expect(gh.sent).toHaveLength(0);
	});
});

describe("helpers", () => {
	it("ids are 10 unambiguous characters and keys 48 hex", () => {
		const ids = new Set(Array.from({ length: 500 }, newId));
		expect(ids.size).toBe(500);
		for (const i of ids) expect(i).toMatch(/^[a-km-np-z2-9]{10}$/);
		expect(newToken()).toMatch(/^[a-f0-9]{48}$/);
	});

	it("allows ordinary Markdown with tables, bars and links", () => {
		expect(checkMarkdown("# Me\n\n| a | b |\n| - | - |\n| `██░░` | 3 |\n\n[roadmap](https://roadmap.flisk.si)")).toBe("");
	});

	it("serves a manage page that keeps the key out of the request", async () => {
		const res = await handle(new Request("https://publish.test/manage/abcdefghjk"), env);
		expect(res.headers.get("content-type")).toContain("text/html");
		expect(res.headers.get("referrer-policy")).toBe("no-referrer");
		const html = await res.text();
		expect(html).toContain("https://pages.test/@anon/abcdefghjk/");
		expect(html).toContain("location.hash");
	});
});

describe("signing in with GitHub", () => {
	const auth = { ...env, GITHUB_CLIENT_ID: "cid", GITHUB_CLIENT_SECRET: "sec", SESSION_SECRET: "s3cret" };
	const back = "https://roadmap.test/portfolio/?me=bun3";

	it("sends the visitor to GitHub with no scope and remembers where to return", async () => {
		const res = await handle(new Request(`https://publish.test/auth/github?return=${encodeURIComponent(back)}`), auth);
		expect(res.status).toBe(302);
		const to = new URL(res.headers.get("location"));
		expect(to.origin + to.pathname).toBe("https://github.com/login/oauth/authorize");
		expect(to.searchParams.get("client_id")).toBe("cid");
		expect(to.searchParams.get("scope")).toBeNull();
		expect(to.searchParams.get("redirect_uri")).toBe("https://publish.test/auth/callback");
		const state = to.searchParams.get("state");
		expect(res.headers.get("set-cookie")).toContain(`gh_state=${state}.`);
		expect(res.headers.get("set-cookie")).toContain("HttpOnly");
	});

	it("does not return to a page outside the allowed sites", async () => {
		const res = await handle(new Request("https://publish.test/auth/github?return=https%3A%2F%2Fevil.test%2F"), auth);
		expect(res.status).toBe(400);
		expect(safeReturn(auth, "javascript:alert(1)")).toBe("");
		expect(safeReturn(auth, "https://roadmap.test/a?b=1#x")).toBe("https://roadmap.test/a?b=1");
	});

	async function callback(cookieState) {
		const start = await handle(new Request(`https://publish.test/auth/github?return=${encodeURIComponent(back)}`), auth);
		const cookie = start.headers.get("set-cookie").split(";")[0].replace(/gh_state=[a-f0-9]+/, (m) => (cookieState ? `gh_state=${cookieState}` : m));
		const calls = [];
		const fetcher = async (url, init) => {
			calls.push(url);
			if (url.includes("access_token")) return Response.json({ access_token: "tok" });
			return Response.json({ login: "Odykyi" });
		};
		const stateParam = new URL(start.headers.get("location")).searchParams.get("state");
		const res = await handle(new Request(`https://publish.test/auth/callback?code=c&state=${stateParam}`, { headers: { cookie } }), auth, fetcher);
		return { res, calls };
	}

	it("trades the code for a login, returns a signed session and keeps the GitHub token to itself", async () => {
		const { res, calls } = await callback();
		expect(res.status).toBe(302);
		const to = res.headers.get("location");
		expect(to.startsWith("https://roadmap.test/portfolio/?me=bun3#gh=gh1.")).toBe(true);
		expect(to).not.toContain("tok");
		expect(await readSession(auth, to.split("#gh=")[1])).toBe("odykyi");
		expect(calls).toHaveLength(2);
	});

	it("refuses a callback whose state does not match the cookie", async () => {
		const { res } = await callback("0".repeat(48));
		expect(res.status).toBe(400);
	});

	it("signs sessions that expire and cannot be forged", async () => {
		const t = await signSession(auth, "Sam", 0);
		expect(await readSession(auth, t, 1000)).toBe("sam");
		expect(await readSession(auth, t, 3_700_000)).toBe("");
		expect(await readSession({ ...auth, SESSION_SECRET: "other" }, t, 1000)).toBe("");
		const [a, , c] = t.split(".");
		const forged = `${a}.${btoa(JSON.stringify({ login: "root", exp: 9e9 })).replace(/=+$/, "")}.${c}`;
		expect(await readSession(auth, forged, 1000)).toBe("");
	});

	it("saves a signed-in CV for the session's login, whatever the body says", async () => {
		const gh = github();
		const session = await signSession(auth, "odykyi");
		const res = await handle(req("PUT", "/v1/me/space", { cv: { me: "bun3", name: "Sam" }, owner: "victim" }, { authorization: `Bearer ${session}` }), auth, gh.fetcher);
		expect(res.status).toBe(202);
		expect((await res.json()).url).toBe("https://pages.test/@odykyi/cv/");
		expect(gh.sent[0].body.client_payload).toEqual({ op: "save", owner: "odykyi", cv: { me: "bun3", name: "Sam" } });
	});

	it("takes it down, and refuses without a valid session", async () => {
		const gh = github();
		const session = await signSession(auth, "odykyi");
		expect((await handle(req("DELETE", "/v1/me/space", undefined, { authorization: `Bearer ${session}` }), auth, gh.fetcher)).status).toBe(202);
		expect(gh.sent[0].body.client_payload).toEqual({ op: "remove", owner: "odykyi" });
		expect((await handle(req("DELETE", "/v1/me/space", undefined, { authorization: "Bearer nope" }), auth, gh.fetcher)).status).toBe(401);
		expect(gh.sent).toHaveLength(1);
		const me = await handle(req("GET", "/v1/me", undefined, { authorization: `Bearer ${session}` }), auth);
		expect(await me.json()).toEqual({ login: "odykyi" });
	});
});
