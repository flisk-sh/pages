import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { withSecurityHeaders } from "../src/security-headers.js";

globalThis.caches ??= { default: { async match() {}, async put() {}, async delete() {} } };

const EXPECTED = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "content-security-policy": "frame-ancestors 'self' https://analytics.flisk.si",
};

const check = (res) => {
  for (const [k, v] of Object.entries(EXPECTED)) assert.equal(res.headers.get(k), v, k);
};

test("pages, health, 404 and MCP responses all carry the baseline headers", async () => {
  const env = {};
  const ctx = { waitUntil() {} };
  check(await worker.fetch(new Request("https://pages.flisk.si/"), env, ctx));
  check(await worker.fetch(new Request("https://pages.flisk.si/health"), env, ctx));
  check(await worker.fetch(new Request("https://pages.flisk.si/nope"), env, ctx));
  const mcp = await worker.fetch(
    new Request("https://pages.flisk.si/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }),
    env,
    ctx,
  );
  check(mcp);
  assert.equal(mcp.headers.get("access-control-allow-origin"), "*");
  assert.equal((await mcp.json()).result.tools.length, 2);
});

test("existing headers are kept, not duplicated, and a CSP gains frame-ancestors", () => {
  const res = withSecurityHeaders(new Response("x", { headers: { "x-frame-options": "DENY", "content-security-policy": "default-src 'none'" } }));
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.equal(res.headers.get("content-security-policy"), "default-src 'none'; frame-ancestors 'self' https://analytics.flisk.si");
  const keep = withSecurityHeaders(new Response("x", { headers: { "content-security-policy": "frame-ancestors https://a.example" } }));
  assert.equal(keep.headers.get("content-security-policy"), "frame-ancestors https://a.example");
});

test("the body stream passes through untouched", async () => {
  const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("a")); c.enqueue(new TextEncoder().encode("b")); c.close(); } });
  const src = new Response(stream, { headers: { "content-type": "text/event-stream" } });
  const out = withSecurityHeaders(src);
  assert.equal(out.body, src.body);
  assert.equal(await out.text(), "ab");
});
