import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../src/index.js";

globalThis.caches ??= { default: { async match() {}, async put() {}, async delete() {} } };

const PATHS = ["/.well-known/mcp-server-card.json", "/.well-known/mcp/server-card.json"];
const get = (path, method = "GET") => worker.fetch(new Request(`https://pages.flisk.si${path}`, { method }), {}, { waitUntil() {} });

test("both well-known paths serve the same MCP Server Card", async () => {
  const bodies = [];
  for (const path of PATHS) {
    const res = await get(path);
    assert.equal(res.status, 200, path);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    assert.equal(res.headers.get("cache-control"), "public, max-age=3600");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    bodies.push(await res.text());
  }
  assert.equal(bodies[0], bodies[1]);
  const card = JSON.parse(bodies[0]);
  assert.equal(card.$schema, "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json");
  assert.equal(card.name, "si.flisk/pages");
  assert.equal(card.title, "Pages MCP");
  assert.equal(card.remotes[0].type, "streamable-http");
  assert.equal(card.remotes[0].url, "https://pages.flisk.si/mcp");
});

test("the card matches initialize", async () => {
  const card = await (await get(PATHS[0])).json();
  const init = await (
    await worker.fetch(
      new Request("https://pages.flisk.si/mcp", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "9.9.9.8" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } } }) }),
      {},
      { waitUntil() {} },
    )
  ).json();
  assert.equal(card.title, init.result.serverInfo.title);
  assert.equal(card.version, init.result.serverInfo.version);
});

test("HEAD has the headers and no body; POST and other well-known paths are not the card", async () => {
  const head = await get(PATHS[1], "HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(await head.text(), "");
  assert.equal((await get(PATHS[0], "POST")).status, 404);
  assert.equal((await get("/.well-known/other.json")).status, 404);
});

test("wrangler routes cover exactly the two card paths and no wildcard under /.well-known/", () => {
  const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  for (const path of PATHS) assert.ok(toml.includes(`pattern = "pages.flisk.si${path}"`), path);
  assert.doesNotMatch(toml, /pattern = "pages\.flisk\.si\/\.well-known\/\*"/);
});
