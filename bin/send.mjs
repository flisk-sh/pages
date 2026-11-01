// Private pages that are never hosted. `pages share <page.html> --send` writes one self-decrypting .html file per person.
// Nothing goes to GitHub, to pages.flisk.si or to any server: you send the file by email or Signal and the passphrase by
// another channel. The file holds only ciphertext (AES-256-GCM), no names, and is padded to a fixed block size. The key
// comes from a random passphrase (80 bits) through 600,000 rounds of PBKDF2, so the file alone and the passphrase alone
// are both useless. The recipient can forward both; a copy you have sent cannot be taken back.
import { createCipheriv, pbkdf2Sync, randomBytes, randomInt } from "node:crypto";

export const ITERATIONS = 600000;
export const BLOCK = 65536;
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0 O 1 I L
const b64 = (buf) => Buffer.from(buf).toString("base64");

/** 16 random characters from a 31 character alphabet (about 79 bits), shown as XXXX-XXXX-XXXX-XXXX. */
export function newPassphrase() {
	const chars = Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]);
	return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-");
}

/** What the page and the CLI both do to a typed passphrase: letters and digits only, upper case. */
export const normalize = (text) => text.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** 4 byte length, the page, then random bytes up to the next block, so the size says little about the page. */
export function pad(page) {
	const body = Buffer.concat([Buffer.alloc(4), page]);
	body.writeUInt32BE(page.length, 0);
	const total = Math.ceil(body.length / BLOCK) * BLOCK;
	return Buffer.concat([body, randomBytes(total - body.length)]);
}

/** Locks the page under a fresh passphrase. Returns { html, passphrase }. */
export function sealFile(page) {
	const passphrase = newPassphrase();
	const salt = randomBytes(16);
	const iv = randomBytes(12);
	const key = pbkdf2Sync(normalize(passphrase), salt, ITERATIONS, 32, "sha256");
	const c = createCipheriv("aes-256-gcm", key, iv);
	const data = Buffer.concat([c.update(pad(page)), c.final(), c.getAuthTag()]);
	return { html: shell(b64(salt), b64(iv), b64(data)), passphrase };
}

/** Random file names, so nothing in a name says who the file is for. */
export const randomName = () => `private-${randomBytes(4).toString("hex")}.html`;

function shell(salt, iv, data) {
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Private page</title>
<style>body{font:16px/1.6 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#14141a;color:#ececf1}main{max-width:26rem;padding:16px;text-align:center}input,button{font:inherit;padding:8px 12px;border-radius:6px;border:1px solid #2c2c36;background:#1c1c24;color:#ececf1;width:100%;box-sizing:border-box;margin:6px 0}button{background:#ececf1;color:#14141a;cursor:pointer}#m{color:#a4a4b0;min-height:1.6em}</style></head>
<body><main><h1 style="font-size:1.2rem">Private page</h1>
<p>This file is encrypted. Enter the passphrase you were sent separately.</p>
<form id="f"><input id="p" autocomplete="off" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX" aria-label="Passphrase"><button id="b" type="submit">Open</button></form>
<p id="m"></p></main>
<script>
const S="${salt}",I="${iv}",D="${data}";
const u=(s)=>Uint8Array.from(atob(s),(c)=>c.charCodeAt(0));
document.getElementById("f").addEventListener("submit",async(e)=>{
e.preventDefault();
const m=document.getElementById("m");
const pass=document.getElementById("p").value.toUpperCase().replace(/[^A-Z0-9]/g,"");
if(!pass){m.textContent="Enter the passphrase.";return}
m.textContent="Opening…";
try{
const base=await crypto.subtle.importKey("raw",new TextEncoder().encode(pass),"PBKDF2",false,["deriveKey"]);
const key=await crypto.subtle.deriveKey({name:"PBKDF2",salt:u(S),iterations:${ITERATIONS},hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["decrypt"]);
const all=new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:u(I)},key,u(D)));
const len=new DataView(all.buffer).getUint32(0);
const html=new TextDecoder().decode(all.slice(4,4+len));
document.open();document.write(html);document.close();
}catch{m.textContent="That passphrase does not open this file."}
});
</script></body></html>
`;
}
