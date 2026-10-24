-- Expose only an aggregate sold-unit count on the public product lookup.
-- Cancelled and returned orders are not counted as successful sales.
CREATE INDEX IF NOT EXISTS orders_active_product_sales_idx
  ON public.orders (owner_id, product_id)
  WHERE status <> 'cancelled' AND delivery_status <> 'returned';

-- The OUT row shape changes, so PostgreSQL requires dropping and recreating the function.
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
