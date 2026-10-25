CREATE OR REPLACE FUNCTION public.preview_order_history_cleanup(
  _start_at timestamptz,
  _end_at timestamptz
)
RETURNS TABLE(eligible_count integer, protected_count integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner_id uuid := auth.uid();
BEGIN
  IF _owner_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _start_at IS NULL OR _end_at IS NULL OR _end_at <= _start_at THEN
    RAISE EXCEPTION 'Invalid date range';
  END IF;

  RETURN QUERY
  SELECT
    count(*) FILTER (
      WHERE o.status = 'cancelled'
         OR o.status = 'delivered'
         OR o.delivery_status = 'delivered'
    )::integer AS eligible_count,
    count(*) FILTER (
      WHERE NOT (
        o.status = 'cancelled'
        OR o.status = 'delivered'
        OR o.delivery_status = 'delivered'
      )
    )::integer AS protected_count
  FROM public.orders AS o
  WHERE o.owner_id = _owner_id
    AND o.created_at >= _start_at
    AND o.created_at < _end_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_order_history_range(
  _start_at timestamptz,
  _end_at timestamptz,
  _expected_count integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner_id uuid := auth.uid();
  _deleted_count integer;
BEGIN
  IF _owner_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _start_at IS NULL OR _end_at IS NULL OR _end_at <= _start_at THEN
    RAISE EXCEPTION 'Invalid date range';
  END IF;
  IF _expected_count IS NULL OR _expected_count < 0 THEN
    RAISE EXCEPTION 'Invalid expected count';
  END IF;

  WITH targets AS MATERIALIZED (
    SELECT o.id
    FROM public.orders AS o
    WHERE o.owner_id = _owner_id
      AND o.created_at >= _start_at
      AND o.created_at < _end_at
      AND (
        o.status = 'cancelled'
        OR o.status = 'delivered'
        OR o.delivery_status = 'delivered'
      )
    FOR UPDATE
  ), deleted AS (
    DELETE FROM public.orders AS o
    USING targets AS t
    WHERE o.id = t.id
    RETURNING o.id
  )
  SELECT count(*)::integer INTO _deleted_count
  FROM deleted;

  IF _deleted_count <> _expected_count THEN
    RAISE EXCEPTION 'CLEANUP_PREVIEW_STALE';
  END IF;

  RETURN _deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_stock_history_cleanup(
  _start_at timestamptz,
  _end_at timestamptz
)
RETURNS TABLE(record_count integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner_id uuid := auth.uid();
BEGIN
  IF _owner_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _start_at IS NULL OR _end_at IS NULL OR _end_at <= _start_at THEN
    RAISE EXCEPTION 'Invalid date range';
  END IF;

  RETURN QUERY
  SELECT count(*)::integer
  FROM public.stock_history AS h
  WHERE h.owner_id = _owner_id
    AND h.created_at >= _start_at
    AND h.created_at < _end_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_stock_history_range(
  _start_at timestamptz,
  _end_at timestamptz,
  _expected_count integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner_id uuid := auth.uid();
  _deleted_count integer;
BEGIN
  IF _owner_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _start_at IS NULL OR _end_at IS NULL OR _end_at <= _start_at THEN
    RAISE EXCEPTION 'Invalid date range';
  END IF;
  IF _expected_count IS NULL OR _expected_count < 0 THEN
    RAISE EXCEPTION 'Invalid expected count';
  END IF;

  WITH targets AS MATERIALIZED (
    SELECT h.id
    FROM public.stock_history AS h
    WHERE h.owner_id = _owner_id
      AND h.created_at >= _start_at
      AND h.created_at < _end_at
    FOR UPDATE
  ), deleted AS (
    DELETE FROM public.stock_history AS h
    USING targets AS t
    WHERE h.id = t.id
    RETURNING h.id
  )
  SELECT count(*)::integer INTO _deleted_count
  FROM deleted;

  IF _deleted_count <> _expected_count THEN
    RAISE EXCEPTION 'CLEANUP_PREVIEW_STALE';
  END IF;

  RETURN _deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_order_history_cleanup(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_order_history_range(timestamptz, timestamptz, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.preview_stock_history_cleanup(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_stock_history_range(timestamptz, timestamptz, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.preview_order_history_cleanup(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_order_history_range(timestamptz, timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_stock_history_cleanup(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_stock_history_range(timestamptz, timestamptz, integer) TO authenticated;

COMMENT ON FUNCTION public.preview_order_history_cleanup(timestamptz, timestamptz) IS
  'Counts owner-scoped cancelled or delivered orders eligible for date-range deletion and protects unfinished orders.';
COMMENT ON FUNCTION public.delete_order_history_range(timestamptz, timestamptz, integer) IS
  'Deletes only owner-scoped cancelled or delivered orders in a date range, if the current count matches the preview. Does not change product stock or stock history.';
COMMENT ON FUNCTION public.preview_stock_history_cleanup(timestamptz, timestamptz) IS
  'Counts owner-scoped stock-history entries in a date range.';
COMMENT ON FUNCTION public.delete_stock_history_range(timestamptz, timestamptz, integer) IS
  'Deletes owner-scoped stock-history entries in a date range only if the current count matches the preview. Does not change product stock.';
