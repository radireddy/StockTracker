-- Remove grouping-related columns from transactions
-- notes: replaced by source column (already exists)
-- trade_ids: grouped trade IDs array no longer needed (trade_id kept for single dedup)

-- Drop the GIN index on trade_ids
DROP INDEX IF EXISTS idx_transactions_trade_ids;

-- Drop the columns
ALTER TABLE transactions
  DROP COLUMN IF EXISTS notes,
  DROP COLUMN IF EXISTS trade_ids;
