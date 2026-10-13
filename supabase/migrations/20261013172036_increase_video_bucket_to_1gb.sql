/*
# Increase video storage bucket to 1GB limit

## Changes
- Update `training-videos` storage bucket file_size_limit from 500MB to 1GB (1073741824 bytes)
  to allow longer video uploads (up to 10 minutes at reasonable quality).
- Also increase `training-images` and `training-documents` to 200MB each.
## Security
- No policy changes. Existing admin-only write policies remain the same.
*/

UPDATE storage.buckets
SET file_size_limit = 1073741824
WHERE id = 'training-videos';

UPDATE storage.buckets
SET file_size_limit = 209715200
WHERE id = 'training-images';

UPDATE storage.buckets
SET file_size_limit = 209715200
WHERE id = 'training-documents';
