# Pages

**Your agent builds a page. One command makes it a link.** Interactive pages (dashboards, explainers, comparisons,
app mockups) published to `https://pages.flisk.si/@<github login>/<name>/`. Free and public, no keys, no database:
every space is a git branch of this repository, and the site is static on GitHub Pages.

## Publish

From Claude Code:

```bash
claude plugin marketplace add flisk-sh/pages
claude plugin install pages@flisk-pages
```

then ask: *publish ./my-page to pages*. Without an agent (git and `gh auth login` needed, node 18+ or bun):

```bash
git clone --depth 1 https://github.com/flisk-sh/pages && cd pages
node bin/pages.mjs check ../my-page
node bin/pages.mjs publish ../my-page --slug my-page --wait
```

Or by hand in the browser: [add a file](https://github.com/flisk-sh/pages/new/main?filename=spaces/YOUR-LOGIN/my-page/index.md)
at `spaces/<your login>/<name>/index.md` and propose the change. GitHub makes the fork and the pull request for you.

## How it works

```
your folder ──PR from your fork──▶ publish.yml ──check──▶ branch space/<login>/<name> ──▶ deploy.yml ──▶ GitHub Pages
            (spaces/<login>/<name>/ only)    (reads files, runs nothing)  (one commit per version)   (every branch, checked again)
```

| | Where |
| --- | --- |
| The rules: hosts, password fields, forms, frames, wallets, sizes | `services/app/web/src/check.mjs` (no dependencies) |
| The policy and the bar every page gets; Markdown rendering | `services/app/web/src/spaces.ts` |
| Home, a publisher's page, about, 404, `spaces.json`, sitemap, `llms.txt` | `services/app/web/src/pages.ts`, `src/app.ts`, `src/seo.ts` |
| Branches → `_site/` | `services/app/web/scripts/build.ts` |
| Pull request → branch, issue → removal | `scripts/publish-pr.ts`, `scripts/remove-issue.ts`, `.github/workflows/` |
| The CLI | `bin/pages.mjs` |
| The Claude Code plugin: `pages-publish`, `pages-check` | `.claude-plugin/`, `skills/` |
| Skill evals (`claude plugin eval . --scaffold --allow-tools Bash Edit Write`) | `evals/` |

- **The same name again is a new version**: another commit on `space/<login>/<name>`, whose history is the version list.
- **Remove**: open an issue titled `Remove @<login>/<name>` (or `node bin/pages.mjs remove <name>`). It goes at once
  when you published it. Maintainers remove reported spaces with the `remove` label.
- **Report**: every page has a Report link in its corner bar.
- **Maintainers** can publish a space the check refused by adding the `publish` label to its pull request. The commit
  records `Pages-Approved-By:`.

## Develop

```bash
cd services/app/web
bun install
bun test                     # the check, the pages, the SEO files, the workflow scripts, the eval fixtures
git fetch origin '+refs/heads/space/*:refs/remotes/origin/space/*'
bun run build                # _site/, as deployed
bun run dev                  # preview on :4000 with the spaces the last build gathered
```

`flisk up` runs the same preview under [Flisk](https://github.com/flisk-sh/flisk). Launch plan: [LAUNCH.md](LAUNCH.md).
