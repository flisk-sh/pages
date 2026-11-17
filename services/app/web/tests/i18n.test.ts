import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { createApp } from "../src/app";
import {
	COPY,
	DETECT,
	DETECT_HASH,
	LANGS,
	langPath,
	pickLang,
} from "../src/i18n";
import { readSpaces } from "../src/spaces";

const spaces = readSpaces(join(import.meta.dir, "fixtures", "spaces"), {
	"sam/gpu-explainer": {
		sha: "a1",
		updated: "2026-10-27T10:00:00Z",
		versions: 3,
	},
	"sam/notes": { sha: "b2", updated: "2026-10-26T10:00:00Z", versions: 1 },
});
const app = createApp({
	publicUrl: "https://tool.test/",
	builtAt: new Date("2026-10-28"),
	spaces,
});
const page = async (path: string) => (await app.request(path)).text();
const DEVANAGARI = /[ऀ-ॿ]/;

/** Every string in a value, with the path to it; functions are called with markers so their text counts too. */
function strings(value: unknown, at = ""): [string, string][] {
	if (typeof value === "string") return [[at, value]];
	if (typeof value === "function")
		return strings(
			(value as (...a: unknown[]) => unknown)("X", "X", "X", "X", "X"),
			at,
		);
	if (Array.isArray(value))
		return value.flatMap((v, i) => strings(v, `${at}[${i}]`));
	if (value && typeof value === "object")
		return Object.entries(value).flatMap(([k, v]) => strings(v, `${at}.${k}`));
	return [];
}
const shape = (value: unknown, at = ""): string[] => {
	if (typeof value === "function") return [`${at}()`];
	if (Array.isArray(value))
		return [
			`${at}[${value.length}]`,
			...value.flatMap((v, i) => shape(v, `${at}[${i}]`)),
		];
	if (value && typeof value === "object")
		return Object.entries(value).flatMap(([k, v]) => shape(v, `${at}.${k}`));
	return [at];
};

describe("the copy", () => {
	it("has every string in every language", () => {
		for (const lang of LANGS) expect(shape(COPY[lang])).toEqual(shape(COPY.en));
		for (const lang of LANGS)
			for (const [at, text] of strings(COPY[lang]))
				expect(text.trim(), `${lang}${at}`).not.toBe("");
	});

	it("has a real translation: the same keys, but not the English text", () => {
		// Names, commands and loanwords that stay as they are in every language.
		const same = new Set([".videoTrackLabel"]);
		const en = new Map(strings(COPY.en));
		for (const [at, text] of strings(COPY.hi)) {
			if (same.has(at)) continue;
			expect(text, `hi${at}`).not.toBe(en.get(at));
		}
	});

	it("writes Hindi in Devanagari, with its descriptions at a length search shows whole", () => {
		for (const [at, text] of strings(COPY.hi)) {
			if (/^\.(videoTrackLabel)$/.test(at)) continue;
			expect(DEVANAGARI.test(text), `hi${at}: ${text}`).toBe(true);
		}
		expect(COPY.hi.description.length).toBeLessThanOrEqual(200);
		expect(COPY.hi.faq).toHaveLength(COPY.en.faq.length);
	});

	it("keeps the brand and the commands in every language's FAQ", () => {
		for (const lang of LANGS) {
			const all = COPY[lang].faq.map((f) => f.a).join(" ");
			expect(all).toContain("claude plugin install pages@flisk-pages");
			expect(all).toContain("node bin/pages.mjs publish ./folder --slug name");
			expect(all).toContain("pages.flisk.si/@you/name");
		}
	});
});

describe("pickLang", () => {
	it("reads Accept-Language and navigator.languages", () => {
		expect(pickLang("hi")).toBe("hi");
		expect(pickLang("hi-IN,en;q=0.8")).toBe("hi");
		expect(pickLang("HI-in")).toBe("hi");
		expect(pickLang("en-US,en;q=0.9,hi;q=0.5")).toBe("en");
		expect(pickLang("de,hi;q=0.7,en;q=0.5")).toBe("hi");
		expect(pickLang("en;q=0.5,hi;q=0.9")).toBe("hi");
		expect(pickLang("hi;q=0,en")).toBe("en");
		expect(pickLang("de,fr")).toBe("en");
		expect(pickLang("")).toBe("en");
		expect(pickLang(undefined)).toBe("en");
		expect(pickLang(["hi-IN", "en"])).toBe("hi");
		expect(pickLang(["en-GB", "hi"])).toBe("en");
	});
});

/** Runs the inline script with a fake browser and says where it sent the reader, and what it stored. */
function run(opts: {
	languages: string[];
	search?: string;
	stored?: string;
	storage?: boolean;
	hash?: string;
}) {
	const store: Record<string, string> = opts.stored
		? { "pages-lang": opts.stored }
		: {};
	let moved: string | undefined;
	let cleaned: string | undefined;
	let click: ((e: unknown) => void) | undefined;
	const location = {
		search: opts.search ?? "",
		hash: opts.hash ?? "",
		pathname: "/about",
		replace: (u: string) => {
			moved = u;
		},
	};
	const localStorage =
		opts.storage === false
			? undefined
			: {
					getItem: (k: string) => store[k] ?? null,
					setItem: (k: string, v: string) => {
						store[k] = v;
					},
				};
	const document = {
		querySelector: () => ({ href: "https://tool.test/hi/about" }),
		addEventListener: (_: string, f: (e: unknown) => void) => {
			click = f;
		},
	};
	const run = new Function(
		"URL",
		"location",
		"localStorage",
		"navigator",
		"document",
		"history",
		DETECT,
	);
	run(
		URL,
		location,
		opts.storage === false ? undefined : localStorage,
		{ languages: opts.languages, language: opts.languages[0] },
		document,
		{ replaceState: (_a: unknown, _b: unknown, u: string) => (cleaned = u) },
	);
	return { moved, cleaned, store, click };
}

describe("the language picker on the English pages", () => {
	it("moves a Hindi browser to the Hindi page, keeping the #fragment", () => {
		expect(run({ languages: ["hi-IN", "en"] }).moved).toBe("/hi/about");
		expect(run({ languages: ["hi"], hash: "#how" }).moved).toBe(
			"/hi/about#how",
		);
		expect(run({ languages: ["de", "hi"] }).moved).toBe("/hi/about");
	});

	it("leaves English and other browsers alone", () => {
		expect(run({ languages: ["en-US", "hi"] }).moved).toBeUndefined();
		expect(run({ languages: ["de"] }).moved).toBeUndefined();
		expect(run({ languages: [] }).moved).toBeUndefined();
	});

	it("keeps a choice: ?lang=en stays English, ?lang=hi and a stored hi go to Hindi", () => {
		const en = run({ languages: ["hi"], search: "?lang=en" });
		expect(en.moved).toBeUndefined();
		expect(en.store["pages-lang"]).toBe("en");
		expect(en.cleaned).toBe("/about");
		expect(run({ languages: ["hi"], stored: "en" }).moved).toBeUndefined();
		expect(run({ languages: ["en"], search: "?lang=hi" }).moved).toBe(
			"/hi/about",
		);
		expect(run({ languages: ["en"], stored: "hi" }).moved).toBe("/hi/about");
	});

	it("remembers a click on the switcher", () => {
		const r = run({ languages: ["en"] });
		r.click?.({ target: { closest: () => ({ hreflang: "hi" }) } });
		expect(r.store["pages-lang"]).toBe("hi");
	});

	it("still decides by the browser's language when storage is blocked", () => {
		expect(run({ languages: ["hi"], storage: false }).moved).toBe("/hi/about");
	});
});

describe("the Hindi pages", () => {
	it.each(["/hi/", "/hi/about", "/hi/share", "/hi/@sam/"])(
		"%s is Hindi, indexable and linked to English",
		async (path) => {
			const res = await app.request(path);
			expect(res.status).toBe(200);
			const html = await res.text();
			expect(html).toContain('<html lang="hi">');
			expect(html).toContain('<meta property="og:locale" content="hi_IN">');
			expect(html).toContain(
				`<link rel="canonical" href="https://tool.test${path}">`,
			);
			const en = path.replace(/^\/hi\/?/, "/");
			expect(html).toContain(
				`<link rel="alternate" hreflang="hi" href="https://tool.test${path}">`,
			);
			expect(html).toContain(
				`<link rel="alternate" hreflang="en" href="https://tool.test${en}">`,
			);
			expect(html).toContain(
				`<link rel="alternate" hreflang="x-default" href="https://tool.test${en}">`,
			);
			expect(html).toMatch(/<title>[^<]*[ऀ-ॿ]/);
			expect(html).toMatch(/<meta name="description" content="[^"]*[ऀ-ॿ]/);
			expect(html).toContain("Noto Sans Devanagari");
			expect(html.match(/<h1[ >]/g)).toHaveLength(1);
			// No script of its own and no language redirect: a Hindi page stays where it is.
			expect(html).not.toContain(DETECT);
			expect(html).not.toContain(DETECT_HASH);
			expect(html).toContain('hreflang="en" lang="en">English</a>');
		},
	);

	it("the English link in the footer asks the English page to remember the choice", async () => {
		const html = await page("/hi/about");
		expect(html).toContain(
			'<a href="/about?lang=en" hreflang="en" lang="en">English</a>',
		);
		expect(html).toContain(
			'<a href="/hi/about" hreflang="hi" lang="hi" aria-current="true">हिन्दी</a>',
		);
	});

	it("keeps every link inside Hindi, and the commands in English", async () => {
		const html = await page("/hi/");
		expect(html).toContain('href="/hi/about"');
		expect(html).toContain('href="/hi/#spaces"');
		expect(html).toContain("claude plugin install pages@flisk-pages");
		expect(html).toContain("publish ./my-page to pages");
		expect(html).toContain("pages.flisk.si");
		expect(html).toContain("<em>लिंक बना देती है।</em>");
	});

	it("shows a publisher's space exactly as written, never translated", async () => {
		const html = await page("/hi/");
		expect(html).toContain("How GPUs work");
		expect(await page("/hi/@sam/")).toContain("gpu-explainer");
		expect((await app.request("/hi")).status).toBe(301);
	});

	it("marks up the FAQ in Hindi for search", async () => {
		const html = await page("/hi/about");
		expect(html).toContain('"inLanguage":"hi"');
		expect(html).toContain("मैं पेज कैसे प्रकाशित करूँ?");
	});

	it("puts the words of the share script in the page, so the Hindi page is Hindi after the click", async () => {
		const html = await page("/hi/share");
		expect(html).toContain(`data-need="${COPY.hi.shareJs.need}"`);
		expect(html).toContain("script-src 'self' https://flisk.si");
		expect(await page("/share")).toContain(
			'data-need="Choose a .html file or paste its HTML first."',
		);
	});
});

describe("the English pages", () => {
	it("are unchanged in language and carry the picker, allowed by its hash", async () => {
		const html = await page("/");
		expect(html).toContain('<html lang="en">');
		expect(html).toContain(`<script>${DETECT}</script>`);
		const hash = createHash("sha256").update(DETECT).digest("base64");
		expect(html).toContain(`script-src 'sha256-${hash}' https://flisk.si`);
		expect(html).toContain(
			'<link rel="alternate" hreflang="hi" href="https://tool.test/hi/">',
		);
		expect(html).toContain(
			'<link rel="alternate" hreflang="x-default" href="https://tool.test/">',
		);
		expect(html).toContain('<a href="/hi/" hreflang="hi" lang="hi">हिन्दी</a>');
	});

	it("the picker is the only inline script", async () => {
		for (const path of ["/", "/about", "/share", "/@sam/"]) {
			const html = await page(path);
			const inline = [
				...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*ld\+json)[^>]*>/g),
			].map((m) => m[0]);
			expect(inline, path).toEqual(["<script>"]);
		}
	});
});

describe("the sitemap and the files for crawlers", () => {
	it("lists every language with its alternates", async () => {
		const xml = await page("/sitemap-site.xml");
		for (const loc of ["/hi/", "/hi/about", "/hi/@sam/"])
			expect(xml).toContain(`<loc>https://tool.test${loc}</loc>`);
		expect(xml).toContain(
			'<xhtml:link rel="alternate" hreflang="hi" href="https://tool.test/hi/about"/>',
		);
		expect(xml).toContain(
			'<xhtml:link rel="alternate" hreflang="en" href="https://tool.test/about"/>',
		);
		expect(xml).toContain(
			'<xhtml:link rel="alternate" hreflang="x-default" href="https://tool.test/about"/>',
		);
		expect(await page("/@sam/sitemap.xml")).toContain(
			"<loc>https://tool.test/hi/@sam/</loc>",
		);
	});

	it("leaves what is for machines and for publishers in English", async () => {
		expect(DEVANAGARI.test(await page("/llms.txt"))).toBe(false);
		expect(DEVANAGARI.test(await page("/spaces.json"))).toBe(false);
		// One 404.html serves every address, so it is English (only the language links are in Hindi).
		expect(await page("/404.html")).toContain("Page not found");
		expect(langPath("hi", "about")).toBe("hi/about");
		expect(langPath("en", "about")).toBe("about");
	});
});
