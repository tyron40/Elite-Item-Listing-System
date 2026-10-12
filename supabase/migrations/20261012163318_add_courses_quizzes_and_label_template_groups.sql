/*
# Add training courses, quizzes, and label template groups

1. New Tables
- `training_courses`
  - `id` (uuid, primary key)
  - `title` (text, not null)
  - `description` (text, nullable)
  - `folder_id` (uuid, nullable, references training_folders ON DELETE SET NULL)
  - `source_material_ids` (jsonb, default '[]') — array of training_materials IDs used to generate the quiz
  - `passing_score` (int, default 70) — percentage needed to pass
  - `created_at` (timestamptz, default now())
- `quiz_questions`
  - `id` (uuid, primary key)
  - `course_id` (uuid, not null, references training_courses ON DELETE CASCADE)
  - `question_text` (text, not null)
  - `options` (jsonb, not null) — array of {id, text}
  - `correct_option_id` (text, not null) — matches an option id
  - `explanation` (text, nullable)
  - `sort_order` (int, default 0)
  - `created_at` (timestamptz, default now())
- `quiz_attempts`
  - `id` (uuid, primary key)
  - `course_id` (uuid, not null, references training_courses ON DELETE CASCADE)
  - `score` (int, not null) — percentage 0-100
  - `passed` (boolean, not null)
  - `answers` (jsonb, nullable) — array of {question_id, selected_option_id, correct}
  - `created_at` (timestamptz, default now())
- `label_template_groups`
  - `id` (uuid, primary key)
  - `name` (text, not null)
  - `sort_order` (int, default 0)
  - `created_at` (timestamptz, default now())

2. Modified Tables
- `label_templates` — add `group_id` (uuid, nullable, references label_template_groups ON DELETE SET NULL)

3. Security
- Enable RLS on all new tables.
- Allow anon + authenticated CRUD (single-tenant, no sign-in).
*/

CREATE TABLE IF NOT EXISTS training_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  folder_id uuid REFERENCES training_folders(id) ON DELETE SET NULL,
  source_material_ids jsonb DEFAULT '[]'::jsonb,
  passing_score int NOT NULL DEFAULT 70,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE training_courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_training_courses" ON training_courses;
CREATE POLICY "anon_select_training_courses" ON training_courses FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_training_courses" ON training_courses;
CREATE POLICY "anon_insert_training_courses" ON training_courses FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_training_courses" ON training_courses;
CREATE POLICY "anon_update_training_courses" ON training_courses FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_training_courses" ON training_courses;
CREATE POLICY "anon_delete_training_courses" ON training_courses FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  options jsonb NOT NULL,
  correct_option_id text NOT NULL,
  explanation text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_quiz_questions" ON quiz_questions;
CREATE POLICY "anon_select_quiz_questions" ON quiz_questions FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_quiz_questions" ON quiz_questions;
CREATE POLICY "anon_insert_quiz_questions" ON quiz_questions FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_quiz_questions" ON quiz_questions;
CREATE POLICY "anon_update_quiz_questions" ON quiz_questions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_quiz_questions" ON quiz_questions;
CREATE POLICY "anon_delete_quiz_questions" ON quiz_questions FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  score int NOT NULL,
  passed boolean NOT NULL,
  answers jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_quiz_attempts" ON quiz_attempts;
CREATE POLICY "anon_select_quiz_attempts" ON quiz_attempts FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_quiz_attempts" ON quiz_attempts;
CREATE POLICY "anon_insert_quiz_attempts" ON quiz_attempts FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_quiz_attempts" ON quiz_attempts;
CREATE POLICY "anon_delete_quiz_attempts" ON quiz_attempts FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS label_template_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE label_template_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_label_template_groups" ON label_template_groups;
CREATE POLICY "anon_select_label_template_groups" ON label_template_groups FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_label_template_groups" ON label_template_groups;
CREATE POLICY "anon_insert_label_template_groups" ON label_template_groups FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_label_template_groups" ON label_template_groups;
CREATE POLICY "anon_update_label_template_groups" ON label_template_groups FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_label_template_groups" ON label_template_groups;
CREATE POLICY "anon_delete_label_template_groups" ON label_template_groups FOR DELETE
  TO anon, authenticated USING (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'label_templates' AND column_name = 'group_id'
  ) THEN
    ALTER TABLE label_templates
      ADD COLUMN group_id uuid REFERENCES label_template_groups(id) ON DELETE SET NULL;
  END IF;
END $$;
