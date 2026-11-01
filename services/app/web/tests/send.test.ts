// A file from `pages share --send`, opened the way a recipient does: the form, the passphrase, the decrypted page.
import { describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
// @ts-expect-error plain .mjs without types
import { sealFile } from "../../../../bin/send.mjs";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function openWith(html: string, passphrase: string) {
	const w = new Window({
		url: "file:///tmp/private-ab12cd34.html",
		settings: { enableJavaScriptEvaluation: true },
	});
	w.document.write(html);
	await wait(50);
	(w.document.getElementById("p") as unknown as HTMLInputElement).value =
		passphrase;
	w.document
		.getElementById("f")
		?.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
	await wait(2500);
	return w;
}

describe("a private file in a browser", () => {
	const { html, passphrase } = sealFile(
		Buffer.from("<!doctype html><title>t</title><h1>owner secret</h1>"),
	);

	it("asks for a passphrase and shows nothing of the page before it", () => {
		const w = new Window({ settings: { enableJavaScriptEvaluation: true } });
		w.document.write(html);
		expect(w.document.getElementById("p")).not.toBeNull();
		expect(w.document.body.textContent).not.toContain("owner secret");
	});

	it("opens with the right passphrase, typed with or without dashes", async () => {
		for (const typed of [
			passphrase,
			passphrase.replaceAll("-", "").toLowerCase(),
		])
			expect((await openWith(html, typed)).document.body.textContent).toContain(
				"owner secret",
			);
	}, 30000);

	it("says so and shows nothing with a wrong or empty passphrase", async () => {
		const wrong = await openWith(html, "AAAA-AAAA-AAAA-AAAA");
		expect(wrong.document.body.textContent).toContain(
			"does not open this file",
		);
		expect(wrong.document.body.textContent).not.toContain("owner secret");
		expect((await openWith(html, "")).document.body.textContent).toContain(
			"Enter the passphrase",
		);
	}, 30000);
});
