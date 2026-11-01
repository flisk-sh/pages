import assert from "node:assert/strict";
import { createDecipheriv, pbkdf2Sync } from "node:crypto";
import { test } from "bun:test";
import { BLOCK, ITERATIONS, newPassphrase, normalize, pad, randomName, sealFile } from "./send.mjs";

const parts = (html) => ({
	salt: Buffer.from(html.match(/const S="([^"]+)"/)[1], "base64"),
	iv: Buffer.from(html.match(/I="([^"]+)"/)[1], "base64"),
	data: Buffer.from(html.match(/D="([^"]+)"/)[1], "base64"),
});
function open(html, passphrase) {
	const { salt, iv, data } = parts(html);
	const key = pbkdf2Sync(normalize(passphrase), salt, ITERATIONS, 32, "sha256");
	const d = createDecipheriv("aes-256-gcm", key, iv);
	d.setAuthTag(data.subarray(-16));
	const all = Buffer.concat([d.update(data.subarray(0, -16)), d.final()]);
	return all.subarray(4, 4 + all.readUInt32BE(0)).toString();
}

test("the file opens with its passphrase, written with or without dashes and in any case", async () => {
	const { html, passphrase } = await sealFile(Buffer.from("<h1>owner secret</h1>"));
	assert.equal(open(html, passphrase), "<h1>owner secret</h1>");
	assert.equal(open(html, passphrase.replaceAll("-", "").toLowerCase()), "<h1>owner secret</h1>");
	assert.throws(() => open(html, "AAAA-AAAA-AAAA-AAAA"));
});

test("the file never contains the page, the passphrase or any name", async () => {
	const { html, passphrase } = await sealFile(Buffer.from("<h1>owner secret</h1>"));
	for (const leak of ["owner secret", passphrase, normalize(passphrase), "alice"]) assert.ok(!html.includes(leak));
	assert.ok(html.includes("noindex"));
});

test("two files for the same page share nothing, and sizes fall in blocks", async () => {
	const page = Buffer.from("<p>same</p>");
	const a = await sealFile(page);
	const b = await sealFile(page);
	assert.notEqual(a.passphrase, b.passphrase);
	assert.notDeepEqual(parts(a.html).data, parts(b.html).data);
	assert.equal(parts(a.html).data.length, BLOCK + 16);
	assert.equal(parts((await sealFile(Buffer.alloc(BLOCK))).html).data.length, 2 * BLOCK + 16);
	assert.equal(pad(Buffer.from("x")).length % BLOCK, 0);
});

test("passphrases are 4x4 from an unambiguous alphabet; file names are random", async () => {
	assert.match(newPassphrase(), /^[A-HJKMNP-Z2-9]{4}(-[A-HJKMNP-Z2-9]{4}){3}$/);
	assert.notEqual(randomName(), randomName());
	assert.match(randomName(), /^private-[0-9a-f]{8}\.html$/);
});
