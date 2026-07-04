# Deployment

CI/CD is defined in `.github/workflows/ci.yml`. Every push/PR runs the `verify`
gate (lint → typecheck → 95%-coverage tests → build). Deploys happen **only if
`verify` passes**:

- **Pull request (same repo)** → Vercel **preview**; the URL is posted as a PR comment.
- **Push to `main`** → Vercel **production**.
- **Push to `develop`** → `verify` only, no deploy.

Deploys run via the Vercel CLI from GitHub Actions — Vercel's own Git
auto-deploy must be turned off (see step 4) so pushes don't deploy twice.

## Database migrations are manual

CI does **not** run database migrations. Apply Supabase migrations by hand in the
Dashboard SQL editor **before** merging the app change that depends on them
(migrate first, then deploy), so production code never runs against a schema
missing a column or RPC it expects.

## One-time setup

1. **Link the project to Vercel** (writes `.vercel/project.json`, which is gitignored):

   ```bash
   npx vercel link
   ```

2. **Read the IDs** from `.vercel/project.json`:

   ```bash
   cat .vercel/project.json   # note "orgId" and "projectId"
   ```

3. **Create a Vercel token**: Vercel → Account Settings → Tokens → create a token
   scoped to this project/team.

4. **Add three GitHub Actions secrets** (repo → Settings → Secrets and variables → Actions → New repository secret):

   | Secret | Value |
   |--------|-------|
   | `VERCEL_TOKEN` | the token from step 3 |
   | `VERCEL_ORG_ID` | `orgId` from step 2 |
   | `VERCEL_PROJECT_ID` | `projectId` from step 2 |

5. **Disable Vercel's native auto-deploy** so only CI deploys: Vercel → Project →
   Settings → Git → disconnect automatic production/preview builds (or set the
   **Ignored Build Step** to always skip). Deploys now come only from CI.

## Verify it works

1. Open a PR → after `verify` passes, `deploy-preview` runs and comments a
   preview URL; open it to confirm it loads.
2. Push a change that fails a test or drops coverage below 95% → `verify` fails →
   no deploy runs.
3. Merge to `main` → `deploy-production` runs and updates the production URL.

## Optional: require approval before production

Add a GitHub Environment named `production` with a required reviewer, then add
`environment: production` to the `deploy-production` job in `ci.yml`. Production
deploys will then wait for a one-click approval.
