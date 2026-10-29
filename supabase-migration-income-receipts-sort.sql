-- Run this once in the Supabase SQL Editor.
-- Adds support for: income/credit tracking, receipt photo attachments,
-- and correct chronological sorting by the actual transaction date.

-- ─── Income/Credit tracking ─────────────────────────────────────────────────
-- Existing rows default to 'expense', matching current (expense-only) behavior.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'expense';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_transactions_type'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT chk_transactions_type CHECK (type IN ('expense', 'income'));
  END IF;
END $$;

-- ─── Receipt photo attachment ───────────────────────────────────────────────
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- ─── Sortable transaction date ──────────────────────────────────────────────
-- The existing `date` column is a formatted display string ("20 Aug 2026"),
-- which does not sort chronologically as plain text (e.g. across month/year
-- boundaries). `txn_date` is a proper DATE column used for sorting/filtering.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS txn_date DATE;

-- Backfill existing rows from the formatted `date` string.
-- NOTE: run the SELECT below FIRST to sanity-check that all existing `date`
-- values parse cleanly before running the UPDATE — any row that doesn't match
-- 'DD Mon YYYY' will make TO_DATE throw and abort the whole UPDATE.
--
--   SELECT id, date FROM transactions WHERE txn_date IS NULL AND date !~ '^\d{2} [A-Za-z]{3} \d{4}$';
--
UPDATE transactions
SET txn_date = TO_DATE(date, 'DD Mon YYYY')
WHERE txn_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_user_txn_date
  ON transactions(user_id, txn_date DESC);
