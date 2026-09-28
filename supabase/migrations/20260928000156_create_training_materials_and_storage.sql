/*
# Create training materials table and storage buckets

1. New Tables
- `training_materials`
  - `id` (uuid, primary key)
  - `title` (text, not null) — display name for the material
  - `description` (text, nullable) — optional description
  - `file_type` (text, not null) — 'document', 'image', or 'video'
  - `file_url` (text, not null) — public URL to the stored file
  - `file_name` (text, not null) — original file name
  - `file_size` (bigint, nullable) — file size in bytes
  - `created_at` (timestamptz, default now())

2. Storage Buckets
- `training-documents` — for PDF, DOC, TXT files
- `training-images` — for PNG, JPG, GIF, WEBP files
- `training-videos` — for MP4, MOV, WEBM files
All buckets are public for read access so workers can view materials.

3. Security
- Enable RLS on `training_materials`.
- Allow anon + authenticated CRUD (single-tenant app, no sign-in).
- Storage buckets allow public read, anon+authenticated upload/update/delete.
*/

CREATE TABLE IF NOT EXISTS training_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  file_type text NOT NULL CHECK (file_type IN ('document', 'image', 'video')),
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_size bigint,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE training_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_training_materials" ON training_materials;
CREATE POLICY "anon_select_training_materials" ON training_materials FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_training_materials" ON training_materials;
CREATE POLICY "anon_insert_training_materials" ON training_materials FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_training_materials" ON training_materials;
CREATE POLICY "anon_update_training_materials" ON training_materials FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_training_materials" ON training_materials;
CREATE POLICY "anon_delete_training_materials" ON training_materials FOR DELETE
  TO anon, authenticated USING (true);

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('training-documents', 'training-documents', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('training-images', 'training-images', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('training-videos', 'training-videos', true) ON CONFLICT DO NOTHING;

-- Storage policies: public read, anon+authenticated write
DROP POLICY IF EXISTS "Public read training-documents" ON storage.objects;
CREATE POLICY "Public read training-documents" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'training-documents');

DROP POLICY IF EXISTS "Anon upload training-documents" ON storage.objects;
CREATE POLICY "Anon upload training-documents" ON storage.objects FOR INSERT
  TO anon, authenticated WITH CHECK (bucket_id = 'training-documents');

DROP POLICY IF EXISTS "Anon update training-documents" ON storage.objects;
CREATE POLICY "Anon update training-documents" ON storage.objects FOR UPDATE
  TO anon, authenticated USING (bucket_id = 'training-documents');

DROP POLICY IF EXISTS "Anon delete training-documents" ON storage.objects;
CREATE POLICY "Anon delete training-documents" ON storage.objects FOR DELETE
  TO anon, authenticated USING (bucket_id = 'training-documents');

DROP POLICY IF EXISTS "Public read training-images" ON storage.objects;
CREATE POLICY "Public read training-images" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'training-images');

DROP POLICY IF EXISTS "Anon upload training-images" ON storage.objects;
CREATE POLICY "Anon upload training-images" ON storage.objects FOR INSERT
  TO anon, authenticated WITH CHECK (bucket_id = 'training-images');

DROP POLICY IF EXISTS "Anon update training-images" ON storage.objects;
CREATE POLICY "Anon update training-images" ON storage.objects FOR UPDATE
  TO anon, authenticated USING (bucket_id = 'training-images');

DROP POLICY IF EXISTS "Anon delete training-images" ON storage.objects;
CREATE POLICY "Anon delete training-images" ON storage.objects FOR DELETE
  TO anon, authenticated USING (bucket_id = 'training-images');

DROP POLICY IF EXISTS "Public read training-videos" ON storage.objects;
CREATE POLICY "Public read training-videos" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'training-videos');

DROP POLICY IF EXISTS "Anon upload training-videos" ON storage.objects;
CREATE POLICY "Anon upload training-videos" ON storage.objects FOR INSERT
  TO anon, authenticated WITH CHECK (bucket_id = 'training-videos');

DROP POLICY IF EXISTS "Anon update training-videos" ON storage.objects;
CREATE POLICY "Anon update training-videos" ON storage.objects FOR UPDATE
  TO anon, authenticated USING (bucket_id = 'training-videos');

DROP POLICY IF EXISTS "Anon delete training-videos" ON storage.objects;
CREATE POLICY "Anon delete training-videos" ON storage.objects FOR DELETE
  TO anon, authenticated USING (bucket_id = 'training-videos');
