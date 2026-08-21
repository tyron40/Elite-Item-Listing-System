/*
# Create label preferences and saved locations tables (single-tenant, no auth)

1. New Tables
- `label_preferences`
  - `id` (uuid, primary key)
  - `label_width` (numeric, default 2.25) — label width in inches
  - `label_height` (numeric, default 1.25) — label height in inches
  - `label_unit` (text, default 'in') — unit: 'in' or 'mm'
  - `font_size` (integer, default 11) — default font size in pt
  - `default_location` (text, nullable) — default storage location
  - `auto_create_label` (boolean, default false) — auto-prepare label after item identification
  - `default_layout` (jsonb, nullable) — saved default field positions and enabled fields
  - `default_template` (text, nullable) — name of the default template
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())
- `saved_locations`
  - `id` (uuid, primary key)
  - `name` (text, not null) — location name (e.g. "Shelf A", "Bin 5")
  - `is_default` (boolean, default false) — whether this is the default location
  - `created_at` (timestamptz, default now())
- `label_templates`
  - `id` (uuid, primary key)
  - `name` (text, not null) — template name
  - `layout` (jsonb, not null) — full layout configuration (fields, positions, font sizes, enabled state)
  - `is_default` (boolean, default false) — whether this is the default template
  - `created_at` (timestamptz, default now())

2. Security
- Enable RLS on all tables.
- Allow anon + authenticated CRUD because this is a single-user tool with no sign-in screen.
- All four CRUD policies per table use USING(true)/WITH CHECK(true) because the data is intentionally shared.

3. Notes
- Only one row in label_preferences should exist (enforced by app logic, not DB constraint).
- Only one saved_location and one label_template should have is_default=true at a time (enforced by app logic).
- default_layout stores a JSON object with field positions, enabled flags, and font settings.
*/ 

CREATE TABLE IF NOT EXISTS label_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label_width numeric NOT NULL DEFAULT 2.25,
  label_height numeric NOT NULL DEFAULT 1.25,
  label_unit text NOT NULL DEFAULT 'in',
  font_size integer NOT NULL DEFAULT 11,
  default_location text,
  auto_create_label boolean NOT NULL DEFAULT false,
  default_layout jsonb,
  default_template text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE label_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_label_preferences" ON label_preferences;
CREATE POLICY "anon_select_label_preferences" ON label_preferences FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_label_preferences" ON label_preferences;
CREATE POLICY "anon_insert_label_preferences" ON label_preferences FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_label_preferences" ON label_preferences;
CREATE POLICY "anon_update_label_preferences" ON label_preferences FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_label_preferences" ON label_preferences;
CREATE POLICY "anon_delete_label_preferences" ON label_preferences FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS saved_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE saved_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_saved_locations" ON saved_locations;
CREATE POLICY "anon_select_saved_locations" ON saved_locations FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_saved_locations" ON saved_locations;
CREATE POLICY "anon_insert_saved_locations" ON saved_locations FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_saved_locations" ON saved_locations;
CREATE POLICY "anon_update_saved_locations" ON saved_locations FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_saved_locations" ON saved_locations;
CREATE POLICY "anon_delete_saved_locations" ON saved_locations FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS label_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  layout jsonb NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE label_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_label_templates" ON label_templates;
CREATE POLICY "anon_select_label_templates" ON label_templates FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_label_templates" ON label_templates;
CREATE POLICY "anon_insert_label_templates" ON label_templates FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_label_templates" ON label_templates;
CREATE POLICY "anon_update_label_templates" ON label_templates FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_label_templates" ON label_templates;
CREATE POLICY "anon_delete_label_templates" ON label_templates FOR DELETE
  TO anon, authenticated USING (true);

-- Insert a default template optimized for 2.25" x 1.25" labels
INSERT INTO label_templates (name, layout, is_default)
SELECT 'Basic Inventory', jsonb_build_object(
  'fields', jsonb_build_array(
    jsonb_build_object('id', 'title', 'label', 'Item Title', 'enabled', true, 'position', 'top-center', 'fontSize', 11, 'bold', true, 'autoFit', true),
    jsonb_build_object('id', 'location', 'label', 'Location', 'enabled', true, 'position', 'bottom-left', 'fontSize', 9, 'bold', false, 'autoFit', false),
    jsonb_build_object('id', 'price', 'label', 'Price', 'enabled', true, 'position', 'bottom-right', 'fontSize', 9, 'bold', false, 'autoFit', false)
  )
), true
WHERE NOT EXISTS (SELECT 1 FROM label_templates WHERE name = 'Basic Inventory');