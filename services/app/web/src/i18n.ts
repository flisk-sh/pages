// The site's own pages in more than one language. English is the default and lives at the root (/, /about); every
// other language lives under its code (/hi/, /hi/about). The site is static (GitHub Pages sends no headers and runs
// no code), so there is no Accept-Language to read: a few lines of inline script on the English pages read
// navigator.languages once and move a Hindi reader to /hi/ (DETECT below). Nothing user-published is translated: a
// space is shown exactly as its publisher wrote it, and so are llms.txt, spaces.json, robots.txt and the sitemaps'
// addresses. tests/i18n.test.ts fails when a string exists in one language and not in the other.
import { createHash } from "node:crypto";
import { SITE } from "./site";

export const LANGS = ["en", "hi"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "en";

/** Names in their own language, for the switcher, and the og:locale of each. */
export const LANG_NAME: Record<Lang, string> = {
	en: "English",
	hi: "हिन्दी",
};
export const LOCALE: Record<Lang, string> = { en: "en_US", hi: "hi_IN" };

/** The path of `rel` (a page's path under the site, "" for home) in `lang`: "about" → "hi/about", "" → "hi/". */
export const langPath = (lang: Lang, rel: string): string =>
	lang === DEFAULT_LANG ? rel : `${lang}/${rel}`;

/** The language a request or a path asks for, or the default. */
export const isLang = (s: unknown): s is Lang =>
	typeof s === "string" && (LANGS as readonly string[]).includes(s);

/**
 * Which supported language an Accept-Language header or navigator.languages list asks for first: "hi-IN,en;q=0.8"
 * is Hindi, "de,hi;q=0.7,en;q=0.5" is Hindi too (German is not offered, so the next one counts). The inline script
 * below does the same on a list, so the two stay one rule.
 */
export function pickLang(accept: string | readonly string[] | undefined): Lang {
	const list = Array.isArray(accept)
		? accept
		: String(accept ?? "")
				.split(",")
				.map((part) => {
					const [tag, ...params] = part.trim().split(";");
					const q = params
						.map((p) => /^\s*q=([\d.]+)/.exec(p)?.[1])
						.find(Boolean);
					return { tag: tag as string, q: q === undefined ? 1 : Number(q) };
				})
				.filter((x) => x.tag && x.q > 0)
				.sort((a, b) => b.q - a.q)
				.map((x) => x.tag);
	for (const tag of list) {
		const code = tag.toLowerCase().split("-")[0];
		if (isLang(code)) return code;
	}
	return DEFAULT_LANG;
}

/**
 * Runs on the English pages only. A reader who chose a language (the footer switcher, or ?lang=hi / ?lang=en) keeps
 * it; otherwise the browser's language list decides. The choice is kept in localStorage, nothing is sent anywhere.
 */
export const DETECT = `(function(){var K="pages-lang",L=location,S=null;try{S=localStorage}catch(e){}var m=/[?&]lang=(en|hi)(?:&|$)/.exec(L.search),p=m&&m[1];try{if(p)S.setItem(K,p);else p=S.getItem(K)}catch(e){}if(!p){var n=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language];for(var i=0;i<n.length;i++){var c=String(n[i]).toLowerCase().split("-")[0];if(c==="hi"||c==="en"){p=c;break}}}if(m&&p==="en"&&history.replaceState)history.replaceState(null,"",L.pathname+L.hash);var a=document.querySelector("link[rel=alternate][hreflang=hi]");if(p==="hi"&&a)L.replace(new URL(a.href).pathname+L.hash);document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[hreflang]");if(a)try{S.setItem(K,a.hreflang)}catch(x){}})})()`;
/** The policy that allows exactly that script and no other inline one. */
export const DETECT_HASH = `'sha256-${createHash("sha256").update(DETECT).digest("base64")}'`;

export interface Faq {
	q: string;
	a: string;
}

/** Plain text unless a name ends in Html: those are written by this file, with the caller's values already escaped. */
export interface Copy {
	/** Under 60 characters. The home page's <title> and the Product Hunt tagline. */
	tagline: string;
	/** 140 to 160 characters in English; the same job in every language. */
	description: string;
	navSpaces: string;
	navHow: string;
	navFaq: string;
	navLabel: string;
	footerHtml: (repo: string) => string;
	madeByHtml: (author: string, faq: string, json: string) => string;
	switcherLabel: string;
	// Home
	pillTag: string;
	pillText: string;
	heroHtml: string;
	ledeHtml: (host: string) => string;
	ctaInstall: string;
	ctaSpaces: string;
	facts: [string, string, string];
	termLabel: string;
	termChecked: string;
	termDim: string;
	termPr: string;
	termLive: string;
	strip: [string, string][];
	showEyebrow: (name: string) => string;
	showTitle: string;
	showSub: string;
	showJson: string;
	howEyebrow: string;
	howTitle: string;
	howSub: string;
	steps: [string, (host: string) => string][];
	watchEyebrow: string;
	watchTitle: string;
	watchSub: string;
	videoLabel: (host: string) => string;
	videoTrackLabel: string;
	whyEyebrow: (name: string) => string;
	whyTitle: string;
	whySub: string;
	why: [string, string][];
	installEyebrow: string;
	installTitle: string;
	installHtml: (repo: string) => string;
	// Spaces and handles
	noSpaces: string;
	ago: (days: number) => string;
	handleTitle: (handle: string) => string;
	handleDescription: (count: number, handle: string, name: string) => string;
	handleCount: (count: number) => string;
	// About
	aboutTitle: string;
	aboutDescription: (name: string) => string;
	aboutEyebrow: string;
	aboutH1: (name: string) => string;
	aboutQuestions: string;
	aboutRules: string;
	rulesHtml: (
		files: number,
		mb: number,
		scripts: string,
		frames: string,
		check: string,
	) => string;
	/** The words that link to check.mjs inside rulesHtml. */
	rulesCheck: string;
	faq: Faq[];
	// Share
	shareTitle: string;
	shareDescription: string;
	shareEyebrow: string;
	shareH1: string;
	shareLede: string;
	sharePage: string;
	sharePaste: string;
	shareNames: string;
	shareNamesExample: string;
	shareSubmit: string;
	shareWarnHtml: (code: string) => string;
	shareJs: {
		need: string;
		nocrypto: string;
		sealing: string;
		done: string;
		saved: string;
		download: string;
		recipient: string;
	};
}

const en: Copy = {
	tagline: SITE.tagline,
	description: SITE.description,
	navSpaces: "Spaces",
	navHow: "How it works",
	navFaq: "FAQ",
	navLabel: "Site",
	footerHtml: (repo) =>
		`Every space is public, free and a git branch in ${repo}. No keys, no database, no tracking.`,
	madeByHtml: (author, faq, json) => `Made by ${author} · ${faq} · ${json}`,
	switcherLabel: "Language",
	pillTag: "Free",
	pillText: "No keys, no database, no account for readers",
	heroHtml: "Your agent builds a page. One command makes it <em>a link.</em>",
	ledeHtml: (host) =>
		`Dashboards, explainers, comparisons, app mockups: whatever your agent made, publish it to <strong>${host}/@you/name</strong> in about a minute. Every space is a git branch; every version is a commit.`,
	ctaInstall: "Install for Claude Code",
	ctaSpaces: "See live spaces →",
	facts: [
		"Open source",
		"Interactive HTML or Markdown",
		"Versions you can diff",
	],
	termLabel: "Publishing from Claude Code",
	termChecked: "checked every file",
	termDim: "· nothing runs",
	termPr: "pull request opened and merged",
	termLive: "live at",
	strip: [
		["One branch per space", "space/you/name, in a public repo"],
		["A check you can read", "One file decides what may publish"],
		["Nothing to sign up for", "Your GitHub, your fork, your PR"],
		["Zero tracking", "No cookies, no analytics, no ads"],
	],
	showEyebrow: (name) => `Made with ${name}`,
	showTitle: "Real pages, live right now",
	showSub:
		"Each one was built by an agent and published with one command. Click any to open it.",
	showJson: "All spaces as JSON",
	howEyebrow: "How it works",
	howTitle: "From a folder to a link in three steps",
	howSub:
		"No build step, no hosting account, no API key. The whole pipeline is GitHub Pages and a pull request.",
	steps: [
		[
			"Your agent builds it",
			() =>
				"One folder with an <code>index.html</code> and its scripts, data and images, or just an <code>index.md</code>.",
		],
		[
			"It opens a pull request",
			() =>
				"From your fork, signed in with your own GitHub. A check reads every file; nothing in your space runs on our side.",
		],
		[
			"It is a link",
			(host) =>
				`The space lands on its own branch and goes live at <code>${host}/@you/name</code>. Publish again for a new version.`,
		],
	],
	watchEyebrow: "Watch",
	watchTitle: "The whole thing in 60 seconds",
	watchSub:
		"An agent builds a GPU explainer, publishes it, and the link works.",
	videoLabel: (host) =>
		`One-minute demo: an agent builds a page and publishes it to ${host}`,
	videoTrackLabel: "English",
	whyEyebrow: (name) => `Why ${name}`,
	whyTitle: "Made for what agents build",
	whySub:
		"Not another hosting dashboard. A shared shelf for interactive pages, kept in git.",
	why: [
		[
			"Interactive, not static",
			"Charts, sliders, 3D, maps: scripts from the space or the big CDNs just work.",
		],
		[
			"Versions for free",
			"Every publish is a commit. Diff any two versions on GitHub.",
		],
		[
			"Safe to open",
			"Every page runs under a strict policy: no forms posting away, no password fields, no trackers.",
		],
		[
			"Yours to take down",
			'Open an issue titled "Remove @you/name" and the branch is gone in a minute.',
		],
	],
	installEyebrow: "Get started",
	installTitle: "Publish your first page",
	installHtml: (repo) =>
		`Two commands in your terminal, then ask your agent. Needs the GitHub CLI signed in. No agent? <a href="${repo}#publish">Use the CLI</a>.`,
	noSpaces: "No spaces yet. Be the first: the command is above.",
	ago: (d) => (d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`),
	handleTitle: (h) => `@${h}'s spaces`,
	handleDescription: (n, h, name) =>
		`${n} public space${n === 1 ? "" : "s"} by @${h} on ${name}: interactive pages published from an agent, each one a git branch.`,
	handleCount: (n) => `${n} public space${n === 1 ? "" : "s"}.`,
	aboutTitle: "About and FAQ",
	aboutDescription: (name) =>
		`How ${name} publishes a page, what a space may contain, where versions live and how to take one down. Free, public, no keys.`,
	aboutEyebrow: "FAQ",
	aboutH1: (name) => `About ${name}`,
	aboutQuestions: "Questions",
	aboutRules: "The rules, exactly",
	rulesHtml: (files, mb, scripts, frames, check) =>
		`At most ${files} files and ${mb} MB. Scripts from the space or ${scripts}. Frames from ${frames}. The check is ${check}; run it yourself with <code>node bin/pages.mjs check ./folder</code>.`,
	rulesCheck: "one file",
	faq: [...SITE.faq],
	shareTitle: "Make a private file",
	shareDescription:
		"Seal a page into one private file per person, in your browser. Nothing is uploaded.",
	shareEyebrow: "Private",
	shareH1: "Make a private file",
	shareLede:
		"Choose a page and the people it is for. Each person gets their own file and passphrase. This runs in your browser: the page is never uploaded, and nothing is stored. Send each file and its passphrase by different channels.",
	sharePage: "Page (.html file)",
	sharePaste: "Or paste the page's HTML here (no file needed)",
	shareNames:
		"Names (optional, just labels: one per line or separated by commas)",
	shareNamesExample: "e.g. me, or leave empty",
	shareSubmit: "Make private files",
	shareWarnHtml: (code) =>
		`Anyone with the file and the passphrase can read the page. Copies you send cannot be taken back. <a href="${code}">Read the sealing code</a>.`,
	shareJs: {
		need: "Choose a .html file or paste its HTML first.",
		nocrypto:
			"This browser cannot make private files. Use a current browser on https.",
		sealing: "Sealing in this browser…",
		done: "Done. The passphrase is shown once. Nothing was uploaded.",
		saved:
			"I have saved this passphrase somewhere safe, and I will send it by a different channel than the file.",
		download: "Download file",
		recipient: "Recipient",
	},
};

const hi: Copy = {
	tagline: "आपका एजेंट पेज बनाता है। एक कमांड उसे लिंक बना देती है।",
	description:
		"अपने एजेंट के बनाए इंटरैक्टिव पेज pages.flisk.si/@you/name पर प्रकाशित करें। मुफ़्त और सार्वजनिक, कोई कुंजी या डेटाबेस नहीं: हर स्पेस एक git ब्रांच है।",
	navSpaces: "स्पेस",
	navHow: "यह कैसे काम करता है",
	navFaq: "अक्सर पूछे जाने वाले प्रश्न",
	navLabel: "साइट",
	footerHtml: (repo) =>
		`हर स्पेस सार्वजनिक, मुफ़्त और ${repo} में एक git ब्रांच है। कोई कुंजी नहीं, कोई डेटाबेस नहीं, कोई ट्रैकिंग नहीं।`,
	madeByHtml: (author, faq, json) =>
		`${author} द्वारा बनाया गया · ${faq} · ${json}`,
	switcherLabel: "भाषा",
	pillTag: "मुफ़्त",
	pillText: "कोई कुंजी नहीं, कोई डेटाबेस नहीं, पाठकों के लिए कोई खाता नहीं",
	heroHtml: "आपका एजेंट पेज बनाता है। एक कमांड उसे <em>लिंक बना देती है।</em>",
	ledeHtml: (host) =>
		`डैशबोर्ड, एक्सप्लेनर, तुलनाएँ, ऐप मॉकअप: आपके एजेंट ने जो भी बनाया हो, उसे लगभग एक मिनट में <strong>${host}/@you/name</strong> पर प्रकाशित करें। हर स्पेस एक git ब्रांच है; हर वर्ज़न एक कमिट।`,
	ctaInstall: "Claude Code के लिए इंस्टॉल करें",
	ctaSpaces: "लाइव स्पेस देखें →",
	facts: ["ओपन सोर्स", "इंटरैक्टिव HTML या Markdown", "ऐसे वर्ज़न जिनका अंतर आप देख सकें"],
	termLabel: "Claude Code से प्रकाशित करना",
	termChecked: "हर फ़ाइल जाँची गई",
	termDim: "· कुछ भी चलता नहीं",
	termPr: "पुल रिक्वेस्ट खुली और मर्ज हुई",
	termLive: "लाइव है:",
	strip: [
		["हर स्पेस की एक ब्रांच", "space/you/name, एक सार्वजनिक रिपॉज़िटरी में"],
		["पढ़ी जा सकने वाली जाँच", "एक ही फ़ाइल तय करती है कि क्या प्रकाशित हो सकता है"],
		["साइन अप की ज़रूरत नहीं", "आपका GitHub, आपका फ़ोर्क, आपका PR"],
		["कोई ट्रैकिंग नहीं", "कोई कुकी नहीं, कोई एनालिटिक्स नहीं, कोई विज्ञापन नहीं"],
	],
	showEyebrow: (name) => `${name} से बने`,
	showTitle: "असली पेज, अभी लाइव",
	showSub:
		"हर एक को किसी एजेंट ने बनाया और एक कमांड से प्रकाशित किया। खोलने के लिए किसी पर भी क्लिक करें।",
	showJson: "सभी स्पेस JSON में",
	howEyebrow: "यह कैसे काम करता है",
	howTitle: "एक फ़ोल्डर से लिंक तक, तीन कदमों में",
	howSub:
		"न कोई बिल्ड स्टेप, न होस्टिंग खाता, न API कुंजी। पूरी प्रक्रिया बस GitHub Pages और एक पुल रिक्वेस्ट है।",
	steps: [
		[
			"आपका एजेंट इसे बनाता है",
			() =>
				"एक फ़ोल्डर जिसमें <code>index.html</code> और उसकी स्क्रिप्ट, डेटा और चित्र हों, या सिर्फ़ एक <code>index.md</code>।",
		],
		[
			"यह एक पुल रिक्वेस्ट खोलता है",
			() =>
				"आपके फ़ोर्क से, आपके अपने GitHub खाते से साइन इन करके। एक जाँच हर फ़ाइल पढ़ती है; आपके स्पेस का कोई कोड हमारी तरफ़ नहीं चलता।",
		],
		[
			"यह एक लिंक बन जाता है",
			(host) =>
				`स्पेस अपनी ब्रांच पर पहुँचता है और <code>${host}/@you/name</code> पर लाइव हो जाता है। नया वर्ज़न बनाने के लिए दोबारा प्रकाशित करें।`,
		],
	],
	watchEyebrow: "देखें",
	watchTitle: "पूरी प्रक्रिया 60 सेकंड में",
	watchSub: "एक एजेंट GPU एक्सप्लेनर बनाता है, उसे प्रकाशित करता है, और लिंक चल पड़ता है।",
	videoLabel: (host) =>
		`एक मिनट का डेमो: एक एजेंट पेज बनाता है और उसे ${host} पर प्रकाशित करता है`,
	videoTrackLabel: "English",
	whyEyebrow: (name) => `${name} क्यों`,
	whyTitle: "एजेंट जो बनाते हैं, उसके लिए बना",
	whySub:
		"एक और होस्टिंग डैशबोर्ड नहीं। इंटरैक्टिव पेजों के लिए एक साझा शेल्फ़, जो git में रखी है।",
	why: [
		[
			"स्थिर नहीं, इंटरैक्टिव",
			"चार्ट, स्लाइडर, 3D, नक्शे: स्पेस की अपनी या बड़े CDN की स्क्रिप्ट सीधे चलती हैं।",
		],
		[
			"वर्ज़न मुफ़्त में",
			"हर प्रकाशन एक कमिट है। GitHub पर किन्हीं भी दो वर्ज़न का अंतर देखें।",
		],
		[
			"खोलना सुरक्षित",
			"हर पेज एक सख़्त नीति के तहत चलता है: कोई फ़ॉर्म बाहर नहीं भेजता, कोई पासवर्ड फ़ील्ड नहीं, कोई ट्रैकर नहीं।",
		],
		[
			"हटाना आपके हाथ में",
			'"Remove @you/name" शीर्षक से एक issue खोलें और ब्रांच एक मिनट में हट जाती है।',
		],
	],
	installEyebrow: "शुरू करें",
	installTitle: "अपना पहला पेज प्रकाशित करें",
	installHtml: (repo) =>
		`टर्मिनल में दो कमांड, फिर अपने एजेंट से कहें। GitHub CLI में साइन इन होना ज़रूरी है। एजेंट नहीं है? <a href="${repo}#publish">CLI इस्तेमाल करें</a>।`,
	noSpaces: "अभी कोई स्पेस नहीं है। पहले आप बनें: कमांड ऊपर दी गई है।",
	ago: (d) => (d <= 0 ? "आज" : d === 1 ? "कल" : `${d} दिन पहले`),
	handleTitle: (h) => `@${h} के स्पेस`,
	handleDescription: (n, h, name) =>
		`${name} पर @${h} के ${n} सार्वजनिक स्पेस: एजेंट से प्रकाशित इंटरैक्टिव पेज, हर एक एक git ब्रांच।`,
	handleCount: (n) => `${n} सार्वजनिक स्पेस।`,
	aboutTitle: "परिचय और अक्सर पूछे जाने वाले प्रश्न",
	aboutDescription: (name) =>
		`${name} पेज कैसे प्रकाशित करता है, स्पेस में क्या हो सकता है, वर्ज़न कहाँ रहते हैं और किसी को कैसे हटाएँ। मुफ़्त, सार्वजनिक, कोई कुंजी नहीं।`,
	aboutEyebrow: "अक्सर पूछे जाने वाले प्रश्न",
	aboutH1: (name) => `${name} के बारे में`,
	aboutQuestions: "प्रश्न",
	aboutRules: "नियम, ठीक-ठीक",
	rulesHtml: (files, mb, scripts, frames, check) =>
		`अधिकतम ${files} फ़ाइलें और ${mb} MB। स्क्रिप्ट स्पेस की अपनी या ${scripts} से। फ़्रेम ${frames} से। जाँच ${check} है; इसे खुद चलाएँ: <code>node bin/pages.mjs check ./folder</code>।`,
	rulesCheck: "एक फ़ाइल",
	faq: [
		{
			q: "मैं पेज कैसे प्रकाशित करूँ?",
			a: "Claude Code में प्लगइन जोड़ें (claude plugin marketplace add flisk-sh/pages, फिर claude plugin install pages@flisk-pages) और अपने एजेंट से किसी फ़ोल्डर को प्रकाशित करने को कहें। एजेंट के बिना: github.com/flisk-sh/pages क्लोन करें और node bin/pages.mjs publish ./folder --slug name चलाएँ। दोनों में GitHub CLI में साइन इन होना ज़रूरी है।",
		},
		{
			q: "प्रकाशित करने पर क्या होता है?",
			a: "आपका फ़ोल्डर आपके फ़ोर्क से एक पुल रिक्वेस्ट में जाता है। एक जाँच हर फ़ाइल पढ़ती है; पास होने पर स्पेस अपनी ब्रांच space/<you>/<name> पर कमिट हो जाता है और एक-दो मिनट में pages.flisk.si/@you/name पर लाइव हो जाता है। पुल रिक्वेस्ट लिंक के साथ बंद कर दी जाती है।",
		},
		{
			q: "स्पेस में क्या-क्या हो सकता है?",
			a: "एक index.html और उसकी स्क्रिप्ट, स्टाइल, डेटा और चित्र, या एक index.md जिसे GitHub README की तरह दिखाया जाता है। अधिकतम 300 फ़ाइलें और 10 MB। स्क्रिप्ट स्पेस की अपनी हो सकती हैं या cdnjs, jsDelivr, unpkg, esm.sh और Tailwind के CDN से।",
		},
		{
			q: "क्या स्पेस निजी होता है?",
			a: "नहीं। हर स्पेस सार्वजनिक है, और GitHub पर उसका सोर्स भी। ऐसा कुछ भी प्रकाशित न करें जिसे आप किसी सार्वजनिक रिपॉज़िटरी में नहीं डालते।",
		},
		{
			q: "वर्ज़न कहाँ हैं?",
			a: "हर प्रकाशन स्पेस की ब्रांच पर एक कमिट है, इसलिए GitHub पर उसका इतिहास ही वर्ज़नों की सूची है। उसी नाम से दोबारा प्रकाशित करने पर एक नया वर्ज़न जुड़ता है।",
		},
		{
			q: "क्या टिप्पणियाँ हैं?",
			a: "Pages कोई टिप्पणी सेवा नहीं चलाता और कोई कुंजी नहीं रखता। अपनी रिपॉज़िटरी और सेटिंग के साथ अपने पेज में giscus जोड़ें; giscus.app की अनुमति है।",
		},
		{
			q: "स्पेस को कैसे हटाएँ?",
			a: "Remove टेम्पलेट के साथ 'Remove @you/name' शीर्षक से एक issue खोलें; अगर आप प्रकाशक हैं तो वह तुरंत हट जाता है। किसी और के पेज की शिकायत करने के लिए उस पर दिया Report लिंक इस्तेमाल करें।",
		},
		{
			q: "क्या-क्या मना है?",
			a: "पासवर्ड फ़ील्ड, दूसरी साइटों को भेजने वाले फ़ॉर्म, सूची से बाहर के होस्ट की स्क्रिप्ट या फ़्रेम, सूची से बाहर के होस्ट पर fetch, वॉलेट प्रॉम्प्ट, माइनर और बाहर भेजने वाले रीडायरेक्ट। हर पेज के साथ एक Content-Security-Policy भी आती है जो ब्राउज़र में इन्हें रोकती है।",
		},
	],
	shareTitle: "एक निजी फ़ाइल बनाएँ",
	shareDescription:
		"अपने ब्राउज़र में एक पेज को हर व्यक्ति के लिए एक निजी फ़ाइल में सील करें। कुछ भी अपलोड नहीं होता।",
	shareEyebrow: "निजी",
	shareH1: "एक निजी फ़ाइल बनाएँ",
	shareLede:
		"एक पेज चुनें और वे लोग चुनें जिनके लिए वह है। हर व्यक्ति को अपनी फ़ाइल और अपना पासफ़्रेज़ मिलता है। यह आपके ब्राउज़र में चलता है: पेज कभी अपलोड नहीं होता और कुछ भी सहेजा नहीं जाता। हर फ़ाइल और उसका पासफ़्रेज़ अलग-अलग माध्यम से भेजें।",
	sharePage: "पेज (.html फ़ाइल)",
	sharePaste: "या पेज का HTML यहाँ पेस्ट करें (फ़ाइल ज़रूरी नहीं)",
	shareNames: "नाम (वैकल्पिक, सिर्फ़ लेबल: हर पंक्ति में एक या अल्पविराम से अलग)",
	shareNamesExample: "जैसे me, या खाली छोड़ दें",
	shareSubmit: "निजी फ़ाइलें बनाएँ",
	shareWarnHtml: (code) =>
		`फ़ाइल और पासफ़्रेज़ रखने वाला कोई भी व्यक्ति पेज पढ़ सकता है। भेजी गई प्रतियाँ वापस नहीं ली जा सकतीं। <a href="${code}">सीलिंग कोड पढ़ें</a>।`,
	shareJs: {
		need: "पहले एक .html फ़ाइल चुनें या उसका HTML पेस्ट करें।",
		nocrypto:
			"यह ब्राउज़र निजी फ़ाइलें नहीं बना सकता। https पर किसी नए ब्राउज़र का इस्तेमाल करें।",
		sealing: "इस ब्राउज़र में सील किया जा रहा है…",
		done: "हो गया। पासफ़्रेज़ सिर्फ़ एक बार दिखाया जाता है। कुछ भी अपलोड नहीं हुआ।",
		saved:
			"मैंने यह पासफ़्रेज़ कहीं सुरक्षित रख लिया है, और इसे फ़ाइल से अलग माध्यम से भेजूँगा/भेजूँगी।",
		download: "फ़ाइल डाउनलोड करें",
		recipient: "प्राप्तकर्ता",
	},
};

export const COPY: Record<Lang, Copy> = { en, hi };
