# Flisk launch template

A small, free web tool you can put on Product Hunt this week: **one service, no database, no API keys**, with the
SEO, icons and launch kit already done. Built and run locally with [Flisk](https://github.com/flisk-sh/flisk), hosted
for free on Render.

The example tool is **Contrast**: put two colors in the address (`/1d1c1a/fbfaf7`) and get the WCAG contrast ratio,
AA/AAA verdicts and the nearest color that passes. Replace it with your own; everything around it stays.

[Citable](https://github.com/flisk-sh/citable) and [Helpdock](https://github.com/flisk-sh/helpdock) are built the
same way.

## What is already done

| | Where |
| --- | --- |
| Title, description, canonical, robots meta, theme color per scheme | `src/seo.ts` → `head()` |
| Open Graph and X/Twitter card with a 1200×630 image | `head()`, `brand/og.svg` |
| JSON-LD: WebSite, Organization, WebApplication, FAQPage, BreadcrumbList | `jsonLd()`, `faqJsonLd()` |
| `robots.txt` that names the AI answer crawlers, keeps out the API, points at the sitemap | `robotsTxt()` |
| `sitemap.xml`, `llms.txt`, `site.webmanifest`, `/.well-known/security.txt` | `src/seo.ts` |
| favicon.ico (16/32/48), icon.svg, apple-touch-icon, 192/512 PNG, maskable icon | `brand/*.svg` → `bun run icons` → `src/assets.generated.ts` |
| One address per result (other spellings 301), a noindex 404 page | `src/app.ts` |
| A JSON API, an embeddable SVG badge and an MCP server (Streamable HTTP, no key) | `src/app.ts`, `src/mcp.ts` |
| No JavaScript at all; a Content-Security-Policy that allows none | `src/guard.ts` |
| Rate limits per client behind Render's proxy or Cloudflare | `src/guard.ts` |
| Tests that fail when a page loses its title, canonical, card or JSON-LD, or an icon goes missing | `tests/seo.test.ts` |
| CI: typecheck, lint, tests, and the production image started and asked for its SEO files | `.github/workflows/ci.yml` |
| Free hosting: one Render web service | `render.yaml`, `Dockerfile`, [DEPLOY.md](DEPLOY.md) |
| Product Hunt kit: ICE scoring, taglines, gallery, first comment, checklist | [LAUNCH.md](LAUNCH.md) |

## Make it yours

Click **Use this template** on GitHub, clone your copy, then:

```bash
cd services/app/web
bun install
bun run rename --name "Acme" --domain acme.example.com --repo you/acme
```

1. `src/site.ts`: the tagline (60 characters at most), the description (110 to 160), the FAQ and the examples. Every
   tag, JSON-LD node and SEO file is built from it.
2. `src/contrast.ts`: replace it with your tool. Keep the shape: input from the address, a result object, one
   function that the page, the API and the MCP tool all call. Then update `src/pages.ts`, the routes in
   `src/app.ts` and the tool in `src/mcp.ts`.
3. `brand/icon.svg`, `brand/icon-full.svg` (full-bleed, for the maskable and Apple icons) and `brand/og.svg`, then
   `bun run icons`. It embeds them in `src/assets.generated.ts`, because Flisk's image ships `src/` only.
4. `bun test`: the SEO tests tell you what you broke.

If the tool fetches other sites, take the SSRF guard (`src/net.ts`) from
[Citable](https://github.com/flisk-sh/citable/blob/main/services/app/web/src/net.ts) and use `Slots` and `TtlCache`
from `src/guard.ts` to cap and cache the work.

## Run it

With Flisk (Docker, Tilt and the [Flisk CLI](https://github.com/flisk-sh/flisk)):

```bash
flisk up
```

It opens at http://api.flisk-template-launch.localhost/api/web/ (the name follows `.flisk/project.json`). The app
never touches a database. Flisk still starts its shared Postgres container locally even though `.flisk/project.json`
leaves it out; online there is none.

Without Flisk:

```bash
cd services/app/web && bun install && bun run dev
```

## Settings

All optional. `PORT`, `PUBLIC_URL` (the address people use, for canonical links and the card; set it online),
`TRUST_PROXY` (`none`, `last-forwarded` on Render, `cloudflare`) and `CALLS_PER_MINUTE` (API and MCP, 120).

## Checks

```bash
cd services/app/web
bun run typecheck && bun run lint && bun test
```

MIT licensed.
