// Pages MCP: a remote, read-only, keyless MCP server at https://pages.flisk.si/mcp for the Claude directory.
// Paste a page, get the publish check's verdict. No storage, no model, nothing is published from here.
import { APPLE_TOUCH_PNG_BASE64, FAVICON_ICO_BASE64, ICON_512_PNG_BASE64, ICON_SVG } from "./icons.js";
import { MAX_BODY_BYTES, overLimit } from "./limits.js";
import { pagesMcpRoute } from "./mcp.js";
import { withSecurityHeaders } from "./security-headers.js";

const bytesOf = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", ...headers } });

const PAGE = `Pages MCP

Check your web page, then put it online as a free public link on pages.flisk.si.

MCP server (Streamable HTTP, no key, read-only): https://pages.flisk.si/mcp
Tools: check_page, how_to_put_page_online
Put a page online: npx -y @flisk-sh/pages publish page.html --wait
Source: https://github.com/flisk-sh/pages/tree/main/workers/pages-mcp
Privacy: nothing is stored or published by this server, no account, no key.
`;

// The one place the host is written for the MCP Server Card.
const HOST = "https://pages.flisk.si";
// Same name, title and version as initialize, and only the tools that tools/list returns.
const SERVER_CARD = JSON.stringify(
  {
    $schema: "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
    name: "si.flisk/pages",
    title: "Pages MCP",
    description: "Check a web page before it goes online, and get the steps to put it online at a public link.",
    version: "1.0.0",
    websiteUrl: `${HOST}/`,
    remotes: [{ type: "streamable-http", url: `${HOST}/mcp` }],
  },
  null,
  2,
);
const CARD_PATHS = new Set(["/.well-known/mcp-server-card.json", "/.well-known/mcp/server-card.json"]);

const STATIC = {
  "/favicon.ico": ["image/x-icon", bytesOf(FAVICON_ICO_BASE64)],
  "/apple-touch-icon.png": ["image/png", bytesOf(APPLE_TOUCH_PNG_BASE64)],
  "/icon-512.png": ["image/png", bytesOf(ICON_512_PNG_BASE64)],
  "/icon.svg": ["image/svg+xml", ICON_SVG],
  "/robots.txt": ["text/plain; charset=utf-8", "User-agent: *\nAllow: /\n"],
  "/": ["text/plain; charset=utf-8", PAGE],
  "/about": ["text/plain; charset=utf-8", PAGE],
};

const app = {
  async fetch(request, env = {}) {
    const { pathname } = new URL(request.url);
    if (pathname === "/mcp") {
      // Only POSTs do work: count them per caller, and refuse a body that is far larger than any real message.
      if (request.method === "POST") {
        const { limited, retryAfter } = await overLimit(request, env);
        if (limited) return json({ error: "rate_limited", hint: "Too many requests from this address. Try again later." }, 429, { "retry-after": String(retryAfter) });
        if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return json({ error: "too_large", hint: `Keep the request under ${MAX_BODY_BYTES} bytes.` }, 413);
      }
      return pagesMcpRoute(request, json);
    }
    if (CARD_PATHS.has(pathname) && (request.method === "GET" || request.method === "HEAD")) {
      return new Response(request.method === "HEAD" ? null : SERVER_CARD, {
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" },
      });
    }
    if (pathname === "/health") return json({ ok: true });
    const hit = STATIC[pathname];
    if (hit && (request.method === "GET" || request.method === "HEAD")) {
      return new Response(request.method === "HEAD" ? null : hit[1], { headers: { "content-type": hit[0], "cache-control": "public, max-age=86400", "access-control-allow-origin": "*" } });
    }
    // The /api/* route exists only so JSON callers get a JSON error instead of the static site's HTML 404 page.
    if (pathname.startsWith("/api/")) return json({ error: "not found", hint: "No such API route." }, 404);
    return json({ error: "not_found", hint: "The MCP server is at /mcp" }, 404);
  },
};

export default {
  async fetch(request, env = {}, ctx) {
    return withSecurityHeaders(await app.fetch(request, env, ctx));
  },
};
