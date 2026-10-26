-- Keep historical `cod` rows unclassified because the old app did not record
-- who collected payment. New courier COD and shop-delivery cash use distinct values.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_method_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('cod', 'courier_cod', 'prepaid', 'seller_delivery_cash'));

-- Lock the Messenger session and create the order with the selected collection
-- method in one transaction. This preserves the existing idempotency guard.
CREATE OR REPLACE FUNCTION public.place_order_from_messenger_with_payment_method(
  _owner uuid,
  _psid text,
  _product_id uuid,
  _qty int,
  _name text,
  _phone text,
  _township text,
  _address text,
  _note text,
  _payment_method text
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.messenger_sessions%ROWTYPE;
  o public.orders%ROWTYPE;
BEGIN
  IF _payment_method NOT IN ('courier_cod', 'seller_delivery_cash') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METHOD';
  END IF;

  SELECT * INTO s
  FROM public.messenger_sessions
  WHERE owner_id = _owner AND psid = _psid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_ALREADY_PROCESSED';
  END IF;
  IF s.state <> 'confirm'
     OR s.data ->> 'product_id' IS DISTINCT FROM _product_id::text
     OR s.data ->> 'qty' IS DISTINCT FROM _qty::text
     OR s.data ->> 'payment_method' IS DISTINCT FROM _payment_method THEN
    RAISE EXCEPTION 'ORDER_ALREADY_PROCESSED';
  END IF;

  UPDATE public.messenger_sessions
  SET state = 'placing_order', updated_at = now()
  WHERE owner_id = _owner AND psid = _psid;

  SELECT * INTO o
  FROM public.place_order(_owner, _psid, _product_id, _qty, _name, _phone, _township, _address, _note);

  UPDATE public.orders
  SET payment_method = _payment_method
  WHERE id = o.id AND owner_id = _owner
  RETURNING * INTO o;

  UPDATE public.messenger_sessions
  SET state = 'idle', data = '{}'::jsonb, updated_at = now()
  WHERE owner_id = _owner AND psid = _psid;

  RETURN o;
END;
$$;

REVOKE ALL ON FUNCTION public.place_order_from_messenger_with_payment_method(
  uuid, text, uuid, int, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_order_from_messenger_with_payment_method(
  uuid, text, uuid, int, text, text, text, text, text, text
) TO service_role;

COMMENT ON FUNCTION public.place_order_from_messenger_with_payment_method(
  uuid, text, uuid, int, text, text, text, text, text, text
) IS
  'Creates a Messenger order atomically with either courier-collected COD or cash collected by the shop delivery person.';
