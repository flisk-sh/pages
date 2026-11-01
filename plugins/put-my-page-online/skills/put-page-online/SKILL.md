---
name: put-page-online
description: Put a web page online as a free public link. Use when the user says put my page online, publish my page, host this HTML, make a link to share this, share this dashboard or demo, or deploy this page for free.
---

# Put a page online

The link looks like `https://pages.flisk.si/@<github name>/<page name>/`. It is **public**: anyone can open the page and read its source. Always say that before publishing, and ask first.

1. Get the page: one `.html` file, a folder with an `index.html`, or one `.md` file for a text page.
2. Check it with `check_page` from the `put-my-page-online` server: pass the file's text in `content` and its name in `name`. If `ready` is false, fix every item in `problems` (they are plain-words fixes, for example "copy the script into the page"), then check again. Mention `worth_fixing` items, but they do not block.
3. Ask the user who it is for. If anyone may see it, ask: "This will be public at pages.flisk.si. Put it online?" If only certain people, use `share` instead of `publish` (step 4) and ask the user for their names; never guess them.
4. Put it online by running, in the user's terminal: `npx -y @flisk-sh/pages publish <file or folder> --wait`. An `.html` page needs the GitHub CLI signed in (`gh auth login`); a single `.md` page does not. For certain people only: `npx -y @flisk-sh/pages share <file> --wait`, which asks who and prints one locked link per person (or add `--to alice --to bob`). Send each person only their own link. It needs one self-contained `.html` page. To take someone out, share again without them; to take the page down, `pages remove <name>`. Without a terminal, give the user the command to run.
5. Tell the user the link when it answers. Publishing the same name again adds a new version.

`how_to_put_page_online` returns the steps, the limits and the rules (no password fields, no crypto wallet prompts, no code from unknown sites). The tools only check and explain; nothing is published or stored by the server.
