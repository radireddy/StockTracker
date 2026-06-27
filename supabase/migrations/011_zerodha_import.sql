-- Add source tracking and trade_ids for idempotent imports
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS trade_id TEXT,
  ADD COLUMN IF NOT EXISTS trade_ids JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS order_id TEXT,
  ADD COLUMN IF NOT EXISTS exchange TEXT;

-- Unique constraint on trade_id per user for idempotency
-- trade_id is the first trade ID in a grouped transaction
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_trade_id
  ON transactions (user_id, trade_id)
  WHERE trade_id IS NOT NULL;

-- GIN index on trade_ids for fast containment checks
CREATE INDEX IF NOT EXISTS idx_transactions_trade_ids
  ON transactions USING GIN (trade_ids);

-- Import jobs table to track async import status
CREATE TABLE import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'zerodha',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  file_name TEXT,
  total_rows INTEGER DEFAULT 0,
  processed_rows INTEGER DEFAULT 0,
  imported_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  summary JSONB DEFAULT '{}',
  errors JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_import_jobs_user ON import_jobs (user_id);
CREATE INDEX idx_import_jobs_status ON import_jobs (user_id, status);

ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access own import jobs"
  ON import_jobs FOR ALL
  USING (auth.uid() = user_id);

CREATE TRIGGER set_updated_at_import_jobs
  BEFORE UPDATE ON import_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
