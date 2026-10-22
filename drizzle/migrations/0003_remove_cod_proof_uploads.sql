ALTER TABLE public.orders
  DROP COLUMN IF EXISTS proof_image_url,
  DROP COLUMN IF EXISTS proof_uploaded_at;

DROP POLICY IF EXISTS "order proofs public read" ON storage.objects;
DROP POLICY IF EXISTS "order proofs owner upload" ON storage.objects;
DROP POLICY IF EXISTS "order proofs owner update" ON storage.objects;
DROP POLICY IF EXISTS "order proofs owner delete" ON storage.objects;
