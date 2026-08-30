-- ============================================================================
-- 002b_hotfix_drop_premature_stock_id_fks.sql — HOTFIX
-- ----------------------------------------------------------------------------
-- The first cut of 002 added FOREIGN KEYS on companies.stock_id and
-- holdings.stock_id. That gave `companies`/`holdings` TWO foreign keys to
-- `indian_stocks` (via isin AND via stock_id), which makes PostgREST's implicit
-- `indian_stocks(...)` embeds ambiguous:
--   PGRST201 / HTTP 300 "more than one relationship was found"
-- breaking every read that embeds the catalog (dashboard, company detail, P&L).
--
-- Fix: drop those two premature FKs. The stock_id COLUMNS, indexes, backfill,
-- and the isin<->stock_id sync trigger all remain, so nothing else changes.
-- The stock_id FK is (re)introduced in Phase D (004), atomically with dropping
-- the isin FK, so there is never a two-FK window again.
--
-- Run ONCE, immediately after 002, on any database where the first 002 was
-- already applied. Idempotent.
-- ============================================================================

BEGIN;
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_stock_id_fkey;
ALTER TABLE holdings  DROP CONSTRAINT IF EXISTS holdings_stock_id_fkey;
COMMIT;

-- Verify plain embeds resolve again (should be HTTP 200, not 300):
--   GET /rest/v1/companies?select=id,isin,indian_stocks(name,price)&limit=1
