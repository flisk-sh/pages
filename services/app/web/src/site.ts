// Everything about the product that shows up in search results, link previews, AI answers and the app's own pages.
// Edit this file first (or run `bun run rename`): titles, meta tags, JSON-LD, robots.txt, sitemap.xml, llms.txt,
// site.webmanifest and security.txt are all built from it.

export const SITE = {
	name: "Contrast",
	/** Under 60 characters: the <title> of the home page and the Product Hunt tagline. */
	tagline: "WCAG color contrast, as a link you can share",
	/** 140 to 160 characters: the meta description and the link preview text. */
	description:
		"Put two colors in the address and get their WCAG contrast ratio, AA and AAA verdicts and the nearest color that passes. Free, no signup, open source.",
	/** Where the site lives online, ending in a slash. PUBLIC_URL overrides it at run time. */
	url: "https://your-tool.example.com/",
	repo: "https://github.com/flisk-sh/flisk-template-launch",
	lang: "en",
	locale: "en_US",
	/** The organization or person behind it, for JSON-LD and the footer. */
	author: { name: "Flisk", url: "https://flisk.sh" },
	/** An X handle with the @, or empty. */
	twitter: "",
	/** Matches the background of the page in each color scheme. */
	themeColor: { light: "#fbfaf7", dark: "#141413" },
	/** Where to report a security problem, for /.well-known/security.txt. */
	securityContact:
		"https://github.com/flisk-sh/flisk-template-launch/security/advisories/new",
	/** Shown on /about and sent as FAQPage JSON-LD. Write the questions people type into search and AI assistants. */
	faq: [
		{
			q: "What contrast ratio does WCAG require?",
			a: "WCAG 2.2 level AA asks for 4.5:1 for body text and 3:1 for large text (24px, or 18.66px bold) and for interface parts such as borders and icons. Level AAA asks for 7:1 and 4.5:1.",
		},
		{
			q: "How do I share a result?",
			a: "Copy the address. Every result has its own page: /1d1c1a/fbfaf7 compares #1d1c1a text on a #fbfaf7 background.",
		},
		{
			q: "Is there an API?",
			a: "Yes: /api/contrast?fg=1d1c1a&bg=fbfaf7 answers JSON, and /mcp is an MCP server with one tool, check_contrast, for Claude, ChatGPT, Cursor or Codex. Neither needs a key.",
		},
		{
			q: "What is stored?",
			a: "Nothing. The result is computed from the address on every request, with no database and no cookies.",
		},
	],
	/** Example results linked from the home page; also listed in sitemap.xml. */
	examples: [
		["1d1c1a", "fbfaf7"],
		["767676", "ffffff"],
		["ffffff", "2d4cc8"],
		["e0a54a", "141413"],
	],
} as const;
