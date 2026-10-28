---
name: pages-publish
description: Publish a folder (an index.html with its files, or an index.md) to a public link on pages.flisk.si/@<github login>/<name>, or publish a new version of one, or take one down. Use when the user asks to publish, share, host or put online a page, dashboard, explainer, report or prototype the agent built, to "make it a link", or mentions pages.flisk.si. Not for deploying apps with a server, or for private pages.
---

# Publish to pages.flisk.si

A space is one folder that becomes `https://pages.flisk.si/@<login>/<slug>/`, where `<login>` is the user's GitHub
login lowercased. It is **public**: the page and its source on GitHub. Each publish is a pull request from the user's
own fork, so it needs `git` and the GitHub CLI signed in (`gh auth status`). Nothing else is installed: the CLI is
`bin/pages.mjs` in this plugin, two folders up from this file, and runs on `node` (18+) or `bun`.

```bash
PAGES="<this skill's base directory>/../../bin/pages.mjs"
node "$PAGES" check ./my-page                              # the publish check, nothing sent
node "$PAGES" publish ./my-page --slug my-page --wait      # pull request, then the link
node "$PAGES" remove my-page                               # take it down
```

## Steps

1. **Find the folder.** It must have `index.html` or `index.md` at its top. A single HTML file: put it in a folder of
   its own as `index.html`. Give the page a `<title>` and a `<meta name="description">`; the gallery and link previews
   use them.
2. **Pick the slug**: lowercase letters, digits and dashes, from what the page is (`gpu-explainer`, not `index`).
   The same slug again publishes a **new version** of that space; a new slug makes a new space. When the user names an
   existing space, reuse its slug.
3. **Run `check`** and fix every `✗` line before going further (see "Making a page pass"). `!` lines are worth fixing
   but do not stop a publish. Never edit the check or work around it: change the page.
4. **Say it will be public** and confirm, unless the user already asked to publish it: the page and its files become
   public on pages.flisk.si and in the github.com/flisk-sh/pages repository. Do not publish anything holding secrets,
   API keys, personal data or private documents.
5. **Run `publish … --wait`.** It forks flisk-sh/pages (once), opens a pull request, and waits for the workflow's
   answer. Give the user the link it prints, `https://pages.flisk.si/@<login>/<slug>/`, which works a minute or two
   after `✓ Published`. If the workflow answers `✗`, fix what it lists, then publish again.

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
