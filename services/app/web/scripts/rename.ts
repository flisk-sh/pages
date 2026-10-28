// Makes the template yours: the product name, its domain and its GitHub repository, everywhere they appear.
//   bun run rename --name "Acme" --domain acme.example.com --repo you/acme
// Then edit the tagline, description and FAQ in src/site.ts, replace src/contrast.ts with your tool, change
// brand/*.svg and run `bun run icons`.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
	options: {
		name: { type: "string" },
		domain: { type: "string" },
		repo: { type: "string" },
	},
});
const { name, domain, repo } = values;
if (!name || !domain || !/^[\w.-]+\/[\w.-]+$/.test(repo ?? "")) {
	console.error(
		'Usage: bun run rename --name "Acme" --domain acme.example.com --repo you/acme',
	);
	process.exit(1);
}
const slug = (repo as string).split("/")[1];

const FROM = {
	name: "Contrast",
	domain: "your-tool.example.com",
	repo: "flisk-sh/flisk-template-launch",
	slug: "flisk-template-launch",
};

const root = new URL("../../../../", import.meta.url).pathname;
/** Each file with the replacements it gets, in order: the full repository before its last part alone. */
const FILES: Record<string, [string, string][]> = {
	"services/app/web/src/site.ts": [
		[`name: "${FROM.name}"`, `name: ${JSON.stringify(name)}`],
		[FROM.domain, domain],
		[FROM.repo, repo as string],
	],
	"services/app/web/brand/og.svg": [
		[`>${FROM.name}<`, `>${name}<`],
		[`aria-label="${FROM.name}`, `aria-label="${name}`],
		[FROM.domain, domain],
	],
	"services/app/web/brand/icon.svg": [
		[`>${FROM.name}<`, `>${name}<`],
		[`aria-label="${FROM.name}`, `aria-label="${name}`],
	],
	"services/app/web/brand/icon-full.svg": [
		[`>${FROM.name}<`, `>${name}<`],
		[`aria-label="${FROM.name}`, `aria-label="${name}`],
	],
	"render.yaml": [
		["    # domains:\n    #   - ", "    domains:\n      - "],
		[FROM.domain, domain],
		[FROM.repo, repo as string],
		[FROM.slug, slug],
	],
	"DEPLOY.md": [
		[FROM.domain, domain],
		[FROM.repo, repo as string],
		[FROM.slug, slug],
	],
	".flisk/project.json": [[`"name": "${FROM.slug}"`, `"name": "${slug}"`]],
	"package.json": [[`"name": "${FROM.slug}"`, `"name": "${slug}"`]],
	"bun.lock": [[`"name": "${FROM.slug}"`, `"name": "${slug}"`]],
};

for (const [file, swaps] of Object.entries(FILES)) {
	const path = join(root, file);
	if (!existsSync(path)) continue;
	let text = readFileSync(path, "utf8");
	for (const [from, to] of swaps) text = text.replaceAll(from, to);
	writeFileSync(path, text);
	console.log(`updated ${file}`);
}
console.log(
	"\nNext: edit tagline, description and faq in src/site.ts, swap src/contrast.ts for your tool, then `bun run icons`.",
);
