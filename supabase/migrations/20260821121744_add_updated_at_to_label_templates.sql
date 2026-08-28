ALTER TABLE label_templates
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
