// The Share page: seals a page into one private file per person, in this browser. Nothing is uploaded.
import { normalize, sealPage } from "./seal.js";

const form = document.getElementById("f");
const out = document.getElementById("out");
const msg = document.getElementById("m");
const fmt = (p) => normalize(p).replace(/(.{4})(?=.)/g, "$1-");

form.addEventListener("submit", async (e) => {
	e.preventDefault();
	out.replaceChildren();
	const file = document.getElementById("page").files[0];
	const pasted = document.getElementById("paste").value;
	const names = [
		...new Set(
			document
				.getElementById("names")
				.value.split(/[,\n]/)
				.map((s) => s.trim())
				.filter(Boolean),
		),
	];
	if (names.length === 0) names.push("Recipient 1");
	if (!file && !pasted.trim()) {
		msg.textContent = "Choose a .html file or paste its HTML first.";
		return;
	}
	if (!globalThis.crypto?.subtle) {
		msg.textContent =
			"This browser cannot make private files. Use a current browser on https.";
		return;
	}
	msg.textContent = "Sealing in this browser…";
	const page = file
		? new Uint8Array(await file.arrayBuffer())
		: new TextEncoder().encode(pasted);
	for (const name of names) {
		const { html, passphrase } = await sealPage(page);
		const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
		const card = document.createElement("section");
		card.className = "card";
		card.innerHTML = `<h2></h2><p class="pass"></p><label><input type="checkbox"> I have saved this passphrase somewhere safe, and I will send it by a different channel than the file.</label><p><a class="btn" download="private-page.html">Download file</a></p>`;
		const fileObj = new File(
			[html],
			`private-${
				name
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, "-")
					.replace(/^-|-$/g, "") || "page"
			}.html`,
			{ type: "text/html" },
		);
		card.querySelector("h2").textContent = name;
		card.querySelector(".pass").textContent = fmt(passphrase);
		const link = card.querySelector("a");
		const box = card.querySelector("input");
		link.href = url;
		link.setAttribute("aria-disabled", "true");
		link.addEventListener("click", (ev) => {
			if (!box.checked) ev.preventDefault();
		});
		box.addEventListener("change", () =>
			link.setAttribute("aria-disabled", String(!box.checked)),
		);
		// Native share sheet (iPhone, iPad, Android) when the browser has it. The passphrase is not offered here: send it by another channel.
		if (navigator.canShare?.({ files: [fileObj] })) {
			const native = document.createElement("button");
			native.type = "button";
			native.textContent = "Share file";
			native.addEventListener("click", async () => {
				if (!box.checked) {
					msg.textContent = "Confirm you saved the passphrase first.";
					return;
				}
				try {
					await navigator.share({ files: [fileObj], title: "Private file" });
				} catch (err) {
					if (err?.name !== "AbortError")
						msg.textContent = "Sharing failed. Use Download file instead.";
				}
			});
			card.querySelector("p:last-of-type").append(" ", native);
		}
		out.append(card);
	}
	msg.textContent = "Done. The passphrase is shown once. Nothing was uploaded.";
});
