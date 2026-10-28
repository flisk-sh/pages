import { describe, expect, it } from "bun:test";
import { checkMarkdown, handle, MAX_MARKDOWN_BYTES, newId, newToken, sha256 } from "../src/worker.js";

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
