// The publishing policy: what a space may contain before it goes live on its own branch. Plain JavaScript with no
// dependencies, so the same file runs in the PR workflow (bun), in the build (a second look at every branch) and on the
// publisher's machine (`node bin/pages.mjs check <dir>`) before anything is pushed.
//
// It reads files as text and never runs them. The Content-Security-Policy that csp() writes into every page is what
// actually stops a page from loading or sending things it should not; these checks catch the same problems early, with
// a message an agent can act on, and catch what a CSP cannot see (a password field, a wallet prompt, a hidden file).
//
//   node check.mjs <dir> [--json]      exit 0 when there are no errors, 1 otherwise
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

export const LIMITS = {
	files: 300,
	fileBytes: 5 * 1024 * 1024,
	totalBytes: 10 * 1024 * 1024,
};

/** Hosts a page may load scripts from: the public CDNs, Tailwind's play CDN and giscus for comments. */
export const SCRIPT_HOSTS = [
	"cdnjs.cloudflare.com",
	"cdn.jsdelivr.net",
	"unpkg.com",
	"esm.sh",
	"cdn.tailwindcss.com",
	"giscus.app",
];
export const STYLE_HOSTS = [
	...SCRIPT_HOSTS,
	"fonts.googleapis.com",
	"api.fontshare.com",
];
export const FONT_HOSTS = [
	...STYLE_HOSTS,
	"fonts.gstatic.com",
	"cdn.fontshare.com",
];
/** Hosts a page may fetch from: the CDNs (for data files and modules) and public GitHub content. */
export const CONNECT_HOSTS = [
	...SCRIPT_HOSTS,
	"api.github.com",
	"raw.githubusercontent.com",
];
export const FRAME_HOSTS = [
	"giscus.app",
	"www.youtube-nocookie.com",
	"player.vimeo.com",
];

export const EXTENSIONS = new Set(
	".html .htm .md .css .js .mjs .json .csv .tsv .txt .xml .svg .png .jpg .jpeg .gif .webp .avif .ico .woff .woff2 .mp3 .mp4 .webm .pdf".split(
		" ",
	),
);

const HANDLE = /^[a-z0-9](?:[a-z0-9-]{0,38})$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
const NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

/** A space is /@<handle>/<slug>/: the handle is the publisher's GitHub login, lowercased. */
export function validId(handle, slug) {
	return HANDLE.test(handle) && SLUG.test(slug);
}

/**
 * The policy written into the <head> of every published page. Images may come from any https host. With
 * `{ scripts: false }` (the one-click @anon spaces, which are Markdown or a generated CV) nothing may run at all.
 */
export function csp({ scripts = true } = {}) {
	const hosts = (list) => list.map((h) => `https://${h}`).join(" ");
	return [
		"default-src 'self'",
		scripts
			? `script-src 'self' 'unsafe-inline' ${hosts(SCRIPT_HOSTS)}`
			: "script-src 'none'",
		`style-src 'self' 'unsafe-inline' ${hosts(STYLE_HOSTS)}`,
		`font-src 'self' data: ${hosts(FONT_HOSTS)}`,
		"img-src 'self' data: blob: https:",
		"media-src 'self' data: blob: https:",
		`connect-src 'self' ${hosts(CONNECT_HOSTS)}`,
		`frame-src ${hosts(FRAME_HOSTS)}`,
		"worker-src 'self' blob:",
		"form-action 'self'",
		"base-uri 'none'",
		"object-src 'none'",
	].join("; ");
}

/** Every start tag `<name …>` in the text, with its attributes, lowercased names. */
export function tags(html, name) {
	const out = [];
	const re = new RegExp(`<${name}\\b([^>]*)>`, "gi");
	for (const m of html.matchAll(re)) {
		const attrs = {};
		for (const a of m[1].matchAll(
			/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g,
		))
			attrs[a[1].toLowerCase()] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? "");
		out.push(attrs);
	}
	return out;
}

const NAMED = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	colon: ":",
	sol: "/",
	period: ".",
	lpar: "(",
	rpar: ")",
	tab: "\t",
	newline: "\n",
};

/** What a browser reads in an attribute value: numeric and the common named entities decoded (&#112; &#x70; &colon;). */
export function decodeEntities(value) {
	return value.replace(
		/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z]+));?/gi,
		(all, dec, hex, name) => {
			if (name) return NAMED[name.toLowerCase()] ?? all;
			const code = dec ? Number(dec) : Number.parseInt(hex, 16);
			return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
		},
	);
}

/** The host of an absolute or protocol-relative address, "" for a relative one, null for one that cannot be read. */
export function hostOf(url) {
	const u = url.trim();
	if (!/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(u)) return "";
	try {
		const parsed = new URL(u.startsWith("//") ? `https:${u}` : u);
		return /^(?:https?|wss?):$/.test(parsed.protocol)
			? parsed.hostname.toLowerCase()
			: null;
	} catch {
		return null;
	}
}

const isHttps = (url) => /^(?:https:)?\/\//i.test(url.trim());

/** Checks one HTML text (a page, or the inline parts of one). */
function checkHtml(file, html, report) {
	for (const s of tags(html, "script")) {
		if (s.src === undefined) continue;
		const host = hostOf(s.src);
		if (host === "") continue;
		if (host === null || !isHttps(s.src))
			report("error", "script-src", file, `script ${s.src} is not https`);
		else if (!SCRIPT_HOSTS.includes(host))
			report(
				"error",
				"script-src",
				file,
				`script from ${host}: copy it into the space or load it from ${SCRIPT_HOSTS.slice(0, 3).join(", ")}`,
			);
	}
	for (const l of tags(html, "link")) {
		if (!/stylesheet/i.test(l.rel ?? "") || !l.href) continue;
		const host = hostOf(l.href);
		if (host && !STYLE_HOSTS.includes(host))
			report(
				"error",
				"style-src",
				file,
				`stylesheet from ${host}: copy it into the space or use fonts.googleapis.com or a CDN`,
			);
	}
	for (const f of tags(html, "form")) {
		const host = hostOf(f.action ?? "");
		if (host !== "")
			report(
				"error",
				"form-action",
				file,
				`a form sends to ${f.action}: forms may only submit to the page itself`,
			);
	}
	for (const i of tags(html, "input"))
		if ((i.type ?? "").toLowerCase() === "password")
			report(
				"error",
				"password",
				file,
				"a password field: spaces are public pages and may not ask for passwords",
			);
	for (const f of tags(html, "iframe")) {
		const host = hostOf(f.src ?? "");
		if (host && !FRAME_HOSTS.includes(host))
			report(
				"error",
				"frame-src",
				file,
				`an iframe of ${host}: only ${FRAME_HOSTS.join(", ")} may be embedded`,
			);
	}
	for (const m of tags(html, "meta"))
		if (/refresh/i.test(m["http-equiv"] ?? "")) {
			const to = (m.content ?? "").split(/url=/i)[1] ?? "";
			if (hostOf(to.replace(/^['"]|['"]$/g, "")))
				report(
					"error",
					"redirect",
					file,
					"a meta refresh to another site: spaces may not redirect away",
				);
		}
	if (tags(html, "base").length)
		report("error", "base", file, "a <base> element: remove it");
	for (const a of tags(html, "a"))
		if (/^\s*javascript:/i.test(a.href ?? ""))
			report(
				"warn",
				"javascript-url",
				file,
				"a javascript: link: use a button with a click handler",
			);
	checkScript(file, html, report);
}

/** Checks script text: where it fetches from, and the prompts phishing and mining pages are made of. */
function checkScript(file, text, report) {
	// XMLHttpRequest's open(method, url) counts; window.open(url) is a link and does not.
	for (const m of text.matchAll(
		/\b(?:(fetch|WebSocket|EventSource|sendBeacon)\s*\(\s*|(open)\s*\(\s*["'`](?:GET|POST|PUT|PATCH|DELETE|HEAD)["'`]\s*,\s*)["'`](?:(?:https?|wss?):)?\/\/([^/"'`\s:?#]+)/gi,
	)) {
		const host = m[3].toLowerCase();
		if (!CONNECT_HOSTS.includes(host))
			report(
				"error",
				"connect-src",
				file,
				`${m[1] ?? m[2]} to ${host}: pages may fetch only their own files, the CDNs and GitHub (put the data in the space)`,
			);
	}
	if (/eth_requestAccounts|eth_sendTransaction|solana\.connect\s*\(/.test(text))
		report(
			"error",
			"wallet",
			file,
			"asks for a crypto wallet: not allowed on pages.flisk.si",
		);
	if (/coinhive|cryptonight|webminer/i.test(text))
		report("error", "miner", file, "looks like a crypto miner");
}

function checkSvg(file, svg, report) {
	if (/<script\b|\son[a-z]+\s*=|javascript:/i.test(svg))
		report(
			"error",
			"svg-script",
			file,
			"an SVG with a script or event handler: SVGs are served as files, outside the page's policy",
		);
}

/** Every file under `dir`, as paths relative to it with "/" separators. Symlinks and odd names are reported. */
function walk(dir, report) {
	const files = [];
	const visit = (at) => {
		for (const name of readdirSync(at).sort()) {
			const path = join(at, name);
			const rel = relative(dir, path).split(sep).join("/");
			const stat = lstatSync(path);
			if (stat.isSymbolicLink()) {
				report("error", "symlink", rel, "a symbolic link: copy the file in");
				continue;
			}
			if (!NAME.test(name)) {
				report(
					"error",
					"name",
					rel,
					name.startsWith(".")
						? "a hidden file: remove it"
						: "use letters, digits, '.', '_' and '-' in file names",
				);
				continue;
			}
			if (stat.isDirectory()) visit(path);
			else if (stat.isFile()) files.push({ rel, path, bytes: stat.size });
			else report("error", "file-type", rel, "not a regular file");
		}
	};
	visit(dir);
	return files;
}

/**
 * Checks the folder of one space. Returns { ok, errors, warnings, files, bytes }; ok means no errors. Warnings are
 * things worth fixing that do not stop a publish (a missing title, a javascript: link).
 */
export function checkSpace(dir) {
	const findings = [];
	const report = (severity, rule, file, message) =>
		findings.push({ severity, rule, file, message });
	const files = walk(dir, report);
	const names = new Set(files.map((f) => f.rel));
	if (!names.has("index.html") && !names.has("index.md"))
		report(
			"error",
			"index",
			".",
			"no index.html or index.md at the top of the folder",
		);
	if (files.length > LIMITS.files)
		report(
			"error",
			"size",
			".",
			`${files.length} files: the limit is ${LIMITS.files}`,
		);
	const bytes = files.reduce((n, f) => n + f.bytes, 0);
	if (bytes > LIMITS.totalBytes)
		report(
			"error",
			"size",
			".",
			`${(bytes / 1048576).toFixed(1)} MB in all: the limit is ${LIMITS.totalBytes / 1048576} MB`,
		);
	for (const f of files) {
		const ext = extname(f.rel).toLowerCase();
		if (!EXTENSIONS.has(ext)) {
			report(
				"error",
				"extension",
				f.rel,
				`${ext || "no extension"}: not a file type pages serves`,
			);
			continue;
		}
		if (f.bytes > LIMITS.fileBytes)
			report(
				"error",
				"size",
				f.rel,
				`${(f.bytes / 1048576).toFixed(1)} MB: one file may be ${LIMITS.fileBytes / 1048576} MB`,
			);
		if (f.bytes > LIMITS.fileBytes) continue;
		if (ext === ".html" || ext === ".htm")
			checkHtml(f.rel, readFileSync(f.path, "utf8"), report);
		else if (ext === ".js" || ext === ".mjs")
			checkScript(f.rel, readFileSync(f.path, "utf8"), report);
		else if (ext === ".svg")
			checkSvg(f.rel, readFileSync(f.path, "utf8"), report);
	}
	if (names.has("index.html")) {
		const html = readFileSync(join(dir, "index.html"), "utf8");
		if (!/<title>[^<]+<\/title>/i.test(html))
			report(
				"warn",
				"title",
				"index.html",
				"no <title>: the gallery and link previews use it",
			);
		if (!tags(html, "meta").some((m) => m.name === "description"))
			report(
				"warn",
				"description",
				"index.html",
				'no <meta name="description">: link previews use it',
			);
	}
	const errors = findings.filter((f) => f.severity === "error");
	return {
		ok: errors.length === 0,
		errors,
		warnings: findings.filter((f) => f.severity === "warn"),
		files: files.length,
		bytes,
	};
}

/**
 * Checks one file given as text, with no filesystem: for a remote check of a pasted page. `name` decides the kind
 * (index.html, app.js, logo.svg); the rules are the ones checkSpace applies to that kind of file. Returns
 * { ok, errors, warnings, files: 1, bytes }.
 */
export function checkText(name, text) {
	const findings = [];
	const report = (severity, rule, file, message) =>
		findings.push({ severity, rule, file, message });
	const ext = extname(name).toLowerCase();
	const bytes = new TextEncoder().encode(text).length;
	if (!EXTENSIONS.has(ext))
		report(
			"error",
			"extension",
			name,
			`${ext || "no extension"}: not a file type pages serves`,
		);
	else if (bytes > LIMITS.fileBytes)
		report(
			"error",
			"size",
			name,
			`${(bytes / 1048576).toFixed(1)} MB: one file may be ${LIMITS.fileBytes / 1048576} MB`,
		);
	else if (ext === ".html" || ext === ".htm") {
		checkHtml(name, text, report);
		if (!/<title>[^<]+<\/title>/i.test(text))
			report(
				"warn",
				"title",
				name,
				"no <title>: the gallery and link previews use it",
			);
		if (!tags(text, "meta").some((m) => m.name === "description"))
			report(
				"warn",
				"description",
				name,
				'no <meta name="description">: link previews use it',
			);
	} else if (ext === ".js" || ext === ".mjs") checkScript(name, text, report);
	else if (ext === ".svg") checkSvg(name, text, report);
	const errors = findings.filter((f) => f.severity === "error");
	return {
		ok: errors.length === 0,
		errors,
		warnings: findings.filter((f) => f.severity === "warn"),
		files: 1,
		bytes,
	};
}

/** The report as lines a person or an agent reads. */
export function formatReport(result) {
	// Every error is listed. A warning that repeats (a generated report has the same link on every page) is listed
	// three times, then counted, so a real report's output stays readable.
	const shown = new Map();
	const lines = [];
	for (const f of [...result.errors, ...result.warnings]) {
		const n = (shown.get(f.rule) ?? 0) + 1;
		shown.set(f.rule, n);
		if (f.severity === "error" || n <= 3)
			lines.push(
				`${f.severity === "error" ? "✗" : "!"} ${f.file}: ${f.message} [${f.rule}]`,
			);
	}
	for (const [rule, n] of shown) {
		const errors = result.errors.filter((f) => f.rule === rule).length;
		if (n - errors > 3)
			lines.push(`! …and ${n - errors - 3} more [${rule}] warnings`);
	}
	lines.push(
		result.ok
			? `✓ ready to publish: ${result.files} files, ${(result.bytes / 1024).toFixed(0)} KB`
			: `✗ ${result.errors.length} problem(s) to fix before publishing`,
	);
	return lines.join("\n");
}

if (import.meta.main ?? process.argv[1]?.endsWith("check.mjs")) {
	const dir = process.argv[2];
	if (!dir) {
		console.error("usage: check.mjs <dir> [--json]");
		process.exit(2);
	}
	const result = checkSpace(dir);
	console.log(
		process.argv.includes("--json")
			? JSON.stringify(result, null, 2)
			: formatReport(result),
	);
	process.exit(result.ok ? 0 : 1);
}
