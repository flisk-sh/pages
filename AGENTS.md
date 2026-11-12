# AGENTS.md

Rules for AI coding agents working in this repo.

## Pull request workflows must never run pull request code

`.github/workflows/publish.yml` runs on `pull_request_target`, so it has write tokens (`contents`, `pull-requests`,
`pages`, `actions`). It is safe only because it checks out `ref: main` and reads the pull request's files as data
(`git archive`). Do not change the checkout to the pull request head, and do not install, import or run anything from
the pull request's files. `publish-anon.yml` and `remove.yml` follow the same pattern.

`services/app/web/tests/workflows.test.ts` fails if a workflow does. Run it with `cd services/app/web && bun test`.

## Secrets

The publish Worker (`services/app/publish`) holds `GITHUB_TOKEN` (write access to this repo), `GITHUB_CLIENT_SECRET`
and `SESSION_SECRET`. Never print them or commit them. Local copies live in `.dev.vars` and `.env`, which are ignored.
