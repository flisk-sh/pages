import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import { personId, shareStaged } from "./protect.mjs";

const stage = (files) => {
	const d = mkdtempSync(join(tmpdir(), "share-"));
	for (const [n, c] of Object.entries(files)) writeFileSync(join(d, n), c);
	return d;
};

const appended = [];

// Runs the shell's own decrypt code, the way a browser would.
async function open(html, id, key) {
	const code = html.match(/<script>([\s\S]*)<\/script>/)[1];
	let out = "";
	appended.length = 0;
	const g = { location: { hash: `#${id}.${key}`, pathname: "/@sam/for-bob/" }, document: { open() {}, write: (s) => { out = s; }, close() {}, getElementById: () => ({}), createElement: () => ({ setAttribute() {}, append() {}, style: {} }), body: { append(x) { appended.push(x); } } } };
	await new Function("location", "document", "crypto", "atob", "TextDecoder", "encodeURIComponent", `return ${code.trim().replace(/;$/, "")}`)(g.location, g.document, crypto, atob, TextDecoder, encodeURIComponent);
	return out;
}

test("each person's own link opens the page, the text is hidden", async () => {
	const d = stage({ "index.html": "<h1>secret interview</h1>" });
	const keys = shareStaged(d, ["Alice", "Bob K"]);
	const html = readFileSync(join(d, "index.html"), "utf8");
	assert.deepEqual(Object.keys(keys), ["alice", "bob-k"]);
	assert.ok(!html.includes("secret interview") && html.includes("noindex"));
	assert.equal(await open(html, "alice", keys.alice), "<h1>secret interview</h1>");
	assert.equal(await open(html, "bob-k", keys["bob-k"]), "<h1>secret interview</h1>");
});

test("one person's key does not open another's slot", async () => {
	const d = stage({ "index.html": "<p>x</p>" });
	const keys = shareStaged(d, ["alice", "bob"]);
	assert.equal(await open(readFileSync(join(d, "index.html"), "utf8"), "alice", keys.bob), "");
});

test("needs a person, one html page, and names become ids", () => {
	assert.throws(() => shareStaged(stage({ "index.html": "x" }), []), /Say who/);
	assert.throws(() => shareStaged(stage({ "index.md": "# x" }), ["a"]), /one self-contained/);
	assert.equal(personId(" Olena D. "), "olena-d");
});

test("a link naming a built-in property is refused, not looked up", async () => {
	const d = stage({ "index.html": "<p>x</p>" });
	shareStaged(d, ["alice"]);
	const html = readFileSync(join(d, "index.html"), "utf8");
	assert.ok(html.includes("Object.hasOwn(P,id)"));
	assert.equal(await open(html, "constructor", "AAAA"), "");
});

test("an opened shared page always carries the warning and report bar", async () => {
	const d = stage({ "index.html": "<p>x</p>" });
	const keys = shareStaged(d, ["alice"]);
	const html = readFileSync(join(d, "index.html"), "utf8");
	await open(html, "alice", keys.alice);
	assert.equal(appended.length, 1);
	assert.ok(html.includes("not checked by us") && html.includes("issues/new?template=report.yml"));
});

test("pages.mjs imports every helper the share path uses", () => {
	const src = readFileSync(join(import.meta.dirname, "pages.mjs"), "utf8");
	for (const name of ["shareStaged", "createInterface"]) {
		assert.match(src, new RegExp(`^import[^;]*\\b${name}\\b[^;]*from`, "m"), `${name} is used but not imported`);
	}
});
