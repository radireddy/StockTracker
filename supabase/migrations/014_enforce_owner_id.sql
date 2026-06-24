-- Fix missing owner_holdings rows for companies that have transactions but no cached holdings.
-- This populates from the already-correct company-level aggregates.
INSERT INTO owner_holdings (company_id, owner_id, user_id, quantity, avg_buy_price, buy_date)
SELECT DISTINCT ON (t.company_id, t.owner_id)
  t.company_id,
  t.owner_id,
  t.user_id,
  c.quantity,
  c.avg_buy_price,
  c.buy_date
FROM transactions t
JOIN companies c ON c.id = t.company_id
LEFT JOIN owner_holdings oh ON oh.company_id = t.company_id AND oh.owner_id = t.owner_id
WHERE oh.company_id IS NULL
  AND c.quantity IS NOT NULL
  AND c.quantity > 0
ON CONFLICT (company_id, owner_id) DO NOTHING;

-- Make owner_id NOT NULL on import_jobs (the only table still nullable)
-- Backfill any NULL values with the default owner for that user first
UPDATE import_jobs ij
SET owner_id = po.id
FROM portfolio_owners po
WHERE po.user_id = ij.user_id AND po.is_default = true
  AND ij.owner_id IS NULL;

-- Delete any import_jobs that still have NULL owner_id (no default owner found)
DELETE FROM import_jobs WHERE owner_id IS NULL;

ALTER TABLE import_jobs ALTER COLUMN owner_id SET NOT NULL;
