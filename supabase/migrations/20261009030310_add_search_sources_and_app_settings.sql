/*
# Add search sources and app settings

1. search_sources — custom sites the AI should search in addition to defaults
2. app_settings — single-row key-value store for price limit etc.
*/

CREATE TABLE IF NOT EXISTS search_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE search_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_search_sources" ON search_sources;
CREATE POLICY "anon_select_search_sources" ON search_sources FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_search_sources" ON search_sources;
CREATE POLICY "anon_insert_search_sources" ON search_sources FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_search_sources" ON search_sources;
CREATE POLICY "anon_update_search_sources" ON search_sources FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_search_sources" ON search_sources;
CREATE POLICY "anon_delete_search_sources" ON search_sources FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_app_settings" ON app_settings;
CREATE POLICY "anon_select_app_settings" ON app_settings FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_app_settings" ON app_settings;
CREATE POLICY "anon_insert_app_settings" ON app_settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_app_settings" ON app_settings;
CREATE POLICY "anon_update_app_settings" ON app_settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_app_settings" ON app_settings;
CREATE POLICY "anon_delete_app_settings" ON app_settings FOR DELETE
  TO anon, authenticated USING (true);

INSERT INTO app_settings (key, value) VALUES ('price_limit', '300')
  ON CONFLICT (key) DO NOTHING;
