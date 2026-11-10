CREATE OR REPLACE FUNCTION public.delete_shipped_order_records(_public_order_ids text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE deleted_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  DELETE FROM public.orders
   WHERE owner_id = auth.uid()
     AND public_order_id = ANY(_public_order_ids)
     AND (sent = true OR delivery_status = 'returned');

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END $$;

REVOKE ALL ON FUNCTION public.delete_shipped_order_records(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_shipped_order_records(text[]) TO authenticated;
