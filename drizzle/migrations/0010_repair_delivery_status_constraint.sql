-- Repair legacy delivery_status checks so new orders can use the current workflow.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'confirmed';

ALTER TABLE public.orders
  ALTER COLUMN delivery_status SET DEFAULT 'confirmed';

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public'
      AND rel.relname = 'orders'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%delivery_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

UPDATE public.orders
SET delivery_status = 'confirmed'
WHERE delivery_status IS NULL
   OR delivery_status NOT IN ('confirmed', 'preparing', 'shipped', 'in_transit', 'delivered', 'returned', 'cancelled');

ALTER TABLE public.orders
  ALTER COLUMN delivery_status SET NOT NULL;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_delivery_status_check
  CHECK (delivery_status IN ('confirmed', 'preparing', 'shipped', 'in_transit', 'delivered', 'returned', 'cancelled));
