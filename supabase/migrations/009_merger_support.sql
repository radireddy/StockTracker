-- supabase/migrations/009_merger_support.sql
-- Extends the corporate_actions type enum to include merger events.
-- Apply manually in Supabase Dashboard SQL editor.

ALTER TABLE corporate_actions
  DROP CONSTRAINT IF EXISTS corporate_actions_action_type_check;

ALTER TABLE corporate_actions
  ADD CONSTRAINT corporate_actions_action_type_check
    CHECK (action_type IN ('split', 'bonus', 'merger'));
