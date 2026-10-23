-- Run this once if the Shop database reports that orders.delivery_status does not exist.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS tracking_url text,
  ADD COLUMN IF NOT EXISTS delivery_image_url text,
  ADD COLUMN IF NOT EXISTS delivery_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS public_order_id text;

UPDATE public.orders
SET delivery_status = 'confirmed'
WHERE delivery_status IS NULL OR delivery_status = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_delivery_status_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_delivery_status_check
      CHECK (delivery_status IN ('confirmed', 'preparing', 'shipped', 'in_transit', 'delivered', 'cancelled'));
  END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS public.orders_public_order_id_seq START WITH 100000 INCREMENT BY 1;

WITH numbered AS (
  SELECT id, (100000 + row_number() OVER (ORDER BY created_at, id))::text AS public_id
  FROM public.orders
  WHERE public_order_id IS NULL OR public_order_id !~ '^[0-9]{6}$'
)
UPDATE public.orders o
SET public_order_id = n.public_id
FROM numbered n
WHERE o.id = n.id;

SELECT setval(
  'public.orders_public_order_id_seq',
  GREATEST(100000, COALESCE((SELECT max(public_order_id::bigint) FROM public.orders WHERE public_order_id ~ '^[0-9]{6}$'), 99999))
);

CREATE OR REPLACE FUNCTION public.orders_assign_public_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.public_order_id IS NULL OR NEW.public_order_id = '' THEN
    NEW.public_order_id := lpad(nextval('public.orders_public_order_id_seq')::text, 6, '0');
  END IF;
  IF NEW.public_order_id !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'Order ID must be exactly 6 digits';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orders_assign_public_id ON public.orders;
CREATE TRIGGER trg_orders_assign_public_id
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_assign_public_id();

ALTER TABLE public.orders ALTER COLUMN public_order_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS orders_public_order_id_key ON public.orders(public_order_id);
CREATE INDEX IF NOT EXISTS orders_owner_delivery_status_idx ON public.orders(owner_id, delivery_status, created_at DESC);

INSERT INTO storage.buckets (id, name, public)
VALUES ('delivery-images', 'delivery-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "delivery images public read" ON storage.objects;
CREATE POLICY "delivery images public read" ON storage.objects FOR SELECT USING (bucket_id = 'delivery-images');
DROP POLICY IF EXISTS "delivery images owner upload" ON storage.objects;
CREATE POLICY "delivery images owner upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'delivery-images' AND (storage.foldername(name))[1] = auth.uid()::text);
