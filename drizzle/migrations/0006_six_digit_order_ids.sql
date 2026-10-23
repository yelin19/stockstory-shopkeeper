ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS public_order_id text;

-- Existing orders receive stable six-digit IDs.
WITH numbered AS (
  SELECT id, (100000 + row_number() OVER (ORDER BY created_at, id))::text AS public_id
  FROM public.orders
  WHERE public_order_id IS NULL
)
UPDATE public.orders o
SET public_order_id = n.public_id
FROM numbered n
WHERE o.id = n.id;

CREATE SEQUENCE IF NOT EXISTS public.orders_public_order_id_seq START WITH 100000 INCREMENT BY 1;
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
