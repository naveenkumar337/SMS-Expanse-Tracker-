-- Run this once in the Supabase SQL Editor (after supabase-migration-income-receipts-sort.sql).
-- Creates the "receipts" Storage bucket and RLS policies for receipt photos.
--
-- Design: the bucket is PUBLIC for reads (so `getPublicUrl()` works directly
-- for displaying receipt thumbnails without needing to refresh expiring
-- signed URLs), but RLS restricts uploads/updates/deletes so a user can only
-- write to their own `{auth.uid()}/...` path prefix. Object paths include a
-- timestamp and aren't linkable/guessable without DB access, which is an
-- acceptable tradeoff for a personal expense tracker; if stronger privacy is
-- required later, switch the bucket to private and use
-- `createSignedUrl()`/`createSignedUrls()` instead of `getPublicUrl()`.

-- Create the bucket (safe to re-run).
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Allow any authenticated user to upload only under their own user_id folder.
-- Object paths are structured as "{user_id}/{timestamp}.{ext}" by
-- src/services/receipts.js, so `(storage.foldername(name))[1]` (the first
-- path segment) must equal the uploader's own auth.uid().
--
-- PostgreSQL's CREATE POLICY has no IF NOT EXISTS clause, so each policy is
-- dropped first (safe no-op if it doesn't exist yet) to make this re-runnable.
DROP POLICY IF EXISTS "Users can upload their own receipts" ON storage.objects;
CREATE POLICY "Users can upload their own receipts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can update their own receipts" ON storage.objects;
CREATE POLICY "Users can update their own receipts"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete their own receipts" ON storage.objects;
CREATE POLICY "Users can delete their own receipts"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read access (bucket is public) — no policy needed for SELECT, but
-- an explicit policy is added for clarity/auditability.
DROP POLICY IF EXISTS "Anyone can view receipts (public bucket)" ON storage.objects;
CREATE POLICY "Anyone can view receipts (public bucket)"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'receipts');
