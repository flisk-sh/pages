// The one implementation of private files, used by the CLI (`pages share --send`) and by the Share button in the
// browser. It runs on WebCrypto, so it is the same code in Node, Bun and the page: nothing is uploaded anywhere.
// The file is AES-256-GCM ciphertext. The key comes from a random passphrase (about 80 bits) through 600,000 rounds of
// PBKDF2, so the file alone and the passphrase alone are both useless. No names, and the size is padded to 64 KB blocks.
// A copy that has been sent cannot be taken back, and the recipient can forward both parts.
export const ITERATIONS = 600000;
export const BLOCK = 65536;
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 characters, no 0 O 1 I L
const subtle = globalThis.crypto.subtle;
const random = (n) => {
	const out = new Uint8Array(n);
	for (let i = 0; i < n; i += 65536) globalThis.crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65536)));
	return out;
};
const b64 = (bytes) => {
	let s = "";
	for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(s);
};

/** 16 random characters from a 31 character alphabet (about 79 bits), shown as XXXX-XXXX-XXXX-XXXX. */
export function newPassphrase() {
	const chars = [];
	while (chars.length < 16)
		for (const byte of random(32)) if (byte < 248 && chars.length < 16) chars.push(ALPHABET[byte % 31]);
	return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-");
}

/** What the page and the CLI both do to a typed passphrase: letters and digits only, upper case. */
export const normalize = (text) => text.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** 4 byte length, the page, then random bytes up to the next block, so the size says little about the page. */
export function pad(page) {
	const total = Math.ceil((page.length + 4) / BLOCK) * BLOCK;
	const body = random(total);
	new DataView(body.buffer).setUint32(0, page.length);
	body.set(page, 4);
	return body;
}

/** Locks a page (bytes or text) under a fresh passphrase. Returns { html, passphrase }. */
export async function sealPage(page) {
	const bytes = typeof page === "string" ? new TextEncoder().encode(page) : page;
	const passphrase = newPassphrase();
	const salt = random(16);
	const iv = random(12);
	const base = await subtle.importKey("raw", new TextEncoder().encode(normalize(passphrase)), "PBKDF2", false, ["deriveKey"]);
	const key = await subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
	const data = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, key, pad(bytes)));
	return { html: shell(b64(salt), b64(iv), b64(data)), passphrase };
}

/** Random file names, so nothing in a name says who the file is for. */
export const randomName = () => `private-${[...random(4)].map((b) => b.toString(16).padStart(2, "0")).join("")}.html`;

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
