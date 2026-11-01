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
	const names = [
		...new Set(
			document
				.getElementById("names")
				.value.split(/[,\n]/)
				.map((s) => s.trim())
				.filter(Boolean),
		),
	];
	if (!file || !names.length) {
		msg.textContent = "Choose one .html page and at least one name.";
		return;
	}
	if (!globalThis.crypto?.subtle) {
		msg.textContent =
			"This browser cannot make private files. Use a current browser on https.";
		return;
	}
	msg.textContent = "Sealing in this browser…";
	const page = new Uint8Array(await file.arrayBuffer());
	for (const name of names) {
		const { html, passphrase } = await sealPage(page);
		const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
		const card = document.createElement("section");
		card.className = "card";
		card.innerHTML = `<h2></h2><p class="pass"></p><label><input type="checkbox"> I have saved this passphrase somewhere safe, and I will send it by a different channel than the file.</label><p><a class="btn" download="private-page.html">Download file</a></p>`;
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
		out.append(card);
	}
	msg.textContent = "Done. The passphrase is shown once. Nothing was uploaded.";
});
