# CI-Gated Vercel Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CI-gated continuous deployment to Vercel — deploy only when lint, typecheck, 95%-coverage tests, and build all pass; PRs get preview deploys, `main` gets production.

**Architecture:** Extend the single existing workflow `.github/workflows/ci.yml`. Its `verify` job becomes the gate (now enforcing 95% coverage). Two new jobs, `deploy-preview` and `deploy-production`, declare `needs: verify` so a deploy only starts after the gate is green. Deploys use the official Vercel CLI (no new marketplace action). Database migrations stay manual.

**Tech Stack:** GitHub Actions, Node 22, Vitest (v8 coverage), Vercel CLI, `gh` CLI (preinstalled on runners).

**Spec:** `docs/superpowers/specs/2026-07-04-ci-gated-vercel-deploy-design.md`

## Global Constraints

- **Node version:** `22` (matches existing `verify` job).
- **Pin third-party actions to commit SHAs** with a `# v4`-style comment. Reuse the SHAs already in `ci.yml`:
  - `actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4`
  - `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4`
- **Least-privilege permissions per job.** Top-level default stays `contents: read`. Only `deploy-preview` gets `pull-requests: write`.
- **Never interpolate `${{ github.event.* }}` inside a `run:` step** — pass event data via `env:` and reference the shell variable.
- **Coverage thresholds are 95%** (statements / branches / functions / lines), already set in `vitest.config.ts` — do not lower them.
- **Database migrations are NOT run by CI** — they stay hand-applied in the Supabase Dashboard.
- **Vercel CLI only** for deploys (`npm install --global vercel`), invoked via `--token`; no third-party deploy action.

---

### Task 1: Unit tests for `refresh-lock.ts` (close the branch-coverage gap)

`src/lib/services/refresh-lock.ts` is at 0% coverage and is the dominant reason branch coverage is 93.43% (< the 95% gate). It is real fail-closed lock logic worth testing. Cover every branch so `npm run test:coverage` passes at 95%.

The module memoizes `redisClient` and holds a module-level `localLocked` boolean, and `getRedis()` reads `process.env` on first call. Tests therefore load a **fresh copy** of the module per case via `vi.resetModules()` + dynamic `import()`, setting env before import.

**Files:**
- Create: `src/__tests__/lib/services/refresh-lock.test.ts`
- Reference (do not modify): `src/lib/services/refresh-lock.ts`, mock patterns in `src/__tests__/lib/rate-limit/redis-store.test.ts`

**Interfaces:**
- Consumes: `acquireRefreshLock(): Promise<boolean>`, `releaseRefreshLock(): Promise<void>` from `@/lib/services/refresh-lock`.
- Produces: nothing consumed by later tasks (this task only raises coverage). Later tasks depend on `npm run test:coverage` exiting 0.

- [ ] **Step 1: Write the failing test file**

Create `src/__tests__/lib/services/refresh-lock.test.ts` with exactly:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoisted so the mock factories can reference them. vi.resetModules() keeps
// mock registrations, and these refs stay stable across re-imports.
const { setMock, delMock, warnMock } = vi.hoisted(() => ({
  setMock: vi.fn(),
  delMock: vi.fn(),
  warnMock: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => ({ set: setMock, del: delMock }) },
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: warnMock, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const REDIS_ENV = {
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "token",
};

// Fresh module copy per test so module-level state (redisClient memo,
// localLocked) resets. Env must be set BEFORE import — getRedis() reads it lazily.
async function loadModule() {
  vi.resetModules();
  return import("@/lib/services/refresh-lock");
}

describe("refresh-lock", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    setMock.mockReset();
    delMock.mockReset();
    warnMock.mockReset();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  describe("without Redis (in-process fallback)", () => {
    it("acquires when free and blocks a second acquire", async () => {
      const { acquireRefreshLock } = await loadModule();
      expect(await acquireRefreshLock()).toBe(true);
      expect(await acquireRefreshLock()).toBe(false);
    });

    it("releasing lets the next acquire succeed", async () => {
      const { acquireRefreshLock, releaseRefreshLock } = await loadModule();
      expect(await acquireRefreshLock()).toBe(true);
      await releaseRefreshLock();
      expect(await acquireRefreshLock()).toBe(true);
    });

    it("uses the fallback when only one Redis env var is set", async () => {
      process.env.UPSTASH_REDIS_REST_URL = REDIS_ENV.UPSTASH_REDIS_REST_URL;
      // TOKEN intentionally unset -> getRedis() returns null
      const { acquireRefreshLock } = await loadModule();
      expect(await acquireRefreshLock()).toBe(true);
      expect(setMock).not.toHaveBeenCalled();
    });
  });

  describe("with Redis", () => {
    beforeEach(() => {
      Object.assign(process.env, REDIS_ENV);
    });

    it("acquires when SET NX returns OK", async () => {
      setMock.mockResolvedValue("OK");
      const { acquireRefreshLock } = await loadModule();
      expect(await acquireRefreshLock()).toBe(true);
      expect(setMock).toHaveBeenCalledWith("price-refresh:lock", "1", {
        nx: true,
        px: 120000,
      });
    });

    it("does not acquire when SET NX returns null (busy)", async () => {
      setMock.mockResolvedValue(null);
      const { acquireRefreshLock } = await loadModule();
      expect(await acquireRefreshLock()).toBe(false);
    });

    it("fails closed and warns when acquire throws an Error", async () => {
      setMock.mockRejectedValue(new Error("boom"));
      const { acquireRefreshLock } = await loadModule();
      expect(await acquireRefreshLock()).toBe(false);
      expect(warnMock).toHaveBeenCalled();
    });

    it("fails closed when acquire rejects with a non-Error", async () => {
      setMock.mockRejectedValue("string failure");
      const { acquireRefreshLock } = await loadModule();
      expect(await acquireRefreshLock()).toBe(false);
      expect(warnMock).toHaveBeenCalled();
    });

    it("releases by deleting the key", async () => {
      delMock.mockResolvedValue(1);
      const { releaseRefreshLock } = await loadModule();
      await releaseRefreshLock();
      expect(delMock).toHaveBeenCalledWith("price-refresh:lock");
    });

    it("swallows errors on release", async () => {
      delMock.mockRejectedValue(new Error("boom"));
      const { releaseRefreshLock } = await loadModule();
      await expect(releaseRefreshLock()).resolves.toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run the new test file to verify it passes**

Run: `npx vitest run src/__tests__/lib/services/refresh-lock.test.ts`
Expected: `Test Files 1 passed`, `Tests 9 passed`. (These are behavior tests against existing code, so they pass immediately — the "failing" state we care about is the coverage gate, checked next.)

- [ ] **Step 3: Run full coverage and verify 95% on all metrics**

Run: `npm run test:coverage`
Expected: exit code 0, and the summary shows **Branches ≥ 95%** (previously 93.43%) alongside Statements/Functions/Lines ≥ 95%. `refresh-lock.ts` should now report ~100%.

If branches are still < 95%, add targeted tests for the next-largest gaps shown in the report (`src/lib/import/holdings-import-engine.ts` lines 82/145-146, `zerodha-holdings-parser.ts` lines 114-140, `src/lib/rate-limit/*-store.ts`) until the summary passes, then re-run this step.

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/lib/services/refresh-lock.test.ts
git commit -m "test(refresh-lock): cover lock logic to reach 95% branch coverage"
```

---

### Task 2: Enable the coverage gate in the `verify` job

Swap the CI test step from `npm test` to `npm run test:coverage` so any coverage drop below 95% fails `verify` and blocks all deploys. Only safe now that Task 1 made coverage green.

**Files:**
- Modify: `.github/workflows/ci.yml` (the `Test` step under job `verify`)

**Interfaces:**
- Consumes: a green `npm run test:coverage` (from Task 1).
- Produces: a `verify` job that fails on < 95% coverage. Tasks 3's deploy jobs gate on this job.

- [ ] **Step 1: Change the test step**

In `.github/workflows/ci.yml`, replace:

```yaml
      - name: Test
        run: npm test
```

with:

```yaml
      - name: Test (with 95% coverage gate)
        run: npm run test:coverage
```

- [ ] **Step 2: Validate the workflow YAML parses**

Run: `ruby -ryaml -e "YAML.load_file('.github/workflows/ci.yml'); puts 'YAML OK'"`
Expected: `YAML OK`

- [ ] **Step 3: Confirm the gate command is green locally**

Run: `npm run test:coverage`
Expected: exit code 0 (this is exactly what CI will now run).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: enforce 95% coverage in the verify gate"
```

---

### Task 3: Add `deploy-preview` and `deploy-production` jobs

Add two jobs to `ci.yml`, both gated on `verify`. Preview runs on same-repo PRs and comments the URL; production runs on push to `main`. Deploys use the Vercel CLI; the PR comment uses the preinstalled `gh` CLI (no new action).

**Files:**
- Modify: `.github/workflows/ci.yml` (append two jobs after `verify`)

**Interfaces:**
- Consumes: `needs: verify` (Task 2 job); repo secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (created in Task 4 setup); built-in `GITHUB_TOKEN`.
- Produces: preview deployments on PRs, production deployments on `main`.

- [ ] **Step 1: Append the two deploy jobs**

Add the following at the end of `.github/workflows/ci.yml`, at the same indentation level as the `verify:` job (two-space indent under `jobs:`):

```yaml
  deploy-preview:
    name: Deploy preview (Vercel)
    needs: verify
    # Same-repo PRs only — a fork PR must never gain access to VERCEL_TOKEN.
    if: >-
      github.event_name == 'pull_request' &&
      github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    env:
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
    steps:
      - name: Checkout
        uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4

      - name: Setup Node.js
        uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version: "22"
          cache: npm

      - name: Install Vercel CLI
        run: npm install --global vercel@latest

      - name: Pull Vercel environment (preview)
        run: vercel pull --yes --environment=preview --token="$VERCEL_TOKEN"
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}

      - name: Build (preview)
        run: vercel build --token="$VERCEL_TOKEN"
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}

      - name: Deploy (preview)
        id: deploy
        run: |
          url=$(vercel deploy --prebuilt --token="$VERCEL_TOKEN")
          echo "url=$url" >> "$GITHUB_OUTPUT"
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}

      - name: Comment preview URL on the PR
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          PREVIEW_URL: ${{ steps.deploy.outputs.url }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
        run: gh pr comment "$PR_NUMBER" --body "🔍 Preview deployed: $PREVIEW_URL"

  deploy-production:
    name: Deploy production (Vercel)
    needs: verify
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: read
    env:
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
    steps:
      - name: Checkout
        uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4

      - name: Setup Node.js
        uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version: "22"
          cache: npm

      - name: Install Vercel CLI
        run: npm install --global vercel@latest

      - name: Pull Vercel environment (production)
        run: vercel pull --yes --environment=production --token="$VERCEL_TOKEN"
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}

      - name: Build (production)
        run: vercel build --prod --token="$VERCEL_TOKEN"
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}

      - name: Deploy (production)
        run: vercel deploy --prebuilt --prod --token="$VERCEL_TOKEN"
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
```

- [ ] **Step 2: Validate the workflow YAML parses**

Run: `ruby -ryaml -e "YAML.load_file('.github/workflows/ci.yml'); puts 'YAML OK'"`
Expected: `YAML OK`

- [ ] **Step 3: Verify the security invariants by inspection**

Confirm in the diff:
- `deploy-preview.if` contains `github.event.pull_request.head.repo.full_name == github.repository` (fork guard).
- `deploy-preview.permissions` = `contents: read` + `pull-requests: write`; `deploy-production.permissions` = `contents: read` only.
- No `${{ github.event.* }}` appears inside any `run:` line (PR number/URL are passed via `env:`).
- Both deploy jobs declare `needs: verify`.
- `VERCEL_TOKEN` is referenced only via `env:` on the steps that need it, never echoed.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add CI-gated Vercel preview + production deploys"
```

---

### Task 4: Deployment setup documentation

Document the one-time manual setup so the pipeline actually works and so future-you knows migrations stay manual. This task ships no code the pipeline depends on at build time, but it is required for the deploy jobs to function.

**Files:**
- Create: `docs/DEPLOYMENT.md`

**Interfaces:**
- Consumes: nothing.
- Produces: operator documentation. No code depends on it.

- [ ] **Step 1: Write `docs/DEPLOYMENT.md`**

Create `docs/DEPLOYMENT.md` with:

````markdown
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
````

- [ ] **Step 2: Verify the doc renders and links are correct**

Run: `test -f docs/DEPLOYMENT.md && echo "exists"`
Expected: `exists`. Visually confirm the secret names match those referenced in `ci.yml` (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`).

- [ ] **Step 3: Commit**

```bash
git add docs/DEPLOYMENT.md
git commit -m "docs: add deployment + Vercel setup guide"
```

---

## Post-implementation (operator, not code)

These are done by the repo owner after the code lands; they are not automatable from CI:

- [ ] Run the Task 4 setup steps 1–5 (vercel link, secrets, disable auto-deploy).
- [ ] Open a test PR to confirm a preview URL is commented.
- [ ] Merge to `main` to confirm production deploys.

## Notes for the memory index (after execution)

Update `ci-pipeline.md` memory: coverage is now enforced (95%) via `test:coverage`
in `verify`; deploys are CI-gated via Vercel CLI (preview on same-repo PRs,
production on `main`); migrations remain manual.
