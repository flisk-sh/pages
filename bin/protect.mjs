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
<style>body[data-pages-shared]{font:16px/1.6 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#14141a;color:#ececf1}#m{max-width:26rem;margin:16px;padding:28px 24px 24px;text-align:center;border:1px solid #2c2c36;border-radius:14px;background:#1c1c24;box-shadow:0 8px 30px rgba(0,0,0,.35)}#m::before{content:"";display:block;width:40px;height:40px;margin:0 auto 14px;border-radius:50%;background:#26262f url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%23a4a4b0' stroke-width='1.4'%3E%3Crect x='3' y='7' width='10' height='7' rx='1.5'/%3E%3Cpath d='M5 7V5a3 3 0 0 1 6 0v2'/%3E%3C/svg%3E") center/18px no-repeat}</style></head>
<body data-pages-shared><p id="m">This page is shared with certain people. Open the whole link you were given.</p>
<script>
(async()=>{
const [id,k]=location.hash.slice(1).split(".");if(!k)return;
const P=${JSON.stringify(people)},C=${JSON.stringify(page)};
const u=(s)=>Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")),(c)=>c.charCodeAt(0));
const open=async(key,o)=>crypto.subtle.decrypt({name:"AES-GCM",iv:u(o.iv)},await crypto.subtle.importKey("raw",key,"AES-GCM",false,["decrypt"]),u(o.data));
try{
if(!Object.hasOwn(P,id))throw 0;
const content=new Uint8Array(await open(u(k),P[id]));
const html=await open(content,C);
if(document.readyState==="loading")await new Promise((r)=>addEventListener("DOMContentLoaded",r,{once:true}));
const pb=document.querySelector("[data-pages-bar]")?.outerHTML??"";
document.open();document.write(new TextDecoder().decode(html));document.close();
if(pb)document.body.insertAdjacentHTML("beforeend",pb);
const m=location.pathname.match(/^\\/(@[a-z0-9-]+)\\/([a-z0-9-]+)\\//);
const bar=document.createElement("div");
bar.setAttribute("style","position:relative;z-index:2147483647;margin:0;font:12px/1.4 system-ui,sans-serif;background:#141413;color:#fbfaf7;padding:6px 12px;text-align:center");
bar.append("Shared privately on pages.flisk.si and not checked by us. Do not enter passwords or payments. ");
const a=document.createElement("a");a.textContent="Report";a.style.color="#7aa2ff";
a.href="https://github.com/flisk-sh/pages/issues/new?template=report.yml&title="+encodeURIComponent("Report: "+(m?m[1]+"/"+m[2]:location.pathname));
bar.append(a);document.body.prepend(bar);
}catch{document.getElementById("m").textContent="This link is not for you, or it was taken back. Ask for a new one."}
})();
</script></body></html>
`;
}
