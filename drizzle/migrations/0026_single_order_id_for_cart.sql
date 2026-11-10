-- A cart checkout stores one row per product for stock and fulfillment, but all
-- rows from the same checkout must share one customer-facing Order ID.
DROP INDEX IF EXISTS public.orders_public_order_id_key;
CREATE INDEX IF NOT EXISTS orders_public_order_id_idx ON public.orders(public_order_id);

CREATE OR REPLACE FUNCTION public.place_cart_orders_from_messenger(
  _owner uuid,
  _psid text,
  _items jsonb,
  _name text,
  _phone text,
  _township text,
  _address text,
  _note text,
  _payment_method text
)
RETURNS SETOF public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.messenger_sessions%ROWTYPE;
  item jsonb;
  o public.orders%ROWTYPE;
  first_order_id text;
  item_product_id uuid;
  item_qty int;
BEGIN
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'CART_EMPTY';
  END IF;
  IF _payment_method NOT IN ('prepaid', 'seller_delivery_cash') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METHOD';
  END IF;

  SELECT * INTO s
  FROM public.messenger_sessions
  WHERE owner_id = _owner AND psid = _psid
  FOR UPDATE;

  IF NOT FOUND OR s.state <> 'confirm' OR s.data -> 'cart' IS NULL THEN
    RAISE EXCEPTION 'ORDER_ALREADY_PROCESSED';
  END IF;

  UPDATE public.messenger_sessions
  SET state = 'placing_order', updated_at = now()
  WHERE owner_id = _owner AND psid = _psid;

  FOR item IN SELECT value FROM jsonb_array_elements(_items)
  LOOP
    item_product_id := NULLIF(item ->> 'product_id', '')::uuid;
    item_qty := (item ->> 'qty')::int;
    IF item_product_id IS NULL OR item_qty IS NULL OR item_qty <= 0 THEN
      RAISE EXCEPTION 'INVALID_CART_ITEM';
    END IF;

    SELECT * INTO o
    FROM public.place_order(
      _owner, _psid, item_product_id, item_qty,
      _name, _phone, _township, _address, _note
    );

    IF first_order_id IS NULL THEN
      first_order_id := o.public_order_id;
    ELSE
      UPDATE public.orders
      SET public_order_id = first_order_id,
          payment_method = _payment_method,
          updated_at = now()
      WHERE id = o.id
      RETURNING * INTO o;
    END IF;

    IF first_order_id = o.public_order_id THEN
      UPDATE public.orders
      SET payment_method = _payment_method,
          updated_at = now()
      WHERE id = o.id
      RETURNING * INTO o;
    END IF;

    RETURN NEXT o;
  END LOOP;

  UPDATE public.messenger_sessions
  SET state = 'idle', data = '{}'::jsonb, updated_at = now()
  WHERE owner_id = _owner AND psid = _psid;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.place_cart_orders_from_messenger(
  uuid, text, jsonb, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_cart_orders_from_messenger(
  uuid, text, jsonb, text, text, text, text, text, text
) TO service_role;

COMMENT ON FUNCTION public.place_cart_orders_from_messenger(
  uuid, text, jsonb, text, text, text, text, text, text
) IS 'Creates all cart lines atomically while assigning one shared customer-facing Order ID.';
