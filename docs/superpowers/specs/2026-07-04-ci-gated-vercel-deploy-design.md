# CI-Gated Vercel Deployment — Design

**Date:** 2026-07-04
**Status:** Approved (design)

## Problem

The repo already has a CI **validation** gate (`.github/workflows/ci.yml`:
lint → typecheck → test → build) but no intentional **deploy** step. Deployment
is currently handled by Vercel's native Git integration, which deploys on every
push *independently of CI* — a failing test or broken build can still reach
production.

We want continuous deployment where **a deploy happens only if CI passes**:

- Pull requests → **preview** deployment (ephemeral URL posted as a PR comment)
- Push to `main` → **production** deployment
- Push to `develop` → CI validation only, no deploy

## Approach

Extend the existing single workflow (`ci.yml`) with two deploy jobs gated on the
existing `verify` job via `needs:`. GitHub's `needs:` only works between jobs in
the same workflow, so keeping one file is what makes the "deploy only if CI
passes" gate possible without the more complex `workflow_run` cross-workflow
plumbing.

Deploys use the **official Vercel CLI** (`npx vercel ...`), not a third-party
marketplace action, to avoid adding an unpinned action to the supply chain (the
existing workflow SHA-pins every action; a `someone/vercel-action@v25` would
undercut that).

### Workflow shape

```
ci.yml
├── verify              (lint→typecheck→test:coverage(95%)→build; all PRs + pushes)
├── deploy-preview      needs: verify → PRs (same-repo) → preview URL as PR comment
└── deploy-production   needs: verify → push to main    → production deploy
```

### Coverage gate (95%)

`verify`'s test step changes from `npm test` (`vitest run`) to
**`npm run test:coverage`** (`vitest run --coverage`). The 95% thresholds
(statements / branches / functions / lines) already live in `vitest.config.ts`,
so this one-line swap makes any drop below 95% fail `verify` → block all deploys.

**Prerequisite — close the branch-coverage gap first.** As of 2026-07-04 actual
coverage is: statements 95.23%, functions 98.01%, lines 95.44% (all pass) but
**branches 93.43% (fails)**. Turning on the gate before fixing this would block
every deploy. The dominant cause is `src/lib/services/refresh-lock.ts` at 0%
coverage (~10 uncovered branches).

Fix (chosen approach — keep the bar a real 95%):

1. Add unit tests for `refresh-lock.ts` (real fail-closed lock logic, worth
   testing on its own merit): mock `@upstash/redis` + env vars and cover —
   - no-Redis fallback: acquire when free (true) and when already locked (false),
     release resets the flag;
   - Redis present: `SET NX PX` returns `"OK"` (acquired) vs not-`"OK"` (busy);
   - Redis error on acquire → fail-closed (returns false, warns);
   - Redis error on release → swallowed (non-fatal).
2. Re-run `npm run test:coverage`; if branches still <95%, add a few targeted
   branch tests (next-largest gaps: `lib/import` parsers/engine, `lib/rate-limit`
   stores).
3. Only once coverage is green at 95%, switch `verify` to `test:coverage`.

This work is done via the test-driven-development / testing conventions already
used in `src/__tests__/`.

### Job triggers / conditions

The workflow continues to trigger on:

```yaml
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
```

- `verify` — runs on every trigger (unchanged).
- `deploy-preview` — `needs: verify`; runs only when
  `github.event_name == 'pull_request'` **and** the PR is from the same repo:
  `github.event.pull_request.head.repo.full_name == github.repository`.
- `deploy-production` — `needs: verify`; runs only when
  `github.event_name == 'push' && github.ref == 'refs/heads/main'`.

### Deploy steps (per deploy job)

```
1. actions/checkout@<sha>
2. actions/setup-node@<sha>  (node 22, cache: npm)
3. npx vercel pull  --yes --environment=<preview|production> --token=$VERCEL_TOKEN
4. npx vercel build [--prod]                                  --token=$VERCEL_TOKEN
5. npx vercel deploy --prebuilt [--prod]                      --token=$VERCEL_TOKEN
   → capture the deployment URL to $GITHUB_OUTPUT
6. (preview only) post/update the URL as a PR comment
```

`VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` are exported as env for the whole job so
`vercel pull` resolves the right project non-interactively.

Note: this rebuilds the app in the deploy job (in addition to `verify`'s
`npm run build`). The redundancy is accepted for a clean gate/deploy separation;
it only occurs on deploying refs (PRs and `main`), not on `develop`.

## Security

Applied from the CI/CD-pipeline and secret-leakage checklists:

- **Least-privilege, per-job permissions**
  - top-level default: `permissions: contents: read`
  - `deploy-preview`: `contents: read`, `pull-requests: write` (to comment URL)
  - `deploy-production`: `contents: read`
- **Fork-PR guard** on `deploy-preview`
  (`...head.repo.full_name == github.repository`) so a fork PR can never expose
  `VERCEL_TOKEN`.
- **No `${{ github.event.* }}` inside `run:`** — any event data reaches shell
  only via `env:`.
- **SHA-pinned actions** kept; Vercel invoked via `npx` (no new action).
- **Secrets** live only in GitHub Actions secrets; `.vercel/` is already
  gitignored so `orgId`/`projectId`/tokens never get committed.
- **Optional** `production` GitHub Environment with a required-reviewer rule for a
  manual approval click before prod. Omitted by default (solo maintainer); can be
  added later by setting `environment: production` on `deploy-production`.

### Secrets required (GitHub → Settings → Secrets and variables → Actions)

| Name | What | Secret? |
|------|------|---------|
| `VERCEL_TOKEN` | Scoped Vercel access token | Yes (true secret) |
| `VERCEL_ORG_ID` | From `.vercel/project.json` | Identifier (stored as secret by convention) |
| `VERCEL_PROJECT_ID` | From `.vercel/project.json` | Identifier |

## Prerequisite: disable Vercel native auto-deploy

Critical — otherwise every push deploys **twice**: once by Vercel's Git
integration (ungated) and once by the gated CI job.

In the Vercel dashboard → Project → Settings → **Git**, disconnect the Git
integration's automatic builds, OR set the **Ignored Build Step** to always skip
(`exit 0` via a "don't build" command), so Vercel builds/deploys **only** when
triggered by the CLI from CI.

## Manual setup checklist (owner, one-time)

1. `npx vercel link` locally → confirm it writes `.vercel/project.json`.
2. Read `orgId` and `projectId` from `.vercel/project.json`.
3. Create a Vercel token (Vercel → Account Settings → Tokens), scoped to this
   project/team.
4. Add the 3 GitHub Actions secrets above.
5. Disable Vercel native auto-deploy (see prerequisite).
6. Merge the workflow change; open a test PR to confirm a preview URL appears,
   then merge to `main` to confirm production deploys.

## Database migrations — out of scope (stay manual)

CD does **not** run database migrations. It builds and deploys the Next.js app
only. Supabase migrations continue to be applied **by hand** in the Dashboard
SQL editor, exactly as today.

Decided against automating for now because:

- The project is not CLI-linked and migrations were applied manually, so the
  remote `supabase_migrations.schema_migrations` history is out of sync — a first
  `supabase db push` would try to re-apply `000…005` and fail. Automating would
  first require baselining (`supabase migration repair`) and reconciling the
  bespoke numeric filenames with the CLI's version tracking.
- Auto-running hand-written DDL/RPC SQL against prod from CI is the riskiest
  possible CD step and has no easy rollback, unlike an app redeploy.
- Schema changes are infrequent for a personal tool; the manual step is cheap.

**Operational rule:** apply a migration in the Dashboard **before** merging the
app change that depends on it, so production code never runs against a schema
that lacks the column/RPC it expects. (Migrate first, then deploy.)

This can be revisited later — a manual-approval-gated `migrate` job (`supabase
db push` between `verify` and `deploy-production`, behind a GitHub Environment)
is the natural upgrade path if the manual step becomes a burden.

## Out of scope

- Database migrations (see section above — intentionally kept manual).
- `develop` → staging environment (chosen against; CI-only for `develop`).
- Production manual-approval gate (documented as optional, not enabled).
- Rollback automation, deploy notifications beyond the PR comment.

## Testing / verification

CI/CD workflows can't be unit-tested; verification is behavioral:

- Open a PR → `deploy-preview` runs after `verify`, a preview URL is commented,
  and the URL loads.
- Push a failing change (or one that drops coverage below 95%) → `verify` fails
  → **no** deploy job runs.
- Merge to `main` → `deploy-production` runs and updates the production URL.
- Push to `develop` → only `verify` runs.
