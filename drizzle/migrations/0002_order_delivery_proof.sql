ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS tracking_url text,
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
