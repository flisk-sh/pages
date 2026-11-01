import { describe, expect, it } from "bun:test";
import { CI_LIMITS, handle, readFiles, verifyOidc } from "../src/worker.js";

const env = {
	PAGES_REPO: "flisk-sh/pages",
	PAGES_ORIGIN: "https://pages.test",
	PUBLISH_ORIGIN: "https://publish.test",
	GITHUB_TOKEN: "t",
};
const ISSUER = "https://token.actions.githubusercontent.com";
const b64 = (bytes) => Buffer.from(bytes).toString("base64url");
const keys = await crypto.subtle.generateKey(
	{ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
	true,
	["sign", "verify"],
);
const jwk = { ...(await crypto.subtle.exportKey("jwk", keys.publicKey)), kid: "k1" };

/** A token as GitHub Actions issues it, signed with the test key. */
async function token(claims = {}, { kid = "k1", key = keys.privateKey } = {}) {
	const now = Math.floor(Date.now() / 1000);
	const head = b64(JSON.stringify({ alg: "RS256", typ: "JWT", kid }));
	const body = b64(
		JSON.stringify({
			iss: ISSUER,
			aud: "https://publish.test",
			exp: now + 300,
			nbf: now - 5,
			repository: "Some-Org/tool",
			repository_owner: "Some-Org",
			run_id: "123",
			...claims,
		}),
	);
	const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${body}`));
	return `${head}.${body}.${b64(new Uint8Array(sig))}`;
}

/** Answers like GitHub: its keys, a new blob, and the dispatch. Records what was sent. */
function github() {
	const sent = [];
	const fetcher = async (url, init = {}) => {
		if (url === `${ISSUER}/.well-known/jwks`) return Response.json({ keys: [jwk] });
		sent.push({ url, body: JSON.parse(init.body) });
		if (url.endsWith("/git/blobs")) return Response.json({ sha: "a".repeat(40) }, { status: 201 });
		return new Response(null, { status: 204 });
	};
	return { sent, fetcher };
}
const page = { slug: "bench", files: [{ path: "index.html", base64: btoa("<h1>hi</h1>") }, { path: "data/r.json", base64: btoa("{}") }] };
const post = (auth, body = page) =>
	new Request("https://publish.test/v1/ci/spaces", {
		method: "POST",
		headers: { "content-type": "application/json", authorization: `Bearer ${auth}` },
		body: JSON.stringify(body),
	});

describe("publishing from GitHub Actions", () => {
	it("stores the files as a blob and dispatches a space under the repository owner", async () => {
		const gh = github();
		const res = await handle(post(await token()), env, gh.fetcher);
		expect(res.status).toBe(202);
		expect((await res.json()).url).toBe("https://pages.test/@some-org/bench/");
		expect(gh.sent).toHaveLength(2);
		expect(gh.sent[0].url).toBe("https://api.github.com/repos/flisk-sh/pages/git/blobs");
		expect(JSON.parse(gh.sent[0].body.content)).toEqual(page.files);
		expect(gh.sent[1].body).toEqual({
			event_type: "pages-anon",
			client_payload: {
				op: "ci",
				owner: "some-org",
				slug: "bench",
				blob: "a".repeat(40),
				source: "https://github.com/Some-Org/tool/actions/runs/123",
			},
		});
	});

	it("refuses tokens that are not GitHub's, not for this service, or over", async () => {
		const other = await crypto.subtle.generateKey(
			{ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
			true,
			["sign"],
		);
		const bad = [
			"not-a-token",
			await token({}, { key: other.privateKey }),
			await token({}, { kid: "nope" }),
			await token({ aud: "https://elsewhere.test" }),
			await token({ iss: "https://evil.test" }),
			await token({ exp: Math.floor(Date.now() / 1000) - 10 }),
		];
		for (const t of bad) {
			const gh = github();
			const res = await handle(post(t), env, gh.fetcher);
			expect(res.status).toBe(401);
			expect(gh.sent).toHaveLength(0);
		}
		expect(await verifyOidc(env, await token({ aud: ["x", "https://publish.test"] }), github().fetcher)).not.toBeNull();
	});

	it("never publishes under @anon", async () => {
		const res = await handle(post(await token({ repository_owner: "anon" })), env, github().fetcher);
		expect(res.status).toBe(403);
	});

	it("refuses bad slugs, paths and sizes before storing anything", async () => {
		const cases = [
			{ slug: "Bad Slug", files: page.files },
			{ slug: "ok", files: [] },
			{ slug: "ok", files: [{ path: "../index.html", base64: "" }] },
			{ slug: "ok", files: [{ path: "a/.git/config", base64: "" }, { path: "index.md", base64: "" }] },
			{ slug: "ok", files: [{ path: "/etc/passwd", base64: "" }] },
			{ slug: "ok", files: [{ path: "page.html", base64: "" }] },
			{ slug: "ok", files: [{ path: "index.md", base64: "%%%" }] },
			{ slug: "ok", files: Array.from({ length: CI_LIMITS.files + 1 }, (_, i) => ({ path: `f${i}.md`, base64: "" })) },
			{ slug: "ok", files: [{ path: "index.md", base64: "A".repeat(CI_LIMITS.totalBytes * 1.4) }] },
		];
		for (const body of cases) {
			expect(readFiles(body)[1]).not.toBe("");
			const gh = github();
			expect((await handle(post(await token(), body), env, gh.fetcher)).status).toBe(400);
			expect(gh.sent).toHaveLength(0);
		}
	});
});
