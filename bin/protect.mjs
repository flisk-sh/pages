// Protected pages: the page is encrypted before it is published, and the key rides in the link's #fragment, which a
// browser never sends to a server. The repository and the site hold only ciphertext, so the page stays static (no
// server, no accounts, nothing to scale) and only someone given the full link can read it.
import { createCipheriv, randomBytes } from "node:crypto";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const b64 = (buf) => Buffer.from(buf).toString("base64");

/** Replaces the staged folder's single index.html with an encrypted shell. Returns the key to put after `#`. */
export function protectStaged(dir) {
	const files = readdirSync(dir);
	if (files.length !== 1 || files[0] !== "index.html")
		throw new Error("--protected takes one self-contained .html page (no other files, no Markdown).");
	const key = randomBytes(32);
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const body = Buffer.concat([cipher.update(readFileSync(join(dir, "index.html"))), cipher.final(), cipher.getAuthTag()]);
	rmSync(join(dir, "index.html"));
	writeFileSync(join(dir, "index.html"), shell(b64(iv), b64(body)));
	return key.toString("base64url");
}

function shell(iv, data) {
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Protected page</title>
<style>body{font:16px/1.6 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#14141a;color:#ececf1}p{max-width:30rem;padding:16px;text-align:center}</style></head>
<body><p id="m">Protected page. Open the full link you were given, the part after # is the key.</p>
<script>
(async()=>{
const k=location.hash.slice(1);if(!k)return;
const u=(s)=>Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")),(c)=>c.charCodeAt(0));
try{
const key=await crypto.subtle.importKey("raw",u(k),"AES-GCM",false,["decrypt"]);
const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:u("${iv}")},key,u("${data}"));
document.open();document.write(new TextDecoder().decode(plain));document.close();
}catch{document.getElementById("m").textContent="Wrong or damaged key. Ask for the full link again."}
})();
</script></body></html>
`;
}
