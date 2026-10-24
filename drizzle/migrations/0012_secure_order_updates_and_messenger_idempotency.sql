-- Prevent authenticated clients from mutating order quantities, totals, or status
-- outside the stock-aware RPCs while retaining the fields used by admin shipping.
REVOKE UPDATE ON TABLE public.orders FROM authenticated;
GRANT UPDATE (
  delivery_status,
  tracking_number,
  tracking_url,
  delivery_image_url,
  sent,
  sent_at,
  delivery_notified_at,
  payment_status,
  payment_approved_at,
  updated_at
) ON TABLE public.orders TO authenticated;

-- Serialize Messenger confirmations on their session row. A duplicate/concurrent
-- YES event sees the session leave `confirm` and cannot decrement stock twice.
CREATE OR REPLACE FUNCTION public.place_order_from_messenger(
  _owner uuid,
  _psid text,
  _product_id uuid,
  _qty int,
  _name text,
  _phone text,
  _township text,
  _address text,
  _note text
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
  SELECT * INTO s
  FROM public.messenger_sessions
  WHERE owner_id = _owner AND psid = _psid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_ALREADY_PROCESSED';
  END IF;
  IF s.state <> 'confirm'
     OR s.data ->> 'product_id' IS DISTINCT FROM _product_id::text
     OR s.data ->> 'qty' IS DISTINCT FROM _qty::text THEN
    RAISE EXCEPTION 'ORDER_ALREADY_PROCESSED';
  END IF;

  UPDATE public.messenger_sessions
  SET state = 'placing_order', updated_at = now()
  WHERE owner_id = _owner AND psid = _psid;

  SELECT * INTO o
  FROM public.place_order(_owner, _psid, _product_id, _qty, _name, _phone, _township, _address, _note);

  UPDATE public.messenger_sessions
  SET state = 'idle', data = '{}'::jsonb, updated_at = now()
  WHERE owner_id = _owner AND psid = _psid;

  RETURN o;
END;
$$;

REVOKE ALL ON FUNCTION public.place_order_from_messenger(uuid, text, uuid, int, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_order_from_messenger(uuid, text, uuid, int, text, text, text, text, text)
  TO service_role;
