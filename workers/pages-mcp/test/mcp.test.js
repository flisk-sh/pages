import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { TOOLS } from "../src/mcp.js";

globalThis.caches ??= { default: { async match() {}, async put() {}, async delete() {} } };

const env = {};
const rpcReq = (body, ip = "9.9.9.9") => new Request("https://pages.flisk.si/mcp", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: typeof body === "string" ? body : JSON.stringify(body) });
const post = (body, e = env) => worker.fetch(rpcReq(body), e, { waitUntil() {} });
const call = async (name, args, id = 1) => (await post({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } })).json();
const text = (r) => JSON.parse(r.result.content[0].text);
const page = (body, head = "") => `<!doctype html><html><head><title>Demo</title><meta name="description" content="A demo">${head}</head><body>${body}</body></html>`;

test("initialize names the server and offers tools only", async () => {
  const body = await (await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } } })).json();
  assert.equal(body.result.serverInfo.name, "flisk-pages");
  assert.deepEqual(body.result.capabilities, { tools: {}, prompts: {} });
});

test("both tools are read-only, titled, and publish nothing", async () => {
  const body = await (await post({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json();
  assert.deepEqual(body.result.tools.map((t) => t.name), ["check_page", "how_to_put_page_online"]);
  for (const t of TOOLS) {
    assert.equal(t.annotations.readOnlyHint, true, t.name);
    assert.equal(t.annotations.openWorldHint, false, t.name);
    assert.ok(t.annotations.title, t.name);
  }
  assert.equal(text(await call("how_to_put_page_online", {})).published_by_this_tool, false);
  assert.match(text(await call("how_to_put_page_online", {})).only_certain_people.command, /pages share page\.html/);
});

test("a clean page is ready and the next step is the publish command", async () => {
  const out = text(await call("check_page", { content: page("<p>hi</p>") }));
  assert.equal(out.ready, true);
  assert.deepEqual(out.problems, []);
  assert.match(out.next, /npx -y @flisk-sh\/pages publish page\.html --wait/);
});

test("a page that loads code from an unknown host is not ready, with a fix in plain words", async () => {
  const out = text(await call("check_page", { content: page("", '<script src="https://evil.example/x.js"></script>') }));
  assert.equal(out.ready, false);
  assert.equal(out.problems[0].rule, "script-src");
  assert.match(out.problems[0].what, /evil\.example/);
});

test("the file name decides the kind: a script with a wallet prompt and an SVG with a script", async () => {
  assert.equal(text(await call("check_page", { name: "app.js", content: "ethereum.request({method:'eth_requestAccounts'})" })).problems[0].rule, "wallet");
  assert.equal(text(await call("check_page", { name: "logo.svg", content: "<svg><script>1</script></svg>" })).problems[0].rule, "svg-script");
  assert.equal(text(await call("check_page", { name: "../../run.exe", content: "MZ" })).problems[0].rule, "extension", "a path is cut to the file name");
});

test("a missing title only warns", async () => {
  const out = text(await call("check_page", { content: "<!doctype html><p>hi</p>" }));
  assert.equal(out.ready, true);
  assert.deepEqual(out.worth_fixing.map((w) => w.rule).sort(), ["description", "title"]);
});

test("bad input is a tool error, not a crash", async () => {
  for (const content of [undefined, "", "x".repeat(200001)]) {
    const r = await call("check_page", { content });
    assert.equal(r.result.isError, true);
    assert.equal(text(r).error, "bad_input");
  }
});

test("unknown tools, methods and notifications; only POST; preflight; icons", async () => {
  assert.equal((await call("nope", {})).error.code, -32602);
  assert.equal((await (await post({ jsonrpc: "2.0", id: 3, method: "resources/list" })).json()).error.code, -32601);
  assert.equal((await post({ jsonrpc: "2.0", method: "notifications/initialized" })).status, 202);
  assert.equal((await post("not json")).status, 400);
  assert.equal((await worker.fetch(new Request("https://pages.flisk.si/mcp"), env, { waitUntil() {} })).status, 405);
  const opt = await worker.fetch(new Request("https://pages.flisk.si/mcp", { method: "OPTIONS" }), env, { waitUntil() {} });
  assert.equal(opt.status, 204);
  for (const [path, type] of [["/favicon.ico", "image/x-icon"], ["/icon-512.png", "image/png"], ["/apple-touch-icon.png", "image/png"], ["/icon.svg", "image/svg+xml"]]) {
    const res = await worker.fetch(new Request(`https://pages.flisk.si${path}`), env, { waitUntil() {} });
    assert.equal(res.headers.get("content-type"), type, path);
    assert.ok((await res.arrayBuffer()).byteLength > 100, path);
  }
});

function withCache(fn) {
  return async () => {
    const store = new Map();
    const saved = globalThis.caches;
    globalThis.caches = { default: { async match(r) { const v = store.get(r.url); return v === undefined ? undefined : new Response(v); }, async put(r, res) { store.set(r.url, await res.text()); } } };
    try {
      await fn();
    } finally {
      globalThis.caches = saved;
    }
  };
}

test("a caller over the per-minute cap gets 429 with retry-after; another address is fine", withCache(async () => {
  const e = { MAX_CALLS_PER_IP_MINUTE: "2", MAX_CALLS_PER_IP_HOUR: "300" };
  const ping = (ip) => worker.fetch(rpcReq({ jsonrpc: "2.0", id: 1, method: "ping" }, ip), e, { waitUntil() {} });
  assert.equal((await ping("1.1.1.1")).status, 200);
  assert.equal((await ping("1.1.1.1")).status, 200);
  const over = await ping("1.1.1.1");
  assert.equal(over.status, 429);
  assert.equal(over.headers.get("retry-after"), "60");
  assert.equal((await ping("2.2.2.2")).status, 200);
}));

test("a body larger than a page can be is refused", async () => {
  const res = await worker.fetch(new Request("https://pages.flisk.si/mcp", { method: "POST", headers: { "content-type": "application/json", "content-length": "999999" }, body: "{}" }), env, { waitUntil() {} });
  assert.equal(res.status, 413);
});

test("prompts/list offers put_my_page_online and prompts/get fills it", async () => {
  const list = await (await post({ jsonrpc: "2.0", id: 9, method: "prompts/list" })).json();
  assert.deepEqual(list.result.prompts.map((p) => p.name), ["put_my_page_online"]);
  const got = await (await post({ jsonrpc: "2.0", id: 10, method: "prompts/get", params: { name: "put_my_page_online" } })).json();
  assert.match(got.result.messages[0].content.text, /check_page/);
  assert.match(got.result.messages[0].content.text, /how_to_put_page_online/);
});
