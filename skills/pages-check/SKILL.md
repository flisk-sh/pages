---
name: pages-check
description: Check whether a page or folder meets the pages.flisk.si publishing rules (allowed script and fetch hosts, no password fields, no forms posting away, size limits) and fix what fails, without publishing. Use when the user asks if a page "will pass", to validate or lint a page for pages.flisk.si, or when building a page meant to be published there. Not for general HTML, accessibility or CSS linting.
---

# Check a page for pages.flisk.si

The check is the one the publish workflow runs: `bin/pages.mjs` in this plugin, two folders up from this file, on
`node` (18+) or `bun`. It reads the files as text and sends nothing.

```bash
node "<this skill's base directory>/../../bin/pages.mjs" check ./my-page
```

It prints one line per finding, `✗` for a problem that stops a publish and `!` for one worth fixing, each ending in
its rule, then `✓ ready to publish` or the count of problems. Exit code 0 means it would pass.

## Fixing

Fix the page, never the check. For each `✗`:

- `[index]`: the folder needs `index.html` or `index.md` at its top.
- `[script-src]` / `[style-src]`: copy the file into the folder, or load it over https from cdnjs.cloudflare.com,
  cdn.jsdelivr.net, unpkg.com, esm.sh or cdn.tailwindcss.com (fonts also from fonts.googleapis.com), pinned to an
  exact version.
- `[connect-src]`: the page fetches from a host it may not. Save the data into the folder and fetch it by relative
  path. Allowed: the space, those CDNs, api.github.com, raw.githubusercontent.com.
- `[form-action]`: forms may submit only to the page itself; handle `submit` in script.
- `[password]`: remove the password field.
- `[frame-src]`: only giscus.app, www.youtube-nocookie.com, player.vimeo.com; link to anything else.
- `[redirect]`, `[base]`: remove the meta refresh to another site, or the `<base>` element.
- `[wallet]`, `[miner]`: not allowed on pages.flisk.si; remove it.
- `[svg-script]`: remove `<script>` and `on…=` attributes from the SVG.
- `[name]`, `[symlink]`, `[file-type]`, `[extension]`: remove hidden files, links and non-web files.
- `[size]`: at most 300 files, 10 MB in all, 5 MB per file; compress images or drop unused files.

For `!` lines: add a `<title>` and a `<meta name="description">`; replace `javascript:` links with buttons.

Run the check again until it prints `✓ ready to publish`, then tell the user what you changed. Publishing is the
`pages-publish` skill.
