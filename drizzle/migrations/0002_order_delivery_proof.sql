ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS tracking_url text,
  ADD COLUMN IF NOT EXISTS proof_image_url text,
  ADD COLUMN IF NOT EXISTS proof_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_delivery_status_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_delivery_status_check
      CHECK (delivery_status IN ('confirmed', 'preparing', 'shipped', 'in_transit', 'delivered', 'cancelled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS orders_owner_delivery_status_idx
  ON public.orders(owner_id, delivery_status, created_at DESC);

INSERT INTO storage.buckets (id, name, public)
VALUES ('order-proofs', 'order-proofs', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "order proofs public read" ON storage.objects;
CREATE POLICY "order proofs public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'order-proofs');

DROP POLICY IF EXISTS "order proofs owner upload" ON storage.objects;
CREATE POLICY "order proofs owner upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'order-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "order proofs owner update" ON storage.objects;
CREATE POLICY "order proofs owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'order-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "order proofs owner delete" ON storage.objects;
CREATE POLICY "order proofs owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'order-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
