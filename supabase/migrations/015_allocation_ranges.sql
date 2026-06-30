-- Add allocation_ranges JSONB column to profiles table
-- Stores per-star-rating target allocation ranges
-- Default is NULL; app layer applies defaults: { "1": { "min": 0, "max": 2 }, "2": { "min": 2, "max": 4 }, "3": { "min": 4, "max": 6 }, "4": { "min": 6, "max": 8 } }

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS allocation_ranges JSONB DEFAULT NULL;
