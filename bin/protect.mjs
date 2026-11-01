// Share: the page is locked before it is published, and every person gets their own link. The key is in the link's
// #fragment, which a browser never sends to a server, so the repository and the site only hold the locked page.
// Static files only: nothing to run, nothing to scale. Take one person out by sharing again without their name.
import { createCipheriv, randomBytes } from "node:crypto";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const b64 = (buf) => Buffer.from(buf).toString("base64");

function seal(key, plain) {
	const iv = randomBytes(12);
	const c = createCipheriv("aes-256-gcm", key, iv);
	return { iv: b64(iv), data: b64(Buffer.concat([c.update(plain), c.final(), c.getAuthTag()])) };
}

/** A name that goes in a link: lowercase letters, digits, dashes. */
export function personId(name) {
	return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Locks the staged folder's index.html for each person. Returns { id: key }, one link each: `#id.key`. */
export function shareStaged(dir, names) {
	const ids = [...new Set(names.map(personId).filter(Boolean))];
	if (!ids.length) throw new Error("Say who it is for: --to alice --to bob.");
	const files = readdirSync(dir);
	if (files.length !== 1 || files[0] !== "index.html")
		throw new Error("share takes one self-contained .html page (no other files, no Markdown).");
	const content = randomBytes(32);
	const page = seal(content, readFileSync(join(dir, "index.html")));
	const keys = {};
	const people = {};
	for (const id of ids) {
		keys[id] = randomBytes(32);
		people[id] = seal(keys[id], content);
	}
	rmSync(join(dir, "index.html"));
	writeFileSync(join(dir, "index.html"), shell(page, people));
	return Object.fromEntries(ids.map((id) => [id, keys[id].toString("base64url")]));
}

function shell(page, people) {
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Shared page</title>
<style>body{font:16px/1.6 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#14141a;color:#ececf1}p{max-width:30rem;padding:16px;text-align:center}</style></head>
<body><p id="m">This page is shared with certain people. Open the whole link you were given.</p>
<script>
(async()=>{
const [id,k]=location.hash.slice(1).split(".");if(!k)return;
const P=${JSON.stringify(people)},C=${JSON.stringify(page)};
const u=(s)=>Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")),(c)=>c.charCodeAt(0));
const open=async(key,o)=>crypto.subtle.decrypt({name:"AES-GCM",iv:u(o.iv)},await crypto.subtle.importKey("raw",key,"AES-GCM",false,["decrypt"]),u(o.data));
try{
const content=new Uint8Array(await open(u(k),P[id]));
const html=await open(content,C);
document.open();document.write(new TextDecoder().decode(html));document.close();
}catch{document.getElementById("m").textContent="This link is not for you, or it was taken back. Ask for a new one."}
})();
</script></body></html>
`;
}
