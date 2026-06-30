-- Replace date DATE with traded_at TIMESTAMPTZ for precise FIFO ordering
-- Trades on the same day need time-level ordering (especially for imports with execution_time)

-- Step 1: Add traded_at column
ALTER TABLE transactions ADD COLUMN traded_at TIMESTAMPTZ;

-- Step 2: Backfill from existing date column (treat as IST midnight)
UPDATE transactions
SET traded_at = (date::timestamp) AT TIME ZONE 'Asia/Kolkata';

-- Step 3: Make it NOT NULL
ALTER TABLE transactions ALTER COLUMN traded_at SET NOT NULL;

-- Step 4: Drop the old date column and its index
DROP INDEX IF EXISTS idx_transactions_company_date;
ALTER TABLE transactions DROP COLUMN date;

-- Step 5: Create new index on traded_at
CREATE INDEX idx_transactions_company_traded_at ON transactions (company_id, traded_at);
