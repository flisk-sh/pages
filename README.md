# Pages

**Your agent builds a page. One command makes it a link.** Interactive pages (dashboards, explainers, comparisons,
app mockups) published to `https://pages.flisk.si/@<github login>/<name>/`. Free and public, no keys, no database:
every space is a git branch of this repository, and the site is static on GitHub Pages.

## Publish

One command, nothing to install (node 18+, or `bunx` in place of `npx`):

```bash
npx -y @flisk-sh/pages publish page.html --wait     # or a folder with an index.html or index.md
```

A page is a folder with an `index.html` or `index.md`, or a single `.html` or `.md` file, which becomes the index.
Signed in to the GitHub CLI (`gh auth login`), it goes live at `/@<your login>/<name>/` through a pull request from
your fork. Not signed in, a Markdown page (one `.md` file) is published anonymously at `/@anon/<id>/`; its key is
kept in `~/.config/pages/anon.json`, so the same command adds a version and `pages remove <path>` takes it down. HTML
needs the GitHub CLI. `--wait` waits until the link answers.

From Claude Code, the plugin adds the `pages-publish` and `pages-check` skills:

```bash
claude plugin marketplace add flisk-sh/pages
claude plugin install pages@flisk-pages
```

then ask: *publish ./my-page to pages*. From a checkout, `node bin/pages.mjs` is the same CLI:

```bash
git clone --depth 1 https://github.com/flisk-sh/pages && cd pages
node bin/pages.mjs check ../my-page
node bin/pages.mjs publish ../my-page --slug my-page --wait
```

The npm package is released by `.github/workflows/release-cli.yml` when a `cli-v<version>` tag matching
`bin/package.json` is pushed.

Or by hand in the browser: [add a file](https://github.com/flisk-sh/pages/new/main?filename=spaces/YOUR-LOGIN/my-page/index.md)
at `spaces/<your login>/<name>/index.md` and propose the change. GitHub makes the fork and the pull request for you.

## GitHub Action

Check a page in CI with the same rules the publish runs, and publish it when you want. The check needs no keys and
puts the result on the job summary; the job fails when the page has problems.

```yaml
- uses: actions/checkout@v4
- uses: flisk-sh/pages@v1
  with:
    path: my-page            # a folder with index.html or index.md, or one .html or .md file
```

`command: publish` puts it online too, with no secret: the job's GitHub OIDC token says which repository it is, and
the page goes live at `https://pages.flisk.si/@<repository owner>/<slug>/` (the slug defaults to the folder name).
Publishing again adds a version. Good for a report, benchmark or demo your CI already builds:

```yaml
on:
  push:
    branches: [main]
permissions:
  contents: read
  id-token: write          # lets the job prove which repository it is; no key to set up
jobs:
  page:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./build-report.sh   # writes report/index.html (or index.md)
      - uses: flisk-sh/pages@v1
        id: pages
        with:
          path: report
          command: publish
          slug: benchmarks
      - run: echo "${{ steps.pages.outputs.url }}"
```

`--wait` (on by default) waits until the new version is live, not just until the link answers. To take the page
down, run the Action with `command: remove` and the same `slug` (or open an issue titled `Remove @<owner>/<slug>`
as the owner or, for an organization, as a public member of it).

Anyone who can run a workflow in a repository of that owner can publish under `/@<owner>/`. Pull requests from forks
get no OIDC token, so publish on `push` to your main branch. To publish under your own login through a pull request
instead, give a `token` (a personal access token that can fork and open pull requests). The Action runs the CLI from
its own tagged checkout, so the version you pin is the version that runs.

## Put My Page Online (Claude directory)

For people who just want a link: the `put-my-page-online` plugin (`plugins/put-my-page-online`) and a remote, read-only MCP server at `https://pages.flisk.si/mcp` (`workers/pages-mcp`, no key, nothing stored). `check_page` runs the same rules as the publish on a pasted page and says what to fix in plain words; `how_to_put_page_online` gives the steps and the one command. Publishing itself stays `npx -y @flisk-sh/pages publish page.html --wait`, because it needs your own GitHub login. Limits: 30 calls per IP per minute and 300 per hour (`src/limits.js`, Cache API counters like the demo worker), 256 KB per request.

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
| Publish from GitHub Actions (OIDC, no key): `POST publish.flisk.si/v1/ci/spaces` → `publish-anon.yml` | `services/app/publish/src/worker.js`, `scripts/publish-anon.ts` |
| The CLI (npm: `@flisk-sh/pages`) | `bin/pages.mjs`, `bin/lib.mjs`, `bin/package.json` |
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
