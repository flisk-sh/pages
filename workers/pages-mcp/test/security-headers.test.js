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
};
const get = (path, init) => worker.fetch(new Request(`https://pages.flisk.si${path}`, init), {}, { waitUntil() {} });

test("health, a 404 and the MCP endpoint all carry the baseline headers", async () => {
  const mcp = new Request("https://pages.flisk.si/mcp", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "8.8.8.8" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) });
  for (const res of [await get("/health"), await get("/nothing"), await worker.fetch(mcp, {}, { waitUntil() {} })]) {
    for (const [k, v] of Object.entries(EXPECTED)) assert.equal(res.headers.get(k), v);
    assert.match(res.headers.get("content-security-policy"), /frame-ancestors 'self'/);
  }
});

test("existing headers are kept and an existing CSP only gains frame-ancestors", () => {
  const res = withSecurityHeaders(new Response("x", { headers: { "x-frame-options": "DENY", "content-security-policy": "default-src 'none'" } }));
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.equal(res.headers.get("content-security-policy"), "default-src 'none'; frame-ancestors 'self'");
  const kept = withSecurityHeaders(new Response("x", { headers: { "content-security-policy": "frame-ancestors 'none'" } }));
  assert.equal(kept.headers.get("content-security-policy"), "frame-ancestors 'none'");
});
