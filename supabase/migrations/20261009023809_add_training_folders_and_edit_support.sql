/*
# Add training folders and folder association

1. New Tables
- `training_folders`
  - `id` (uuid, primary key)
  - `name` (text, not null) — folder/tab name
  - `sort_order` (int, default 0) — display order
  - `created_at` (timestamptz, default now())

2. Modified Tables
- `training_materials` — add `folder_id` (uuid, nullable, references training_folders, ON DELETE SET NULL)
  so materials can be grouped into folders. Existing materials get folder_id = NULL (show in "All").

3. Security
- Enable RLS on `training_folders`.
- Allow anon + authenticated CRUD (single-tenant, no sign-in).
*/

CREATE TABLE IF NOT EXISTS training_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE training_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_training_folders" ON training_folders;
CREATE POLICY "anon_select_training_folders" ON training_folders FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_training_folders" ON training_folders;
CREATE POLICY "anon_insert_training_folders" ON training_folders FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_training_folders" ON training_folders;
CREATE POLICY "anon_update_training_folders" ON training_folders FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_training_folders" ON training_folders;
CREATE POLICY "anon_delete_training_folders" ON training_folders FOR DELETE
  TO anon, authenticated USING (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_materials' AND column_name = 'folder_id'
  ) THEN
    ALTER TABLE training_materials
      ADD COLUMN folder_id uuid REFERENCES training_folders(id) ON DELETE SET NULL;
  END IF;
END $$;
