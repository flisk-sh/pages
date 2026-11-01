// The pages as a browser runs them: the real HTML the app serves, with its scripts executed in a DOM. Covers the bar
// (badge, tooltips, share) and the locked page from `pages share` through to the decrypted content, which unit tests on
// strings could not.
import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Window } from "happy-dom";
// @ts-expect-error plain .mjs without types
import { shareStaged } from "../../../../bin/protect.mjs";
import { createApp } from "../src/app";
import { readSpaces } from "../src/spaces";

const spaces = readSpaces(join(import.meta.dir, "fixtures", "spaces"));
const app = createApp({ publicUrl: "https://pages.test/", spaces });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function open(path: string, hash = "", clipboard?: Partial<Clipboard>) {
	const html = await (await app.request(path)).text();
	const window = new Window({
		url: `https://pages.test${path}${hash}`,
		settings: { enableJavaScriptEvaluation: true },
	});
	if (clipboard)
		Object.defineProperty(window.navigator, "clipboard", { value: clipboard });
	window.document.write(html);
	await wait(50);
	return window;
}

describe("the page bar in a browser", () => {
	it("shows a public badge, and every item explains itself", async () => {
		const w = await open("/@sam/gpu-explainer/");
		const bar = w.document.querySelector("[data-pages-bar]");
		expect(bar?.querySelector("span")?.textContent).toContain("public");
		const items = [...(bar?.querySelectorAll("[data-tip]") ?? [])];
		expect(items.length).toBe(8);
		for (const el of items)
			expect(el.getAttribute("data-tip")?.length).toBeGreaterThan(10);
		expect(
			[...(bar?.querySelectorAll("a") ?? [])].map((a) => a.textContent),
		).toEqual(expect.arrayContaining(["share", "private", "report", "source"]));
	});

	it("share copies the page address and says copied", async () => {
		const copied: string[] = [];
		const w = await open("/@sam/gpu-explainer/", "", {
			writeText: async (t: string) => void copied.push(t),
		});
		const share = [...w.document.querySelectorAll("[data-pages-bar] a")].find(
			(a) => a.textContent === "share",
		);
		share?.dispatchEvent(
			new w.MouseEvent("click", { bubbles: true, cancelable: true }),
		);
		await wait(50);
		expect(copied).toEqual(["https://pages.test/@sam/gpu-explainer/"]);
		expect(share?.textContent).toBe("copied");
	});

	it("share opens the email instead when the browser refuses the copy", async () => {
		const w = await open("/@sam/gpu-explainer/", "", {
			writeText: async () => Promise.reject(new Error("denied")),
		});
		const share = [...w.document.querySelectorAll("[data-pages-bar] a")].find(
			(a) => a.textContent === "share",
		);
		let nav = "";
		Object.defineProperty(w.location, "href", {
			configurable: true,
			get: () => "https://pages.test/",
			set: (v: string) => void (nav = v),
		});
		share?.dispatchEvent(
			new w.MouseEvent("click", { bubbles: true, cancelable: true }),
		);
		await wait(50);
		expect(nav).toStartWith("mailto:?subject=");
		expect(nav).toContain(
			encodeURIComponent("https://pages.test/@sam/gpu-explainer/"),
		);
	});
});

describe("a locked page in a browser", () => {
	const dir = mkdtempSync(join(tmpdir(), "locked-"));
	writeFileSync(
		join(dir, "index.html"),
		"<!doctype html><title>t</title><h1>owner secret</h1>",
	);
	const keys = shareStaged(dir, ["bob"]);
	const shell = readFileSync(join(dir, "index.html"), "utf8");

	async function visit(hash: string) {
		const window = new Window({
			url: `https://pages.test/@sam/for-bob/${hash}`,
			settings: { enableJavaScriptEvaluation: true },
		});
		window.document.write(shell);
		await wait(150);
		return window;
	}

	it("shows the content, a warning and a report link with the right key", async () => {
		const w = await visit(`#bob.${keys.bob}`);
		expect(w.document.body.textContent).toContain("owner secret");
		expect(w.document.body.textContent).toContain("not checked by us");
		expect(
			w.document
				.querySelector('a[href*="template=report.yml"]')
				?.getAttribute("href"),
		).toContain(encodeURIComponent("@sam/for-bob"));
	});

	it("shows only a notice without the key or with the wrong one", async () => {
		for (const hash of [
			"",
			"#bob",
			"#bob.AAAA",
			"#alice.x",
			"#constructor.x",
		]) {
			const w = await visit(hash);
			expect(w.document.body.textContent).not.toContain("owner secret");
		}
		expect((await visit("")).document.body.textContent).toContain(
			"Open the whole link",
		);
		expect((await visit("#bob.AAAA")).document.body.textContent).toContain(
			"not for you",
		);
	});

	it("the served locked page is badged private and stays out of the lists", async () => {
		const w = await open("/@sam/for-bob/");
		expect(
			w.document.querySelector("[data-pages-bar] span")?.textContent,
		).toContain("private");
		expect(await (await app.request("/")).text()).not.toContain("for-bob");
	});
});
