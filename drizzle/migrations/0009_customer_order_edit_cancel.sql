-- Let a Messenger customer edit quantity or cancel their own order before shipping.
CREATE OR REPLACE FUNCTION public.edit_order_by_customer(
  _owner uuid,
  _psid text,
  _public_order_id text,
  _qty int
)
RETURNS orders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o orders%ROWTYPE;
  p products%ROWTYPE;
  delta int;
BEGIN
  IF _qty <= 0 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;

  SELECT * INTO o
  FROM orders
  WHERE owner_id = _owner AND psid = _psid AND public_order_id = _public_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF o.status = 'cancelled' OR o.sent OR o.delivery_status IN ('shipped', 'in_transit', 'delivered', 'returned') THEN
    RAISE EXCEPTION 'ORDER_LOCKED';
  END IF;
  IF o.product_id IS NULL THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;

  SELECT * INTO p FROM products WHERE id = o.product_id AND owner_id = _owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;

  delta := _qty - o.quantity;
  IF delta > 0 THEN
    PERFORM set_config('shop.stock_rpc', 'on', true);
    UPDATE products SET stock = stock - delta
    WHERE id = p.id AND stock >= delta
    RETURNING * INTO p;
    IF NOT FOUND THEN
      PERFORM set_config('shop.stock_rpc', 'off', true);
      RAISE EXCEPTION 'OUT_OF_STOCK';
    END IF;
  ELSIF delta < 0 THEN
    PERFORM set_config('shop.stock_rpc', 'on', true);
    UPDATE products SET stock = stock - delta WHERE id = p.id RETURNING * INTO p;
  END IF;

  UPDATE orders
  SET quantity = _qty, total = unit_price * _qty, updated_at = now()
  WHERE id = o.id
  RETURNING * INTO o;

  IF delta <> 0 THEN
    INSERT INTO stock_history(owner_id, product_id, product_code, change, balance, reason, order_id, note)
    VALUES (o.owner_id, p.id, p.code, -delta, p.stock, 'adjust', o.id, 'Order #' || o.order_no || ' quantity edited by customer');
  END IF;
  PERFORM set_config('shop.stock_rpc', 'off', true);
  RETURN o;
END $$;
REVOKE ALL ON FUNCTION public.edit_order_by_customer FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.edit_order_by_customer TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_order_by_customer(
  _owner uuid,
  _psid text,
  _public_order_id text
)
RETURNS orders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o orders%ROWTYPE;
  p products%ROWTYPE;
BEGIN
  SELECT * INTO o
  FROM orders
  WHERE owner_id = _owner AND psid = _psid AND public_order_id = _public_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF o.status = 'cancelled' THEN RETURN o; END IF;
  IF o.sent OR o.delivery_status IN ('shipped', 'in_transit', 'delivered', 'returned') THEN
    RAISE EXCEPTION 'ORDER_LOCKED';
  END IF;

  UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = o.id RETURNING * INTO o;
  IF o.product_id IS NOT NULL THEN
    PERFORM set_config('shop.stock_rpc', 'on', true);
    UPDATE products SET stock = stock + o.quantity
    WHERE id = o.product_id
    RETURNING * INTO p;
    IF FOUND THEN
      INSERT INTO stock_history(owner_id, product_id, product_code, change, balance, reason, order_id, note)
      VALUES (o.owner_id, p.id, p.code, o.quantity, p.stock, 'cancel', o.id, 'Order #' || o.order_no || ' cancelled by customer');
    END IF;
    PERFORM set_config('shop.stock_rpc', 'off', true);
  END IF;
  RETURN o;
END $$;
REVOKE ALL ON FUNCTION public.cancel_order_by_customer FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order_by_customer TO service_role;
