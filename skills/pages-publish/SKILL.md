---
name: pages-publish
description: Publish a page (a folder with an index.html or index.md, or a single .html or .md file) to a public link on pages.flisk.si/@<github login>/<name>, or publish a new version of one, or take one down. Use when the user asks to publish, share, host or put online a page, dashboard, explainer, report or prototype the agent built, to "make it a link", or mentions pages.flisk.si. To share with only certain people, use `share` (asks who, one locked link per person). Not for deploying apps with a server.
---

# Publish to pages.flisk.si

A space is one page that becomes `https://pages.flisk.si/@<login>/<slug>/`, where `<login>` is the user's GitHub
login lowercased. It is **public**: the page and its source on GitHub. The CLI is `bin/pages.mjs` in this plugin, two
folders up from this file, and runs on `node` (18+) or `bun` (`bun "$PAGES" …`) with nothing installed.

- **Signed in to the GitHub CLI** (`gh auth status`): each publish is a pull request from the user's own fork, live at
  `/@<login>/<slug>/`. Any page: HTML or Markdown, one file or a folder.
- **Not signed in**: a Markdown page (one `.md` file, or a folder holding only `index.md`) is published anonymously
  at `/@anon/<id>/`, with a random name. Publishing the same path again adds a version; `remove <path>` takes it
  down. HTML needs the GitHub CLI: tell the user to run `gh auth login`, or offer the page as Markdown.

```bash
PAGES="<this skill's base directory>/../../bin/pages.mjs"
node "$PAGES" check ./my-page                              # the publish check, nothing sent
node "$PAGES" publish ./my-page --slug my-page --wait      # the link, once it answers
node "$PAGES" share ./page.html --to alice --to bob --wait  # only named people; ASK the user who first, never guess
node "$PAGES" publish ./notes.md --wait                    # one file is fine; not signed in, it goes to /@anon/
node "$PAGES" remove my-page                               # take it down (or: remove ./notes.md for an anonymous one)
```

## Steps

1. **Find the page.** A folder with `index.html` or `index.md` at its top, or a single `.html` or `.md` file, which
   becomes the index. Give the page a `<title>` and a `<meta name="description">`; the gallery and link previews use
   them.
2. **Pick the slug**: lowercase letters, digits and dashes, from what the page is (`gpu-explainer`, not `index`).
   The same slug again publishes a **new version** of that space; a new slug makes a new space. When the user names an
   existing space, reuse its slug.
3. **Run `check`** and fix every `✗` line before going further (see "Making a page pass"). `!` lines are worth fixing
   but do not stop a publish. Never edit the check or work around it: change the page.
4. **Say it will be public** and confirm, unless the user already asked to publish it: the page and its files become
   public on pages.flisk.si and in the github.com/flisk-sh/pages repository. Do not publish anything holding secrets,
   API keys, personal data or private documents.
5. **Run `publish … --wait`.** Signed in, it forks flisk-sh/pages (once), opens a pull request, waits for the
   workflow's answer, then for the link to answer. Not signed in, it sends the Markdown to publish.flisk.si and prints
   the link and a manage link. Give the user the link it prints and, for an anonymous space, the manage link. If it
   answers `✗`, fix what it lists, then publish again.

## Making a page pass

| Problem (`[rule]`) | Fix |
| --- | --- |
| `script-src`, `style-src` | Copy the file into the folder, or load it from cdnjs.cloudflare.com, cdn.jsdelivr.net, unpkg.com, esm.sh or cdn.tailwindcss.com, pinned to an exact version. |
| `connect-src` | Put the data in the folder (`data.json`, `data.csv`) and `fetch("data.json")`. Only the space itself, those CDNs, api.github.com and raw.githubusercontent.com can be fetched. |
| `form-action` | A form may only submit to the page itself; handle `submit` in script. |
| `password` | Remove it. Spaces may not ask for passwords. |
| `frame-src` | Only giscus.app, www.youtube-nocookie.com and player.vimeo.com can be embedded. Link to anything else. |
| `svg-script` | Remove scripts and `on…=` handlers from SVG files. |
| `name`, `symlink`, `extension` | Remove hidden files and links; keep to web file types (html, css, js, json, csv, images, fonts, audio, video, pdf). |
| `size` | At most 300 files, 10 MB in all, 5 MB per file. |

Every page gets a Content-Security-Policy with the same rules and a small bar in the corner (publisher, version,
source, report). Markdown is rendered like a GitHub README, with no scripts. For comments, the user can add giscus
with their own repository; Pages runs no service and holds no keys.

## Taking a space down

`node "$PAGES" remove <slug>` opens an issue titled `Remove @<login>/<slug>`; it is removed at once because the user
is its publisher. The versions stay in git history.
