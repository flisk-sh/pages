// "Put My Page Online" as an MCP server for the Claude directory: paste a page, get the same check the publish runs,
// and the one command that makes it a link on pages.flisk.si. Read-only, no key, nothing stored, nothing published:
// publishing needs the user's own GitHub login, so it stays a command they run (npx -y @flisk-sh/pages publish).
import { checkText, formatReport, LIMITS } from "../../../services/app/web/src/check.mjs";

const PROTOCOL = "2025-03-26";
const SITE = "https://pages.flisk.si/";
const PUBLISH = "npx -y @flisk-sh/pages publish page.html --wait";
const SHARE = "npx -y @flisk-sh/pages share page.html --wait";

export const TOOLS = [
  {
    name: "check_page",
    description:
      "Check a web page before it goes online on pages.flisk.si. Give the page's HTML (or a script or SVG file) and its file name. Returns what to fix, in plain words, using the same rules the publish applies. Nothing is published or stored.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", minLength: 1, maxLength: 200000, description: "The text of the file: the HTML of the page, for example" },
        name: { type: "string", maxLength: 80, description: "The file name, which says what kind of file it is. Default index.html" },
      },
      required: ["content"],
    },
    annotations: { title: "Check my page", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "how_to_put_page_online",
    description: "How to put a page online for free as a public link on pages.flisk.si: the steps, the one command and what the link looks like. Nothing is published by this tool.",
    inputSchema: { type: "object", properties: {} },
    annotations: { title: "How to put my page online", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

export const PROMPTS = [
  {
    name: "put_my_page_online",
    title: "Put my page online",
    description: "Check a page, fix what it lists, then give the one command that puts it online.",
    arguments: [],
  },
];

function getPrompt(name) {
  if (name !== "put_my_page_online") return null;
  return {
    description: "Check a page and put it online.",
    messages: [{ role: "user", content: { type: "text", text: "Check my page with check_page. Fix every problem it lists and check again until it passes. Then call how_to_put_page_online and give me the one command to put it online." } }],
  };
}


const rpc = (id, result) => ({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
const reply = (value, isError = false) => ({ isError, content: [{ type: "text", text: JSON.stringify(value) }] });

function checkPage(args) {
  const content = typeof args?.content === "string" ? args.content : "";
  const name = typeof args?.name === "string" && args.name.trim() ? args.name.trim().replace(/^.*[\\/]/, "") : "index.html";
  if (!content || content.length > 200000) return reply({ error: "bad_input", hint: "Give the file's text, up to 200000 characters." }, true);
  const result = checkText(name, content);
  return reply({
    ready: result.ok,
    say_it_plainly: result.ok ? "The page passes the checks and can go online." : `${result.errors.length} thing(s) must change before the page can go online.`,
    problems: result.errors.map((f) => ({ file: f.file, what: f.message, rule: f.rule })),
    worth_fixing: result.warnings.map((f) => ({ file: f.file, what: f.message, rule: f.rule })),
    report: formatReport(result),
    next: result.ok ? `Save it as page.html and run: ${PUBLISH}` : "Fix the problems, then check again.",
  });
}

function howTo() {
  return reply({
    steps: [
      "Make the page: one .html file, or a folder with an index.html (or a single .md file for a text page).",
      "Check it first with check_page, or run: npx -y @flisk-sh/pages check page.html",
      `Put it online: ${PUBLISH}`,
      "The link looks like https://pages.flisk.si/@your-github-name/page-name/ and works for anyone.",
    ],
    only_certain_people: {
      command: SHARE,
      how: "It asks who the page is for and prints one locked link per person (or pass --to alice --to bob). Send each person only their own link. To take someone out, share again without them; to take the page down, run pages remove <name>.",
      limits: "One self-contained .html page. The locked page is stored in the public repository; the key is in the link after # and is never stored. A person can forward their link.",
    },
    needs: "Node.js for npx. For an .html page, the GitHub CLI signed in (gh auth login). A single .md page can go out without signing in.",
    good_to_know: [
      "It is public: anyone can open the page and read its source. If only certain people should read it, use only_certain_people instead.",
      "Publishing the same name again adds a new version.",
      `Limits: ${LIMITS.files} files, ${LIMITS.fileBytes / 1048576} MB per file, ${LIMITS.totalBytes / 1048576} MB in all.`,
      "Pages cannot ask for passwords, ask for a crypto wallet, or load code from unknown sites.",
    ],
    site: SITE,
    published_by_this_tool: false,
  });
}

export async function pagesMcpRoute(request, json) {
  const cors = { "access-control-allow-origin": "*" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type, mcp-protocol-version" } });
  if (request.method !== "POST") return json({ error: "method_not_allowed", hint: "POST JSON-RPC 2.0 messages to /mcp" }, 405, { allow: "POST, OPTIONS" });
  let msg;
  try {
    msg = await request.json();
  } catch {
    return json(fail(null, -32700, "Parse error"), 400);
  }
  if (Array.isArray(msg) || !msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return json(fail(msg?.id, -32600, "Invalid Request"), 400);
  const { id, method, params } = msg;
  if (id === undefined) return new Response(null, { status: 202, headers: cors });
  if (method === "initialize") {
    return json(rpc(id, { protocolVersion: PROTOCOL, capabilities: { tools: {}, prompts: {} }, serverInfo: { name: "flisk-pages", version: "1.0.0" }, instructions: "check_page tells you what to fix before a page can go online. how_to_put_page_online gives the steps and the one command." }));
  }
  if (method === "ping") return json(rpc(id, {}));
  if (method === "tools/list") return json(rpc(id, { tools: TOOLS }));
  if (method === "prompts/list") return json(rpc(id, { prompts: PROMPTS }));
  if (method === "prompts/get") {
    const prompt = getPrompt(params?.name);
    if (!prompt) return json(fail(id, -32602, `Unknown prompt: ${params?.name}`));
    return json(rpc(id, prompt));
  }
  if (method === "tools/call") {
    if (params?.name === "check_page") return json(rpc(id, checkPage(params?.arguments)));
    if (params?.name === "how_to_put_page_online") return json(rpc(id, howTo()));
    return json(fail(id, -32602, `Unknown tool: ${params?.name}`));
  }
  return json(fail(id, -32601, `Method not found: ${method}`));
}
