-- Create the attachments storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('attachments', 'attachments', true, 10485760)
ON CONFLICT (id) DO NOTHING;

-- RLS: Users can upload to their own folder
CREATE POLICY "Users can upload own files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS: Users can read own files
CREATE POLICY "Users can read own files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS: Users can delete own files
CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
