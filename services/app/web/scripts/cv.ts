// Builds a developer CV folder from roadmap ratings, the same page one-click publishing makes:
//   bun scripts/cv.ts --me "bun3,helm2" --name "Sam" --out ./cv [--data assets/data.json] [--logos assets/logos]
//                     [--portfolio URL] [--radar URL] [--github URL] [--url PUBLIC_ADDRESS]
// --me may also be a file holding the ratings. --data and --logos default to roadmap.flisk.si.
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { cvPage, ME_PATTERN, parseMe, type RoadmapData } from "../src/cv";

const ROADMAP = "https://roadmap.flisk.si";
const arg = (name: string, fallback = "") => {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};
const meArg = arg("me");
const me = existsSync(meArg) ? readFileSync(meArg, "utf8").trim() : meArg;
if (!ME_PATTERN.test(me))
	throw new Error("--me must look like bun3,helm2,k9s1");
const out = resolve(arg("out", "cv"));
const dataArg = arg("data");
const data = (
	dataArg
		? JSON.parse(readFileSync(dataArg, "utf8"))
		: await (await fetch(`${ROADMAP}/assets/data.json`)).json()
) as RoadmapData;
const q = new URLSearchParams({ me });
if (arg("name")) q.set("name", arg("name"));
const { html, logos } = cvPage(data, parseMe(me), arg("name"), {
	portfolio: arg("portfolio", `${ROADMAP}/portfolio/?${q}`),
	radar: arg("radar", `${ROADMAP}/radar/?${q}`),
	github: arg("github") || undefined,
	url: arg("url") || undefined,
});
mkdirSync(join(out, "logos"), { recursive: true });
writeFileSync(join(out, "index.html"), html);
for (const file of logos) {
	const local = arg("logos");
	if (local) copyFileSync(join(local, file), join(out, "logos", file));
	else
		writeFileSync(
			join(out, "logos", file),
			new Uint8Array(
				await (await fetch(`${ROADMAP}/assets/logos/${file}`)).arrayBuffer(),
			),
		);
}
console.log(`wrote ${out}: index.html and ${logos.length} logos`);
