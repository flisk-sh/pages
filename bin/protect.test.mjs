import assert from "node:assert/strict";
import { createDecipheriv } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { protectStaged } from "./protect.mjs";

const stage = (files) => {
	const d = mkdtempSync(join(tmpdir(), "protect-"));
	for (const [n, c] of Object.entries(files)) writeFileSync(join(d, n), c);
	return d;
};

test("encrypts index.html, hides the text, and the key decrypts it", () => {
	const d = stage({ "index.html": "<h1>secret interview</h1>" });
	const key = protectStaged(d);
	const out = readFileSync(join(d, "index.html"), "utf8");
	assert.ok(!out.includes("secret interview"));
	assert.ok(out.includes("noindex"));
	const iv = Buffer.from(out.match(/iv:u\("([^"]+)"\)/)[1], "base64");
	const all = Buffer.from(out.match(/iv:u\("[^"]+"\)\},key,u\("([^"]+)"\)/)[1], "base64");
	const dec = createDecipheriv("aes-256-gcm", Buffer.from(key, "base64url"), iv);
	dec.setAuthTag(all.subarray(-16));
	assert.equal(Buffer.concat([dec.update(all.subarray(0, -16)), dec.final()]).toString(), "<h1>secret interview</h1>");
});

test("refuses Markdown and multi-file pages", () => {
	assert.throws(() => protectStaged(stage({ "index.md": "# x" })), /one self-contained/);
	assert.throws(() => protectStaged(stage({ "index.html": "x", "a.css": "y" })), /one self-contained/);
});
