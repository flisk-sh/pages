import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "../src/app";

const app = createApp({ publicUrl: "https://pages.test/", spaces: [] });
const get = (path: string) => app.request(path);

describe("the share page", () => {
	it("serves a page whose only script is same-origin and whose policy blocks everything else", async () => {
		const html = await (await get("/share")).text();
		expect(html).toContain("Make a private file");
		expect(html).toContain('src="/share.js"');
		expect(html).toContain("script-src 'self'");
		expect(html).not.toContain("script-src 'none'");
	});

	it("serves the sealing code and the page script from this site", async () => {
		for (const name of ["seal.js", "share.js"]) {
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
		const served = await (await get("/share.js")).text();
		expect(
			`sha384-${createHash("sha384").update(served).digest("base64")}`,
		).toBe(pinned as string);
		expect(html).toContain('crossorigin="anonymous"');
	});
});
