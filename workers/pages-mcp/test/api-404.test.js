import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const get = (path) =>
	worker.fetch(new Request(`https://pages.flisk.si${path}`), {}, { waitUntil() {} });

test("an unknown /api/ path returns a JSON 404, not the static HTML page", async () => {
	const res = await get("/api/does-not-exist");
	assert.equal(res.status, 404);
	assert.match(res.headers.get("content-type"), /^application\/json/);
	const body = await res.json();
	assert.equal(typeof body.error, "string");
	assert.ok(body.error.length > 0);
	assert.doesNotMatch(body.hint ?? "", /\/mcp/, "the error must not point API callers at the MCP server");
});

test("the MCP endpoint and its static files are unaffected", async () => {
	const health = await get("/health");
	assert.equal(health.status, 200);
	assert.deepEqual(await health.json(), { ok: true });
	const icon = await get("/icon.svg");
	assert.equal(icon.status, 200);
	assert.match(icon.headers.get("content-type"), /^image\/svg\+xml/);
});
