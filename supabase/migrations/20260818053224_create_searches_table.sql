/*
# Create searches table for product lookup history (single-tenant, no auth)

1. New Tables
- `searches`
  - `id` (uuid, primary key)
  - `query` (text, not null) — the model number or barcode entered by the user
  - `query_type` (text, not null) — either 'model' or 'barcode'
  - `result` (jsonb, nullable) — the full AI-returned product data (title, description, specs, prices, image, link)
  - `created_at` (timestamptz, default now())

2. Security
- Enable RLS on `searches`.
- Allow anon + authenticated CRUD because this is a single-user tool with no sign-in screen.
- All four CRUD policies use `USING (true)` / `WITH CHECK (true)` because the data is intentionally shared (no multi-user isolation needed).

3. Indexes
- `searches_created_at_idx` on `created_at` DESC for efficient history listing.
*/

CREATE TABLE IF NOT EXISTS searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  query_type text NOT NULL DEFAULT 'model',
  result jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE searches ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS searches_created_at_idx ON searches (created_at DESC);

DROP POLICY IF EXISTS "anon_select_searches" ON searches;
CREATE POLICY "anon_select_searches" ON searches FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_searches" ON searches;
CREATE POLICY "anon_insert_searches" ON searches FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_searches" ON searches;
CREATE POLICY "anon_update_searches" ON searches FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_searches" ON searches;
CREATE POLICY "anon_delete_searches" ON searches FOR DELETE
  TO anon, authenticated USING (true);