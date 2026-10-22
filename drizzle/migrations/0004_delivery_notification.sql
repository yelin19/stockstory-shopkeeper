ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_image_url text,
  ADD COLUMN IF NOT EXISTS delivery_notified_at timestamptz;

INSERT INTO storage.buckets (id, name, public)
VALUES ('delivery-images', 'delivery-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "delivery images public read" ON storage.objects;
CREATE POLICY "delivery images public read" ON storage.objects FOR SELECT USING (bucket_id = 'delivery-images');

DROP POLICY IF EXISTS "delivery images owner upload" ON storage.objects;
CREATE POLICY "delivery images owner upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'delivery-images' AND (storage.foldername(name))[1] = auth.uid()::text);
