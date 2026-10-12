/*
# Multi-user authentication system

## Overview
Converts the app from single-tenant (open anon access) to multi-user with:
- Per-user data isolation for personal data (searches, labels, quiz attempts)
- Admin-managed shared content (training materials, courses, settings)
- Admin-only file uploads to training storage buckets

## New Tables
- `profiles` — User profile with admin flag
  - `id` (uuid, PK, references auth.users)
  - `email` (text)
  - `is_admin` (boolean, default false)
  - `created_at` (timestamptz)

## New Functions
- `is_admin()` — SECURITY DEFINER function that checks if current user is admin.
  Bypasses RLS on profiles to read the is_admin flag.

## Modified Tables (added user_id column)
- `searches` — user_id uuid DEFAULT auth.uid()
- `label_preferences` — user_id uuid DEFAULT auth.uid()
- `saved_locations` — user_id uuid DEFAULT auth.uid()
- `label_templates` — user_id uuid DEFAULT auth.uid()
- `label_template_groups` — user_id uuid DEFAULT auth.uid()
- `quiz_attempts` — user_id uuid DEFAULT auth.uid()

## Security Changes

### Owner-scoped tables (personal data — each user sees only their own)
- searches, label_preferences, saved_locations, label_templates,
  label_template_groups, quiz_attempts
- Replaced open anon policies with owner-scoped CRUD (auth.uid() = user_id)

### Shared content tables (admin-managed, all authenticated users can read)
- training_materials, training_folders, training_courses, quiz_questions,
  search_sources, app_settings
- SELECT: all authenticated users
- INSERT/UPDATE/DELETE: admin only (is_admin() check)

### Storage
- Training buckets remain public for reads (files accessible by URL)
- Write operations (upload/update/delete): admin only

### Profiles
- Users can read and update their own profile
- Admins can read all profiles (for user management)

## Important Notes
1. Existing rows in owner-scoped tables have NULL user_id and will not be
   visible to any user after this migration. This is expected when converting
   from single-tenant to multi-user.
2. Shared content (training materials, courses) remains visible to all
   authenticated users.
3. The is_admin() function is SECURITY DEFINER so it can read profiles
   regardless of RLS policies.
*/

-- ============================================================
-- 1. Create profiles table
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. Create is_admin() helper function (SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

-- ============================================================
-- 3. Profile policies
-- ============================================================
DROP POLICY IF EXISTS "select_profiles" ON profiles;
CREATE POLICY "select_profiles" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id OR is_admin());

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============================================================
-- 4. Add user_id columns to owner-scoped tables
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'searches' AND column_name = 'user_id') THEN
    ALTER TABLE searches ADD COLUMN user_id uuid DEFAULT auth.uid();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'label_preferences' AND column_name = 'user_id') THEN
    ALTER TABLE label_preferences ADD COLUMN user_id uuid DEFAULT auth.uid();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'saved_locations' AND column_name = 'user_id') THEN
    ALTER TABLE saved_locations ADD COLUMN user_id uuid DEFAULT auth.uid();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'label_templates' AND column_name = 'user_id') THEN
    ALTER TABLE label_templates ADD COLUMN user_id uuid DEFAULT auth.uid();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'label_template_groups' AND column_name = 'user_id') THEN
    ALTER TABLE label_template_groups ADD COLUMN user_id uuid DEFAULT auth.uid();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'quiz_attempts' AND column_name = 'user_id') THEN
    ALTER TABLE quiz_attempts ADD COLUMN user_id uuid DEFAULT auth.uid();
  END IF;
END $$;

-- ============================================================
-- 5. Owner-scoped table policies: searches
-- ============================================================
DROP POLICY IF EXISTS "anon_select_searches" ON searches;
DROP POLICY IF EXISTS "anon_insert_searches" ON searches;
DROP POLICY IF EXISTS "anon_update_searches" ON searches;
DROP POLICY IF EXISTS "anon_delete_searches" ON searches;

CREATE POLICY "select_own_searches" ON searches FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_searches" ON searches FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_searches" ON searches FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_searches" ON searches FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 6. Owner-scoped table policies: label_preferences
-- ============================================================
DROP POLICY IF EXISTS "anon_select_label_preferences" ON label_preferences;
DROP POLICY IF EXISTS "anon_insert_label_preferences" ON label_preferences;
DROP POLICY IF EXISTS "anon_update_label_preferences" ON label_preferences;
DROP POLICY IF EXISTS "anon_delete_label_preferences" ON label_preferences;

CREATE POLICY "select_own_label_preferences" ON label_preferences FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_label_preferences" ON label_preferences FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_label_preferences" ON label_preferences FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_label_preferences" ON label_preferences FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 7. Owner-scoped table policies: saved_locations
-- ============================================================
DROP POLICY IF EXISTS "anon_select_saved_locations" ON saved_locations;
DROP POLICY IF EXISTS "anon_insert_saved_locations" ON saved_locations;
DROP POLICY IF EXISTS "anon_update_saved_locations" ON saved_locations;
DROP POLICY IF EXISTS "anon_delete_saved_locations" ON saved_locations;

CREATE POLICY "select_own_saved_locations" ON saved_locations FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_saved_locations" ON saved_locations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_saved_locations" ON saved_locations FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_saved_locations" ON saved_locations FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 8. Owner-scoped table policies: label_templates
-- ============================================================
DROP POLICY IF EXISTS "anon_select_label_templates" ON label_templates;
DROP POLICY IF EXISTS "anon_insert_label_templates" ON label_templates;
DROP POLICY IF EXISTS "anon_update_label_templates" ON label_templates;
DROP POLICY IF EXISTS "anon_delete_label_templates" ON label_templates;

CREATE POLICY "select_own_label_templates" ON label_templates FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_label_templates" ON label_templates FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_label_templates" ON label_templates FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_label_templates" ON label_templates FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 9. Owner-scoped table policies: label_template_groups
-- ============================================================
DROP POLICY IF EXISTS "anon_select_label_template_groups" ON label_template_groups;
DROP POLICY IF EXISTS "anon_insert_label_template_groups" ON label_template_groups;
DROP POLICY IF EXISTS "anon_update_label_template_groups" ON label_template_groups;
DROP POLICY IF EXISTS "anon_delete_label_template_groups" ON label_template_groups;

CREATE POLICY "select_own_label_template_groups" ON label_template_groups FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_label_template_groups" ON label_template_groups FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_label_template_groups" ON label_template_groups FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_label_template_groups" ON label_template_groups FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 10. Owner-scoped table policies: quiz_attempts
-- ============================================================
DROP POLICY IF EXISTS "anon_select_quiz_attempts" ON quiz_attempts;
DROP POLICY IF EXISTS "anon_insert_quiz_attempts" ON quiz_attempts;
DROP POLICY IF EXISTS "anon_delete_quiz_attempts" ON quiz_attempts;

CREATE POLICY "select_own_quiz_attempts" ON quiz_attempts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_quiz_attempts" ON quiz_attempts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_quiz_attempts" ON quiz_attempts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_quiz_attempts" ON quiz_attempts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 11. Shared content policies: training_materials (admin write)
-- ============================================================
DROP POLICY IF EXISTS "anon_select_training_materials" ON training_materials;
DROP POLICY IF EXISTS "anon_insert_training_materials" ON training_materials;
DROP POLICY IF EXISTS "anon_update_training_materials" ON training_materials;
DROP POLICY IF EXISTS "anon_delete_training_materials" ON training_materials;

CREATE POLICY "select_training_materials" ON training_materials FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_training_materials" ON training_materials FOR INSERT
  TO authenticated WITH CHECK (is_admin());
CREATE POLICY "update_training_materials" ON training_materials FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "delete_training_materials" ON training_materials FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- 12. Shared content policies: training_folders (admin write)
-- ============================================================
DROP POLICY IF EXISTS "anon_select_training_folders" ON training_folders;
DROP POLICY IF EXISTS "anon_insert_training_folders" ON training_folders;
DROP POLICY IF EXISTS "anon_update_training_folders" ON training_folders;
DROP POLICY IF EXISTS "anon_delete_training_folders" ON training_folders;

CREATE POLICY "select_training_folders" ON training_folders FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_training_folders" ON training_folders FOR INSERT
  TO authenticated WITH CHECK (is_admin());
CREATE POLICY "update_training_folders" ON training_folders FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "delete_training_folders" ON training_folders FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- 13. Shared content policies: training_courses (admin write)
-- ============================================================
DROP POLICY IF EXISTS "anon_select_training_courses" ON training_courses;
DROP POLICY IF EXISTS "anon_insert_training_courses" ON training_courses;
DROP POLICY IF EXISTS "anon_update_training_courses" ON training_courses;
DROP POLICY IF EXISTS "anon_delete_training_courses" ON training_courses;

CREATE POLICY "select_training_courses" ON training_courses FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_training_courses" ON training_courses FOR INSERT
  TO authenticated WITH CHECK (is_admin());
CREATE POLICY "update_training_courses" ON training_courses FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "delete_training_courses" ON training_courses FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- 14. Shared content policies: quiz_questions (admin write)
-- ============================================================
DROP POLICY IF EXISTS "anon_select_quiz_questions" ON quiz_questions;
DROP POLICY IF EXISTS "anon_insert_quiz_questions" ON quiz_questions;
DROP POLICY IF EXISTS "anon_update_quiz_questions" ON quiz_questions;
DROP POLICY IF EXISTS "anon_delete_quiz_questions" ON quiz_questions;

CREATE POLICY "select_quiz_questions" ON quiz_questions FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_quiz_questions" ON quiz_questions FOR INSERT
  TO authenticated WITH CHECK (is_admin());
CREATE POLICY "update_quiz_questions" ON quiz_questions FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "delete_quiz_questions" ON quiz_questions FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- 15. Shared content policies: search_sources (admin write)
-- ============================================================
DROP POLICY IF EXISTS "anon_select_search_sources" ON search_sources;
DROP POLICY IF EXISTS "anon_insert_search_sources" ON search_sources;
DROP POLICY IF EXISTS "anon_update_search_sources" ON search_sources;
DROP POLICY IF EXISTS "anon_delete_search_sources" ON search_sources;

CREATE POLICY "select_search_sources" ON search_sources FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_search_sources" ON search_sources FOR INSERT
  TO authenticated WITH CHECK (is_admin());
CREATE POLICY "update_search_sources" ON search_sources FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "delete_search_sources" ON search_sources FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- 16. Shared content policies: app_settings (admin write)
-- ============================================================
DROP POLICY IF EXISTS "anon_select_app_settings" ON app_settings;
DROP POLICY IF EXISTS "anon_insert_app_settings" ON app_settings;
DROP POLICY IF EXISTS "anon_update_app_settings" ON app_settings;
DROP POLICY IF EXISTS "anon_delete_app_settings" ON app_settings;

CREATE POLICY "select_app_settings" ON app_settings FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_app_settings" ON app_settings FOR INSERT
  TO authenticated WITH CHECK (is_admin());
CREATE POLICY "update_app_settings" ON app_settings FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "delete_app_settings" ON app_settings FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- 17. Storage policies: training-documents (admin-only write)
-- ============================================================
DROP POLICY IF EXISTS "Public read training-documents" ON storage.objects;
DROP POLICY IF EXISTS "Anon upload training-documents" ON storage.objects;
DROP POLICY IF EXISTS "Anon update training-documents" ON storage.objects;
DROP POLICY IF EXISTS "Anon delete training-documents" ON storage.objects;

CREATE POLICY "read_training-documents" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'training-documents');
CREATE POLICY "upload_training-documents" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'training-documents' AND is_admin());
CREATE POLICY "update_training-documents" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'training-documents' AND is_admin()) WITH CHECK (bucket_id = 'training-documents' AND is_admin());
CREATE POLICY "delete_training-documents" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'training-documents' AND is_admin());

-- ============================================================
-- 18. Storage policies: training-images (admin-only write)
-- ============================================================
DROP POLICY IF EXISTS "Public read training-images" ON storage.objects;
DROP POLICY IF EXISTS "Anon upload training-images" ON storage.objects;
DROP POLICY IF EXISTS "Anon update training-images" ON storage.objects;
DROP POLICY IF EXISTS "Anon delete training-images" ON storage.objects;

CREATE POLICY "read_training-images" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'training-images');
CREATE POLICY "upload_training-images" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'training-images' AND is_admin());
CREATE POLICY "update_training-images" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'training-images' AND is_admin()) WITH CHECK (bucket_id = 'training-images' AND is_admin());
CREATE POLICY "delete_training-images" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'training-images' AND is_admin());

-- ============================================================
-- 19. Storage policies: training-videos (admin-only write)
-- ============================================================
DROP POLICY IF EXISTS "Public read training-videos" ON storage.objects;
DROP POLICY IF EXISTS "Anon upload training-videos" ON storage.objects;
DROP POLICY IF EXISTS "Anon update training-videos" ON storage.objects;
DROP POLICY IF EXISTS "Anon delete training-videos" ON storage.objects;

CREATE POLICY "read_training-videos" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'training-videos');
CREATE POLICY "upload_training-videos" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'training-videos' AND is_admin());
CREATE POLICY "update_training-videos" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'training-videos' AND is_admin()) WITH CHECK (bucket_id = 'training-videos' AND is_admin());
CREATE POLICY "delete_training-videos" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'training-videos' AND is_admin());

-- ============================================================
-- 20. Auto-create profile on signup via trigger
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
