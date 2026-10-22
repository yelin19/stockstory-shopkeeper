CREATE TABLE IF NOT EXISTS public.stock_action_requests (
  owner_id uuid NOT NULL,
  request_id uuid NOT NULL,
  product_id uuid NOT NULL,
  final_stock int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, request_id)
);

GRANT ALL ON public.stock_action_requests TO service_role;
GRANT SELECT, INSERT ON public.stock_action_requests TO authenticated;
ALTER TABLE public.stock_action_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own stock action requests" ON public.stock_action_requests;
CREATE POLICY "own stock action requests" ON public.stock_action_requests FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP FUNCTION IF EXISTS public.change_stock(uuid, integer, text, text);

CREATE FUNCTION public.change_stock(
  _product_id uuid,
  _delta int,
  _reason text,
  _note text,
  _request_id uuid DEFAULT NULL
)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p products%ROWTYPE;
  previous stock_action_requests%ROWTYPE;
BEGIN
  IF _request_id IS NOT NULL THEN
    SELECT * INTO previous FROM stock_action_requests
      WHERE owner_id = auth.uid() AND request_id = _request_id;
    IF FOUND THEN RETURN previous.final_stock; END IF;
  END IF;

  IF _reason NOT IN ('increase','adjust') THEN RAISE EXCEPTION 'Invalid reason'; END IF;
  IF _reason = 'increase' AND _delta <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
  PERFORM set_config('shop.stock_rpc','on', true);
  UPDATE products SET stock = stock + _delta
   WHERE id = _product_id AND owner_id = auth.uid() AND stock + _delta >= 0
   RETURNING * INTO p;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found or stock would go negative'; END IF;
  INSERT INTO stock_history(owner_id, product_id, product_code, change, balance, reason, note)
  VALUES (p.owner_id, p.id, p.code, _delta, p.stock, _reason, _note);
  IF _request_id IS NOT NULL THEN
    INSERT INTO stock_action_requests(owner_id, request_id, product_id, final_stock)
    VALUES (auth.uid(), _request_id, _product_id, p.stock)
    ON CONFLICT (owner_id, request_id) DO NOTHING;
  END IF;
  PERFORM set_config('shop.stock_rpc','off', true);
  RETURN p.stock;
END $$;

REVOKE ALL ON FUNCTION public.change_stock(uuid, integer, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_stock(uuid, integer, text, text, uuid) TO authenticated;
