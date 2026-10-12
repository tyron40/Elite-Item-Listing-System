/*
# Increase video bucket file size limit

1. Changes
- Update `training-videos` storage bucket to allow files up to 500MB (was default 50MB).
- Also update `training-images` and `training-documents` to allow larger files (100MB each).
2. Security
- No policy changes. Existing storage policies remain the same.
*/

UPDATE storage.buckets
SET file_size_limit = 524288000
WHERE id = 'training-videos';

UPDATE storage.buckets
SET file_size_limit = 104857600
WHERE id = 'training-images';

UPDATE storage.buckets
SET file_size_limit = 104857600
WHERE id = 'training-documents';
