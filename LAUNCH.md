# Launch kit: Pages

**Rules.** The maker posts from their own personal account. No vote requests, no vote swaps, no new accounts. Ask
people to look and comment, never to upvote.

## 1. Why this (ICE, 1–10)

| Idea | Seen on PH as | Impact | Confidence | Ease | ICE |
| --- | --- | --- | --- | --- | --- |
| **Publish an agent's page to a public link: git-backed, forkable, no account beyond GitHub** | spacesheep, tiiny.host, Claude artifacts | 7 | 6 | 7 | **6.7** |
| A straight spacesheep clone, public and static | spacesheep | 6 | 5 | 7 | 6.0 |
| A curated gallery of explainers, one branch each | — | 5 | 4 | 8 | 5.7 |

The angle: no signup, no keys, nothing hosted that can break; it is just git. We leave out private spaces, teams,
signing and live streams.

## 2. The listing

- **Name**: Pages (pages.flisk.si)
- **Tagline** (60 at most):
  1. Your agent builds a page. One command makes it a link.
  2. Publish what your AI agent builds, free, as a git branch
  3. Agent-made pages on a public link. No keys, no database.
- **Description** (260 at most): Ask Claude Code to publish a folder and get pages.flisk.si/@you/name. Interactive
  HTML or Markdown, checked for phishing patterns, free, public. Every space is a git branch: versions are commits,
  and the source is one click away.
- **Topics**: Developer Tools, Artificial Intelligence, Open Source
- **Links**: https://pages.flisk.si, https://github.com/flisk-sh/pages
- **Thumbnail**: https://pages.flisk.si/icon-512.png

## 3. Gallery (1270×760, five images, from the live site)

1. Claude Code: "publish ./gpu-explainer to pages", then the link.
2. A real space: an interactive explainer with its corner bar.
3. The pull request: check passed, "✓ Published version 2", link.
4. A roadmap-style visual space (compass or comparison).
5. The branch list on GitHub: one branch per space, history = versions.

## 4. Maker's first comment

> Hi, I'm … I built Pages because my agent kept making good pages that lived only on my laptop.
>
> How it works: the plugin opens a pull request from your fork; a workflow checks the files (no password fields, no
> forms posting away, scripts only from known CDNs), commits them to their own branch, and GitHub Pages serves them.
>
> It is free and stores nothing outside git. Everything is public, by design. The code is on GitHub: …
>
> What would you publish first?

## 5. Before launch day

- [ ] Pages enabled (GitHub Actions source), custom domain pages.flisk.si, HTTPS enforced.
- [ ] Labels exist: `publish`, `remove`, `needs-review`, `report`, `remove-request`.
- [ ] One publish end to end from a non-member account, one removal, one refused page.
- [ ] 10–15 real example spaces seeded (roadmap visuals, restaurant/ERP stacks, explainers).
- [ ] Sitemap submitted to Google Search Console and Bing.
- [ ] Gallery recorded from the live site.
- [ ] Launch scheduled for 00:01 Pacific; you are free that day to answer every comment.

## 6. Launch day

- Post the maker comment as soon as it is live.
- Answer every comment within the hour; watch the `report` label.
- Share it where you already talk to people. Say what it does and link it; do not ask for votes.
