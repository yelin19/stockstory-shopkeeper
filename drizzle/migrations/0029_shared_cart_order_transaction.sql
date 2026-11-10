-- Shared cart orders intentionally use one customer-facing Order ID across
-- multiple database rows (one row per product, so stock and fulfillment remain
-- item-specific). This migration is idempotent so it can be applied safely to
-- deployments that missed 0026/0027.
DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%public_order_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS %I', item.conname);
  END LOOP;

  FOR item IN
    SELECT indexrelid::regclass AS index_name
    FROM pg_index
    WHERE indrelid = 'public.orders'::regclass
      AND indisunique
      AND pg_get_indexdef(indexrelid) ILIKE '%public_order_id%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %s', item.index_name);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS orders_public_order_id_idx
  ON public.orders(public_order_id);

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
    END IF;

    UPDATE public.orders
    SET public_order_id = first_order_id,
        payment_method = _payment_method,
        updated_at = now()
    WHERE id = o.id
    RETURNING * INTO o;

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

CREATE OR REPLACE FUNCTION public.cancel_order_by_customer(
  _owner uuid,
  _psid text,
  _public_order_id text
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
  p public.products%ROWTYPE;
  result_order public.orders%ROWTYPE;
  found_order boolean := false;
BEGIN
  FOR o IN
    SELECT *
    FROM public.orders
    WHERE owner_id = _owner
      AND psid = _psid
      AND public_order_id = _public_order_id
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    found_order := true;
    IF o.status = 'cancelled' THEN
      IF result_order.id IS NULL THEN result_order := o; END IF;
      CONTINUE;
    END IF;
    IF o.sent OR o.delivery_status IN ('shipped', 'in_transit', 'delivered', 'returned') THEN
      RAISE EXCEPTION 'ORDER_LOCKED';
    END IF;

    UPDATE public.orders
    SET status = 'cancelled', updated_at = now()
    WHERE id = o.id
    RETURNING * INTO o;

    IF o.product_id IS NOT NULL THEN
      PERFORM set_config('shop.stock_rpc', 'on', true);
      UPDATE public.products
      SET stock = stock + o.quantity
      WHERE id = o.product_id
      RETURNING * INTO p;
      IF FOUND THEN
        INSERT INTO public.stock_history(owner_id, product_id, product_code, change, balance, reason, order_id, note)
        VALUES (o.owner_id, p.id, p.code, o.quantity, p.stock, 'cancel', o.id,
          'Order #' || o.order_no || ' cancelled by customer');
      END IF;
      PERFORM set_config('shop.stock_rpc', 'off', true);
    END IF;

    IF result_order.id IS NULL THEN result_order := o; END IF;
  END LOOP;

  IF NOT found_order THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  RETURN result_order;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_order_by_customer(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order_by_customer(uuid, text, text)
  TO service_role;
