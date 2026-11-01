// The score for the Flisk candidate test. Ten checks, 10 points each, and 100/100 is the only pass.
// It only reads the candidate's PUBLIC GitHub repository through the GitHub API; nothing of theirs is ever run.
const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";
const DAY = 864e5;

export const CHECKS = [
	["README links to flisk.sh and github.com/flisk-sh/flisk", "readme"],
	["LOG.md has Lab 1, Lab 2, Lab 3 and Lab 4", "log"],
	["LOG.md has a fault table with 3 or more rows", "faults"],
	["System built: 3 or more service.json files", "system"],
	["No .env file and no .flisk/ folder committed", "clean"],
	["At least one test file", "tests"],
	["Your last 20 commits are signed off (git commit -s)", "signed"],
	["You starred flisk-sh/flisk", "star"],
	["You opened a pull request to flisk-sh/flisk", "pr"],
	["GTM.md answers all 3 questions (numbered 1, 2, 3)", "gtm"],
];

/** The deadline: the end of the day two days after the start date (UTC). */
export function deadlineOf(start) {
	const t = Date.parse(`${start}T00:00:00Z`);
	return Number.isNaN(t) ? null : new Date(t + 3 * DAY - 1000);
}

export async function runChecks({ user, repo, start }, get = (u) => fetch(u)) {
	const json = async (u) => {
		const r = await get(u);
		if (!r.ok) throw new Error(`${r.status} ${u.replace(API, "")}`);
		return r.json();
	};
	const text = async (path, ref) => {
		const r = await get(`${RAW}/${user}/${repo}/${ref}/${path}`);
		return r.ok ? r.text() : "";
	};
	const info = await json(`${API}/repos/${user}/${repo}`);
	if (info.private) throw new Error("The repository is not public.");
	const ref = info.default_branch;
	const [tree, commits] = await Promise.all([
		json(`${API}/repos/${user}/${repo}/git/trees/${ref}?recursive=1`),
		json(`${API}/repos/${user}/${repo}/commits?per_page=20`),
	]);
	const paths = (tree.tree || []).map((f) => f.path);
	const has = (re) => paths.some((p) => re.test(p));
	const [readme, log, gtm] = await Promise.all([text("README.md", ref), text("LOG.md", ref), text("GTM.md", ref)]);

	let starred = false;
	for (let page = 1; page <= 3 && !starred; page++) {
		const list = await json(`${API}/users/${user}/starred?per_page=100&page=${page}`);
		starred = list.some((r) => r.full_name === "flisk-sh/flisk");
		if (list.length < 100) break;
	}
	const prs = await json(`${API}/search/issues?q=${encodeURIComponent(`repo:flisk-sh/flisk type:pr author:${user}`)}`);

	const pass = {
		readme: /flisk\.sh/i.test(readme) && /github\.com\/flisk-sh\/flisk/i.test(readme),
		log: [1, 2, 3, 4].every((n) => new RegExp(`^#+\\s*lab\\s*${n}\\b`, "im").test(log)),
		faults: (log.match(/^\s*\|.*\|\s*$/gm) || []).length >= 5,
		system: paths.filter((p) => p.endsWith("service.json")).length >= 3,
		clean: !has(/(^|\/)\.env(\.(?!example$|sample$|template$)[^/]*)?$/) && !has(/(^|\/)\.flisk\//),
		tests: has(/(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[a-z]+$|_test\.[a-z]+$|(^|\/)test_[^/]+\.py$/i),
		signed: commits.length > 0 && commits.every((c) => /^Signed-off-by: .+<.+>/m.test(c.commit.message)),
		star: starred,
		pr: prs.total_count > 0,
		gtm: [1, 2, 3].every((n) => new RegExp(`^\\s*${n}[.)]\\s+\\S`, "m").test(gtm)),
	};

	const deadline = deadlineOf(start);
	const gate = {
		started: !!deadline && Date.parse(info.created_at) >= Date.parse(`${start}T00:00:00Z`),
		inTime: !!deadline && commits.every((c) => Date.parse(c.commit.committer.date) <= deadline.getTime()),
	};
	const rows = CHECKS.map(([label, key]) => ({ label, key, ok: pass[key], points: pass[key] ? 10 : 0 }));
	const score = rows.reduce((n, r) => n + r.points, 0);
	return { rows, score, gate, deadline, accepted: score === 100 && gate.started && gate.inTime, repoUrl: info.html_url, head: commits[0]?.sha };
}
