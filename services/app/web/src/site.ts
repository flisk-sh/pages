// Everything about the product that shows up in search results, link previews, AI answers and the site's own pages.
// Titles, meta tags, JSON-LD, robots.txt, sitemap.xml, llms.txt, site.webmanifest and security.txt are built from it.

export const SITE = {
	name: "Pages",
	/** Under 60 characters: the <title> of the home page and the Product Hunt tagline. */
	tagline: "Your agent builds a page. One command makes it a link.",
	/** 140 to 160 characters: the meta description and the link preview text. */
	description:
		"Publish the interactive pages your agent builds to pages.flisk.si/@you/name. Free and public, no keys, no database: every space is a git branch.",
	/** Where the site lives online, ending in a slash. PUBLIC_URL overrides it. */
	url: "https://pages.flisk.si/",
	repo: "https://github.com/flisk-sh/pages",
	/** owner/name of the repository the spaces live in, one branch each. */
	repoSlug: "flisk-sh/pages",
	lang: "en",
	locale: "en_US",
	/** The organization or person behind it, for JSON-LD and the footer. */
	author: { name: "Flisk", url: "https://flisk.sh" },
	/** An X handle with the @, or empty. */
	twitter: "",
	/** Matches the background of the page in each color scheme. */
	themeColor: { light: "#fbfaf7", dark: "#141413" },
	/** Where to report a security problem, for /.well-known/security.txt. */
	securityContact: "https://github.com/flisk-sh/pages/security/advisories/new",
	/** Shown on /about and sent as FAQPage JSON-LD. Write the questions people type into search and AI assistants. */
	faq: [
		{
			q: "How do I publish a page?",
			a: "Add the plugin to Claude Code (claude plugin marketplace add flisk-sh/pages, then claude plugin install pages@flisk-pages) and ask your agent to publish a folder. Without an agent: clone github.com/flisk-sh/pages and run node bin/pages.mjs publish ./folder --slug name. Both need the GitHub CLI signed in.",
		},
		{
			q: "What happens when I publish?",
			a: "Your folder goes into a pull request from your fork. A check reads every file; when it passes, the space is committed to its own branch, space/<you>/<name>, and goes live at pages.flisk.si/@you/name within a minute or two. The pull request is closed with the link.",
		},
		{
			q: "What can a space contain?",
			a: "An index.html with its scripts, styles, data and images, or an index.md that is rendered like a GitHub README. Up to 300 files and 10 MB. Scripts may come from the space itself or from cdnjs, jsDelivr, unpkg, esm.sh and Tailwind's CDN.",
		},
		{
			q: "Is a space private?",
			a: "No. Every space is public, and so is its source on GitHub. Do not publish anything you would not post in a public repository.",
		},
		{
			q: "Where are the versions?",
			a: "Each publish is a commit on the space's branch, so its history on GitHub is the list of versions. Publishing the same name again adds a version.",
		},
		{
			q: "Are there comments?",
			a: "Pages runs no comment service and holds no keys. Add giscus to your page with your own repository and settings; giscus.app is allowed.",
		},
		{
			q: "How do I take a space down?",
			a: "Open an issue titled 'Remove @you/name' with the Remove template; it is removed at once when you are the publisher. To report someone else's page, use the Report link on it.",
		},
		{
			q: "What is not allowed?",
			a: "Password fields, forms that send to other sites, scripts or frames from unlisted hosts, fetches to unlisted hosts, wallet prompts, miners and redirects away. Every page also carries a Content-Security-Policy that blocks them in the browser.",
		},
	],
} as const;
