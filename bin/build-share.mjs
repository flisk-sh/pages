// Builds one offline file: the Share page with its sealing code inlined. No network, no other files. Prints the SHA-256
// so anyone can check the file they have matches this release. Run: node bin/build-share.mjs [out.html]
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..", "services", "app", "web", "static");
const seal = readFileSync(join(here, "seal.js"), "utf8");
const share = readFileSync(join(web, "share.js"), "utf8").replace(/^import .*\n/m, "");
const code = `${seal}\n${share}`.replaceAll("</script", "<\\/script");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; connect-src 'none'">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Make a private file</title>
<style>body{font:16px/1.6 system-ui,sans-serif;margin:0;background:#fbfaf7;color:#141413}main{max-width:44rem;margin:0 auto;padding:24px 16px}label{display:block;margin:12px 0}input,textarea,button,.btn{font:inherit;padding:8px 12px;border-radius:6px;border:1px solid #d6d0c3;background:#fff;width:100%;box-sizing:border-box}button,.btn{background:#141413;color:#fbfaf7;cursor:pointer;display:inline-block;width:auto;text-decoration:none}.card{border:1px solid #e7e2d8;border-radius:8px;padding:12px 16px;margin:12px 0;background:#fff}.pass{font:600 1.2rem ui-monospace,monospace;letter-spacing:.05em}a[aria-disabled="true"]{opacity:.45;pointer-events:none}.muted{color:#66625b}</style></head>
<body><main><h1>Make a private file</h1>
<p class="muted">This file works offline. It sends nothing anywhere. Choose a page and the people it is for; you get one file and one passphrase per person. Send the file and the passphrase by different channels.</p>
<form id="f"><label>Page (.html) <input id="page" type="file" accept=".html,text/html" required></label>
<label>Names, one per line or separated by commas <textarea id="names" rows="3" required></textarea></label>
<button type="submit">Make private files</button></form>
<p id="m" role="status"></p><div id="out"></div>
<p class="muted">Check this file: its SHA-256 should match the one published with the release.</p>
</main>
<script type="module">
${code}
</script></body></html>
`;

const out = process.argv[2] ?? join(here, "..", "dist", "pages-share-offline.html");
writeFileSync(out, html);
console.log(`${out}\nsha256 ${createHash("sha256").update(html).digest("hex")}`);
