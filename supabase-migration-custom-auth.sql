-- Run this once in the Supabase SQL Editor.
-- Replaces Google/Supabase-Auth sign-in with a fully custom
-- name/email/phone/password users table, authenticated entirely through
-- SECURITY DEFINER Postgres functions (RPCs) so that:
--   * password hashes are hashed/verified only inside Postgres (pgcrypto) and
--     never sent to or compared on the client;
--   * the `users` table itself has RLS enabled with NO policies, so the
--     anon/authenticated Supabase roles have zero direct access to it —
--     the only way in is through the RPC functions below;
--   * `transactions` access moves from Supabase-Auth-based RLS
--     (`auth.uid() = user_id`, which no longer exists once Google/Supabase
--     Auth sign-in is removed) to the same RPC + session-token pattern.
--
-- NOTE: this intentionally does NOT migrate any existing Google-authenticated
-- users/data — per project decision, there are no real users yet.

-- ─── Extension for password hashing ────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Custom users table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  phone text NOT NULL,
  password_hash text NOT NULL,
  session_token text,
  session_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- No policies are created for `users` on purpose: with RLS enabled and no
-- policies, every role (including anon/authenticated) is denied all direct
-- access. The SECURITY DEFINER functions below run as their owner (the
-- table owner, e.g. `postgres`), which bypasses RLS, so they remain the only
-- way to read/write this table.

-- ─── Auth RPCs ──────────────────────────────────────────────────────────────

-- Sign up a new user. Raises an exception (surfaced to the client as an
-- error) if the email is already registered.
CREATE OR REPLACE FUNCTION signup_user(
  p_name text, p_email text, p_phone text, p_password text
) RETURNS TABLE(id uuid, name text, email text, phone text, session_token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_token text;
BEGIN
  IF p_email IS NULL OR p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'Invalid email or password';
  END IF;

  IF EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = lower(p_email)) THEN
    RAISE EXCEPTION 'Email already registered';
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO users (name, email, phone, password_hash, session_token, session_created_at)
  VALUES (p_name, lower(p_email), p_phone, crypt(p_password, gen_salt('bf')), v_token, now())
  RETURNING users.id INTO v_id;

  RETURN QUERY SELECT v_id, p_name, lower(p_email), p_phone, v_token;
END;
$$;

-- Log in an existing user, rotating their session token.
CREATE OR REPLACE FUNCTION login_user(
  p_email text, p_password text
) RETURNS TABLE(id uuid, name text, email text, phone text, session_token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row users%ROWTYPE;
  v_token text;
BEGIN
  SELECT * INTO v_row FROM users u WHERE lower(u.email) = lower(p_email);

  IF v_row.id IS NULL OR v_row.password_hash <> crypt(p_password, v_row.password_hash) THEN
    RAISE EXCEPTION 'Invalid email or password';
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');
  UPDATE users SET session_token = v_token, session_created_at = now() WHERE users.id = v_row.id;

  RETURN QUERY SELECT v_row.id, v_row.name, v_row.email, v_row.phone, v_token;
END;
$$;

-- Log out: invalidates the current session token.
CREATE OR REPLACE FUNCTION logout_user(p_user_id uuid, p_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE users SET session_token = NULL, session_created_at = NULL
  WHERE id = p_user_id AND session_token = p_token;
END;
$$;

-- Internal helper: does (user_id, token) correspond to a currently-valid session?
-- Not intended to be called directly from the client.
CREATE OR REPLACE FUNCTION _check_session(p_user_id uuid, p_token text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_user_id AND p_token IS NOT NULL AND session_token = p_token
  );
$$;

-- ─── transactions: point at the new users table instead of auth.users ─────
-- Any existing rows were inserted under the old Google/Supabase-Auth
-- `auth.users` ids, none of which exist in the brand-new `users` table
-- above — per project decision (no real users yet), these are just old
-- test data and are cleared here so the new foreign key can be added.
-- ⚠️ DESTRUCTIVE: if you actually need to keep this data, back it up first
-- (e.g. `CREATE TABLE transactions_backup AS TABLE transactions;`) or stop
-- and use a NOT VALID constraint instead.
DELETE FROM transactions;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_user_id_fkey;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Lock the transactions table down the same way as `users`: RLS enabled,
-- existing auth.uid()-based policies dropped (they can never match anything
-- now that Supabase Auth sign-in is gone), and all access funneled through
-- the session-checked RPCs below instead.
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'transactions' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON transactions', pol.policyname);
  END LOOP;
END $$;

-- ─── transactions RPCs (replace direct .from('transactions') calls) ───────

CREATE OR REPLACE FUNCTION get_transactions(p_user_id uuid, p_token text)
RETURNS SETOF transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT _check_session(p_user_id, p_token) THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  RETURN QUERY
    SELECT * FROM transactions t
    WHERE t.user_id = p_user_id
    ORDER BY t.txn_date DESC NULLS LAST;
END;
$$;

CREATE OR REPLACE FUNCTION get_transactions_range(
  p_user_id uuid, p_token text, p_start date, p_end date
) RETURNS SETOF transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT _check_session(p_user_id, p_token) THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  RETURN QUERY
    SELECT * FROM transactions t
    WHERE t.user_id = p_user_id AND t.txn_date BETWEEN p_start AND p_end
    ORDER BY t.txn_date DESC NULLS LAST;
END;
$$;

CREATE OR REPLACE FUNCTION add_transaction(
  p_user_id uuid, p_token text,
  p_sms_id text, p_type text, p_amount numeric, p_date text, p_txn_date date,
  p_merchant text, p_purpose text, p_bank text, p_payment_mode text,
  p_spent_for text, p_raw_sms text, p_is_cash boolean, p_receipt_url text
) RETURNS SETOF transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT _check_session(p_user_id, p_token) THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  RETURN QUERY
    INSERT INTO transactions (
      user_id, sms_id, type, amount, date, txn_date, merchant, purpose,
      bank, payment_mode, spent_for, raw_sms, is_cash, receipt_url,
      created_at, updated_at
    ) VALUES (
      p_user_id, p_sms_id, coalesce(p_type, 'expense'), p_amount, p_date, p_txn_date,
      p_merchant, p_purpose, p_bank, p_payment_mode, coalesce(p_spent_for, 'Self'),
      p_raw_sms, coalesce(p_is_cash, false), p_receipt_url, now(), now()
    )
    RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION update_transaction(
  p_user_id uuid, p_token text, p_id uuid,
  p_type text, p_amount numeric, p_date text, p_txn_date date,
  p_merchant text, p_purpose text, p_bank text, p_payment_mode text,
  p_spent_for text, p_receipt_url text
) RETURNS SETOF transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT _check_session(p_user_id, p_token) THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  RETURN QUERY
    UPDATE transactions SET
      type = coalesce(p_type, 'expense'),
      amount = p_amount,
      date = p_date,
      txn_date = p_txn_date,
      merchant = p_merchant,
      purpose = p_purpose,
      bank = p_bank,
      payment_mode = p_payment_mode,
      spent_for = coalesce(p_spent_for, 'Self'),
      receipt_url = p_receipt_url,
      updated_at = now()
    WHERE id = p_id AND user_id = p_user_id
    RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION delete_transaction(p_user_id uuid, p_token text, p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT _check_session(p_user_id, p_token) THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  DELETE FROM transactions WHERE id = p_id AND user_id = p_user_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION transaction_exists(p_user_id uuid, p_token text, p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT _check_session(p_user_id, p_token) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (SELECT 1 FROM transactions WHERE id = p_id AND user_id = p_user_id);
END;
$$;

-- ─── receipts Storage bucket policies ──────────────────────────────────────
-- The existing policies (from supabase-migration-receipts-storage.sql) are
-- scoped `TO authenticated` and check `auth.uid()`, both of which relied on
-- Supabase Auth. Neither exists anymore once Google/Supabase-Auth sign-in is
-- removed: the app now always connects as the `anon` role with no Supabase
-- session, so those policies would simply block all uploads.
--
-- Rather than opening writes to any anon-key holder, uploads/updates/deletes
-- are now handled by the "upload-receipt" Supabase Edge Function
-- (supabase/functions/upload-receipt/index.ts), which validates the
-- caller's custom session (user_id + token, checked against the `users`
-- table) before writing, using the service-role key — which bypasses RLS
-- entirely. So no anon/authenticated write policy is added here at all;
-- direct writes from the app stay denied, same as `users`/`transactions`.
-- The bucket remains public-read by design (see
-- supabase-migration-receipts-storage.sql) so reads still work unchanged.
DROP POLICY IF EXISTS "Users can upload their own receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own receipts" ON storage.objects;
