-- Allow each shop to choose MMK or THB. Existing numeric product prices are not converted.
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'MMK';

-- Preserve the currency used when each order was placed.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'MMK';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shop_settings_currency_check'
      AND conrelid = 'public.shop_settings'::regclass
  ) THEN
    ALTER TABLE public.shop_settings
      ADD CONSTRAINT shop_settings_currency_check CHECK (currency IN ('MMK', 'THB'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_currency_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_currency_check CHECK (currency IN ('MMK', 'THB'));
  END IF;
END;
$$;

-- Snapshot the shop's selected unit for every new order.
CREATE OR REPLACE FUNCTION public.capture_order_currency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  shop_currency text;
BEGIN
  SELECT s.currency INTO shop_currency
  FROM public.shop_settings s
  WHERE s.owner_id = NEW.owner_id;

  NEW.currency := COALESCE(shop_currency, NEW.currency, 'MMK');
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_order_currency() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_orders_capture_currency ON public.orders;
CREATE TRIGGER trg_orders_capture_currency
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.capture_order_currency();

-- Add the selected currency to the public product data without exposing shop settings.
DROP FUNCTION IF EXISTS public.get_public_product(text);

CREATE FUNCTION public.get_public_product(_code text)
RETURNS TABLE(
  code text,
  name text,
  category text,
  price numeric,
  stock int,
  image_url text,
  description text,
  shop_name text,
  messenger_username text,
  currency text,
  sold_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.code,
    p.name,
    p.category,
    p.price,
    p.stock,
    p.image_url,
    p.description,
    s.shop_name,
    s.messenger_username,
    COALESCE(s.currency, 'MMK')::text AS currency,
    COALESCE((
      SELECT SUM(o.quantity)::bigint
      FROM public.orders o
      WHERE o.owner_id = p.owner_id
        AND o.product_id = p.id
        AND o.status <> 'cancelled'
        AND o.delivery_status <> 'returned'
    ), 0)::bigint AS sold_count
  FROM public.products p
  LEFT JOIN public.shop_settings s ON s.owner_id = p.owner_id
  WHERE p.code = _code AND p.active
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_product(text) TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
