/*
# Add username login, messaging system, and custom login pages

## Overview
Adds username-based login, a messaging system between admins and users with image uploads, and admin-managed custom login page variants.

## New Tables
- `messages` — Messages between users (admin-to-user and user replies)
  - `id` (uuid, PK)
  - `sender_id` (uuid, references auth.users)
  - `recipient_id` (uuid, references auth.users, nullable for broadcast)
  - `subject` (text)
  - `body` (text)
  - `image_url` (text, nullable)
  - `parent_id` (uuid, nullable, references messages for threading)
  - `read_at` (timestamptz, nullable)
  - `created_at` (timestamptz)

- `custom_login_pages` — Admin-created login page variants
  - `id` (uuid, PK)
  - `slug` (text, unique)
  - `title` (text)
  - `subtitle` (text)
  - `logo_text` (text, nullable)
  - `accent_color` (text, default emerald)
  - `is_active` (boolean, default true)
  - `created_by` (uuid, references auth.users)
  - `created_at` (timestamptz)

## Modified Tables
- `profiles` — Added `username` column (text, unique, nullable)
  - Users can set a username for username-based login
  - Admin account gets username='admin'

## New Storage Bucket
- `message-images` — For image attachments in messages
  - Public read, authenticated write

## Security
- messages: Users can see messages they sent or received
- custom_login_pages: Anyone (including anon) can read for login page display;
  only admins can create/edit/delete
- Storage message-images: public read, authenticated write
*/

-- ============================================================
-- 1. Add username to profiles
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'username') THEN
    ALTER TABLE profiles ADD COLUMN username text UNIQUE;
  END IF;
END $$;

-- Set admin username
UPDATE profiles SET username = 'admin' WHERE email = 'admin@admin.com';

-- Allow profile updates to set username (already have update_own_profile policy)
-- No policy change needed since existing policy allows self-update

-- ============================================================
-- 2. Create messages table
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  image_url text,
  parent_id uuid REFERENCES messages(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_messages" ON messages;
CREATE POLICY "select_own_messages" ON messages FOR SELECT
  TO authenticated USING (
    auth.uid() = sender_id OR auth.uid() = recipient_id
  );

DROP POLICY IF EXISTS "insert_own_messages" ON messages;
CREATE POLICY "insert_own_messages" ON messages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "update_own_messages" ON messages;
CREATE POLICY "update_own_messages" ON messages FOR UPDATE
  TO authenticated USING (auth.uid() = recipient_id) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_own_messages" ON messages;
CREATE POLICY "delete_own_messages" ON messages FOR DELETE
  TO authenticated USING (auth.uid() = sender_id);

-- ============================================================
-- 3. Create custom_login_pages table
-- ============================================================
CREATE TABLE IF NOT EXISTS custom_login_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  subtitle text NOT NULL DEFAULT '',
  logo_text text,
  accent_color text NOT NULL DEFAULT 'emerald',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE custom_login_pages ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can read login pages for display
DROP POLICY IF EXISTS "select_login_pages" ON custom_login_pages;
CREATE POLICY "select_login_pages" ON custom_login_pages FOR SELECT
  TO anon, authenticated USING (true);

-- Only admins can create/edit/delete
DROP POLICY IF EXISTS "insert_login_pages" ON custom_login_pages;
CREATE POLICY "insert_login_pages" ON custom_login_pages FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "update_login_pages" ON custom_login_pages;
CREATE POLICY "update_login_pages" ON custom_login_pages FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "delete_login_pages" ON custom_login_pages;
CREATE POLICY "delete_login_pages" ON custom_login_pages FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- 4. Storage bucket for message images
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('message-images', 'message-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "read_message-images" ON storage.objects;
CREATE POLICY "read_message-images" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'message-images');

DROP POLICY IF EXISTS "upload_message-images" ON storage.objects;
CREATE POLICY "upload_message-images" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'message-images');

DROP POLICY IF EXISTS "delete_message-images" ON storage.objects;
CREATE POLICY "delete_message-images" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'message-images');

-- ============================================================
-- 5. Add unique index on username for fast lookups
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username) WHERE username IS NOT NULL;

-- ============================================================
-- 6. Update handle_new_user trigger to not require username
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, is_admin)
  VALUES (NEW.id, NEW.email, false);
  RETURN NEW;
END;
$$;
