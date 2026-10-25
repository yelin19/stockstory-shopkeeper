-- Store a configurable unit for each product and snapshot it onto future orders.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'ခု';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS product_unit text NOT NULL DEFAULT 'ခု';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_unit_length_check' AND conrelid = 'public.products'::regclass) THEN
    ALTER TABLE public.products ADD CONSTRAINT products_unit_length_check
      CHECK (char_length(btrim(unit)) BETWEEN 1 AND 32);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_product_unit_length_check' AND conrelid = 'public.orders'::regclass) THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_product_unit_length_check
      CHECK (char_length(btrim(product_unit)) BETWEEN 1 AND 32);
  END IF;
END;
$$;

UPDATE public.orders o
SET product_unit = p.unit
FROM public.products p
WHERE o.product_id = p.id;

CREATE OR REPLACE FUNCTION public.snapshot_order_product_unit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    SELECT p.unit INTO NEW.product_unit
    FROM public.products p
    WHERE p.id = NEW.product_id;
  END IF;
  NEW.product_unit := COALESCE(NULLIF(btrim(NEW.product_unit), ''), 'ခု');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.snapshot_order_product_unit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_orders_snapshot_product_unit ON public.orders;
CREATE TRIGGER trg_orders_snapshot_product_unit
  BEFORE INSERT OR UPDATE OF product_id ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_order_product_unit();

-- Return each product's unit with its public data.
DROP FUNCTION IF EXISTS public.get_public_product(text);
CREATE FUNCTION public.get_public_product(_code text)
RETURNS TABLE(
  code text,
  name text,
  category text,
  price numeric,
  stock int,
  unit text,
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
    p.unit,
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
        AND o.product_unit = p.unit
        AND o.status <> 'cancelled'
        AND o.delivery_status <> 'returned'
    ), 0)::bigint AS sold_count
  FROM public.products p
  LEFT JOIN public.shop_settings s ON s.owner_id = p.owner_id
  WHERE p.code = _code AND p.active
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_product(text) TO anon, authenticated, service_role;

-- Include the configured unit in low-stock alerts.
DROP FUNCTION IF EXISTS public.claim_low_stock_alerts(uuid, uuid);
CREATE FUNCTION public.claim_low_stock_alerts(_owner uuid, _product_id uuid DEFAULT NULL)
RETURNS TABLE(
  product_id uuid,
  product_code text,
  product_name text,
  stock int,
  unit text,
  threshold int,
  recipient_psid text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT p.id, p.code, p.name, p.stock, p.unit, s.low_stock_threshold, s.low_stock_alert_psid
    FROM public.products p
    JOIN public.shop_settings s ON s.owner_id = p.owner_id
    WHERE p.owner_id = _owner
      AND (_product_id IS NULL OR p.id = _product_id)
      AND p.active
      AND p.stock <= s.low_stock_threshold
      AND NOT p.low_stock_alert_sent
      AND s.low_stock_alert_psid IS NOT NULL
    FOR UPDATE OF p SKIP LOCKED
  ), claimed AS (
    UPDATE public.products p
    SET low_stock_alert_sent = true
    FROM candidates c
    WHERE p.id = c.id
    RETURNING p.id, c.code, c.name, p.stock, c.unit, c.low_stock_threshold, c.low_stock_alert_psid
  )
  SELECT claimed.id, claimed.code, claimed.name, claimed.stock, claimed.unit, claimed.low_stock_threshold, claimed.low_stock_alert_psid
  FROM claimed;
$$;
REVOKE ALL ON FUNCTION public.claim_low_stock_alerts(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_low_stock_alerts(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
