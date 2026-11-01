import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, SHARE_JS_PATH } from "../src/app";

const app = createApp({ publicUrl: "https://pages.test/", spaces: [] });
const get = (path: string) => app.request(path);

describe("the share page", () => {
	it("serves a page whose only script is same-origin and whose policy blocks everything else", async () => {
		const html = await (await get("/share")).text();
		expect(html).toContain("Make a private file");
		expect(html).toMatch(/src="\/share-[0-9a-f]{12}\.js"/);
		expect(html).toContain("script-src 'self'");
		expect(html).not.toContain("script-src 'none'");
	});

	it("serves the sealing code and the page script from this site", async () => {
		for (const name of ["seal.js", SHARE_JS_PATH.slice(1)]) {
			const res = await get(`/${name}`);
			expect(res.status).toBe(200);
			expect(res.headers.get("content-type")).toContain("javascript");
		}
	});

	it("ships the same sealing code the CLI uses, so the two cannot drift", () => {
		const served = readFileSync(
			join(import.meta.dir, "..", "static", "seal.js"),
			"utf8",
		);
		const cli = readFileSync(
			join(import.meta.dir, "..", "..", "..", "..", "bin", "seal.js"),
			"utf8",
		);
		expect(served).toBe(cli);
	});
});

describe("the share page's integrity pin", () => {
	it("pins the exact bytes of the script it serves", async () => {
		const html = await (await get("/share")).text();
		const pinned = html.match(/integrity="(sha384-[^"]+)"/)?.[1];
		expect(pinned).toBeDefined();
		const served = await (await get(SHARE_JS_PATH)).text();
		expect(
			`sha384-${createHash("sha384").update(served).digest("base64")}`,
		).toBe(pinned as string);
		expect(html).toContain('crossorigin="anonymous"');
	});
});

describe("the native share button", () => {
	it("is written only when the browser can share files, and never offers the passphrase", async () => {
		const js = await (await get(SHARE_JS_PATH)).text();
		expect(js).toContain("navigator.canShare?.(");
		expect(js).toContain("navigator.share({ files: [fileObj]");
		expect(js).toContain("Confirm you saved the passphrase first.");
		expect(js).not.toMatch(/navigator\.share\(\{[^}]*passphrase/);
	});
});

describe("pasting instead of a file", () => {
	it("the page has a paste box and the script accepts either a file or pasted HTML", async () => {
		const html = await (await get("/share")).text();
		expect(html).toContain('id="paste"');
		const js = await (await get(SHARE_JS_PATH)).text();
		expect(js).toContain('document.getElementById("paste").value');
		expect(js).toContain("new TextEncoder().encode(pasted)");
	});
});

describe("names are optional", () => {
	it("one file is made when no names are typed", async () => {
		const js = await (await get(SHARE_JS_PATH)).text();
		expect(js).toContain('"Recipient 1"');
	});
});
