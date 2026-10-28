// Search, link previews and AI answers: the <head> of every page, JSON-LD, robots.txt, sitemap.xml, llms.txt,
// site.webmanifest and security.txt. All of it comes from SITE (site.ts) and the address the site is served at.
import { SITE } from "./site";

export const esc = (s: string) =>
	s.replace(
		/[&<>"']/g,
		(c) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				c
			] as string,
	);

/** The files the head and the manifest link to, from assets.generated.ts (`bun run icons`). */
export const ICONS = {
	ico: "favicon.ico",
	svg: "icon.svg",
	apple: "apple-touch-icon.png",
	png192: "icon-192.png",
	png512: "icon-512.png",
	maskable: "icon-maskable-512.png",
	og: "og.png",
} as const;

export interface PageMeta {
	/** The page's path under the site, without the leading slash: "" for home, "about", "1d1c1a/fbfaf7". */
	path: string;
	/** Under 60 characters. The site name is added after it, except on the home page. */
	title: string;
	/** 140 to 160 characters. */
	description: string;
	noindex?: boolean;
	/** Extra JSON-LD nodes for this page, added to the site's own graph. */
	jsonLd?: object[];
	/** Breadcrumbs after Home, for BreadcrumbList JSON-LD. */
	crumbs?: { name: string; path: string }[];
}

/** `base` is the site address without the trailing slash: https://example.com, or …/api/web behind Flisk's proxy. */
export function head(base: string, page: PageMeta): string {
	const url = `${base}/${page.path}`;
	const title = page.path ? `${page.title} · ${SITE.name}` : page.title;
	const root = new URL(`${base}/`).pathname.replace(/\/$/, "");
	const tags = [
		'<meta charset="utf-8">',
		'<meta name="viewport" content="width=device-width,initial-scale=1">',
		`<title>${esc(title)}</title>`,
		`<meta name="description" content="${esc(page.description)}">`,
		`<link rel="canonical" href="${esc(url)}">`,
		page.noindex
			? '<meta name="robots" content="noindex">'
			: '<meta name="robots" content="index,follow,max-image-preview:large">',
		`<meta name="theme-color" content="${SITE.themeColor.light}" media="(prefers-color-scheme: light)">`,
		`<meta name="theme-color" content="${SITE.themeColor.dark}" media="(prefers-color-scheme: dark)">`,
		'<meta name="color-scheme" content="light dark">',
		`<link rel="icon" href="${root}/${ICONS.ico}" sizes="32x32">`,
		`<link rel="icon" href="${root}/${ICONS.svg}" type="image/svg+xml">`,
		`<link rel="apple-touch-icon" href="${root}/${ICONS.apple}">`,
		`<link rel="manifest" href="${root}/site.webmanifest">`,
		`<link rel="alternate" type="text/plain" href="${root}/llms.txt" title="llms.txt">`,
		`<meta property="og:type" content="website">`,
		`<meta property="og:site_name" content="${esc(SITE.name)}">`,
		`<meta property="og:locale" content="${SITE.locale}">`,
		`<meta property="og:url" content="${esc(url)}">`,
		`<meta property="og:title" content="${esc(title)}">`,
		`<meta property="og:description" content="${esc(page.description)}">`,
		`<meta property="og:image" content="${esc(`${base}/${ICONS.og}`)}">`,
		'<meta property="og:image:width" content="1200">',
		'<meta property="og:image:height" content="630">',
		`<meta property="og:image:alt" content="${esc(`${SITE.name}: ${SITE.tagline}`)}">`,
		'<meta name="twitter:card" content="summary_large_image">',
		SITE.twitter ? `<meta name="twitter:site" content="${SITE.twitter}">` : "",
		`<script type="application/ld+json">${jsonLd(base, page)}</script>`,
	];
	return tags.filter(Boolean).join("\n");
}

/** One schema.org @graph: the WebSite, who makes it, the app itself, and the page's own nodes. */
export function jsonLd(base: string, page: PageMeta): string {
	const home = `${base}/`;
	const graph: object[] = [
		{
			"@type": "WebSite",
			"@id": `${home}#website`,
			url: home,
			name: SITE.name,
			description: SITE.description,
			inLanguage: SITE.lang,
			publisher: { "@id": `${home}#publisher` },
		},
		{
			"@type": "Organization",
			"@id": `${home}#publisher`,
			name: SITE.author.name,
			url: SITE.author.url,
			logo: `${base}/${ICONS.png512}`,
			sameAs: [SITE.repo],
		},
		{
			"@type": "WebApplication",
			"@id": `${home}#app`,
			name: SITE.name,
			url: home,
			description: SITE.description,
			applicationCategory: "DeveloperApplication",
			operatingSystem: "Any",
			isAccessibleForFree: true,
			offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
			image: `${base}/${ICONS.og}`,
		},
		...(page.jsonLd ?? []),
	];
	if (page.crumbs?.length)
		graph.push({
			"@type": "BreadcrumbList",
			itemListElement: [{ name: SITE.name, path: "" }, ...page.crumbs].map(
				(c, i) => ({
					"@type": "ListItem",
					position: i + 1,
					name: c.name,
					item: `${base}/${c.path}`,
				}),
			),
		});
	// "</" would end the script element early; JSON allows the escaped form.
	return JSON.stringify({
		"@context": "https://schema.org",
		"@graph": graph,
	}).replace(/</g, "\\u003c");
}

export const faqJsonLd = () => ({
	"@type": "FAQPage",
	mainEntity: SITE.faq.map((f) => ({
		"@type": "Question",
		name: f.q,
		acceptedAnswer: { "@type": "Answer", text: f.a },
	})),
});

/**
 * Every crawler may read everything except the API and MCP endpoints. The AI answer crawlers are named on purpose:
 * some sites block them by default, and naming them states the choice. Delete the ones you do not want.
 */
export const ANSWER_CRAWLERS = [
	"OAI-SearchBot",
	"ChatGPT-User",
	"Claude-SearchBot",
	"Claude-User",
	"PerplexityBot",
	"Googlebot",
	"Bingbot",
];

export function robotsTxt(base: string): string {
	const root = new URL(`${base}/`).pathname.replace(/\/$/, "");
	const rules = `Allow: /\nDisallow: ${root}/api/\nDisallow: ${root}/mcp\n`;
	return `${ANSWER_CRAWLERS.map((ua) => `User-agent: ${ua}`).join("\n")}\n${rules}\nUser-agent: *\n${rules}\nSitemap: ${base}/sitemap.xml\n`;
}

export function sitemapXml(base: string, paths: string[], lastmod: string) {
	const urls = paths
		.map(
			(p) =>
				`<url><loc>${esc(`${base}/${p}`)}</loc><lastmod>${lastmod}</lastmod></url>`,
		)
		.join("");
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`;
}

/** llms.txt (llmstxt.org): what the site is and where its useful pages are, for AI assistants. */
export function llmsTxt(
	base: string,
	links: { name: string; path: string; note: string }[],
): string {
	return `# ${SITE.name}\n\n> ${SITE.description}\n\n## Pages\n\n${links
		.map((l) => `- [${l.name}](${base}/${l.path}): ${l.note}`)
		.join("\n")}\n\n## FAQ\n\n${SITE.faq
		.map((f) => `- ${f.q} ${f.a}`)
		.join("\n")}\n\n## Optional\n\n- [Source](${SITE.repo})\n`;
}

export function webManifest(base: string): string {
	const root = new URL(`${base}/`).pathname.replace(/\/$/, "");
	return JSON.stringify(
		{
			name: SITE.name,
			short_name: SITE.name,
			description: SITE.description,
			start_url: `${root}/`,
			scope: `${root}/`,
			display: "standalone",
			background_color: SITE.themeColor.light,
			theme_color: SITE.themeColor.light,
			icons: [
				{ src: `${root}/${ICONS.png192}`, sizes: "192x192", type: "image/png" },
				{ src: `${root}/${ICONS.png512}`, sizes: "512x512", type: "image/png" },
				{
					src: `${root}/${ICONS.maskable}`,
					sizes: "512x512",
					type: "image/png",
					purpose: "maskable",
				},
				{ src: `${root}/${ICONS.svg}`, sizes: "any", type: "image/svg+xml" },
			],
		},
		null,
		2,
	);
}

/** RFC 9116. Expires must be less than a year ahead, so it is written for 180 days from `now`. */
export function securityTxt(base: string, now = new Date()): string {
	const expires = new Date(now.getTime() + 180 * 24 * 3600 * 1000);
	return `Contact: ${SITE.securityContact}\nExpires: ${expires.toISOString().replace(/\.\d+Z$/, "Z")}\nPreferred-Languages: ${SITE.lang}\nCanonical: ${base}/.well-known/security.txt\n`;
}
