-- Pair one Messenger recipient per shop with a one-time PIN and track alert delivery per product.
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS low_stock_alert_pin_hash text,
  ADD COLUMN IF NOT EXISTS low_stock_alert_psid text;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS low_stock_alert_sent boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.low_stock_alert_pair_attempts (
  owner_id uuid NOT NULL,
  psid text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz,
  PRIMARY KEY (owner_id, psid)
);
GRANT ALL ON public.low_stock_alert_pair_attempts TO service_role;
ALTER TABLE public.low_stock_alert_pair_attempts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_low_stock_alert_pin(_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _pin IS NULL OR _pin !~ '^[0-9]{6,8}$' THEN RAISE EXCEPTION 'PIN must be 6-8 digits'; END IF;

  INSERT INTO public.shop_settings(owner_id, low_stock_alert_pin_hash, low_stock_alert_psid)
  VALUES (auth.uid(), crypt(_pin, gen_salt('bf')), NULL)
  ON CONFLICT (owner_id) DO UPDATE
    SET low_stock_alert_pin_hash = EXCLUDED.low_stock_alert_pin_hash,
        low_stock_alert_psid = NULL,
        updated_at = now();

  -- A newly linked recipient should receive one alert for products already below threshold.
  UPDATE public.products p
  SET low_stock_alert_sent = false
  FROM public.shop_settings s
  WHERE p.owner_id = auth.uid()
    AND s.owner_id = p.owner_id
    AND p.stock <= s.low_stock_threshold;
END;
$$;
REVOKE ALL ON FUNCTION public.set_low_stock_alert_pin(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_low_stock_alert_pin(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.pair_low_stock_alert_recipient(_owner uuid, _psid text, _pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  attempt_row public.low_stock_alert_pair_attempts%ROWTYPE;
  stored_hash text;
  next_attempts int;
BEGIN
  IF _psid IS NULL OR length(_psid) < 1 OR length(_psid) > 200 OR _pin IS NULL OR _pin !~ '^[0-9]{6,8}$' THEN
    RETURN false;
  END IF;

  INSERT INTO public.low_stock_alert_pair_attempts(owner_id, psid)
  VALUES (_owner, _psid)
  ON CONFLICT (owner_id, psid) DO NOTHING;

  SELECT * INTO attempt_row
  FROM public.low_stock_alert_pair_attempts
  WHERE owner_id = _owner AND psid = _psid
  FOR UPDATE;

  IF attempt_row.blocked_until IS NOT NULL AND attempt_row.blocked_until > now() THEN
    RETURN false;
  END IF;

  IF attempt_row.window_started_at < now() - interval '15 minutes' THEN
    UPDATE public.low_stock_alert_pair_attempts
    SET attempts = 0, window_started_at = now(), blocked_until = NULL
    WHERE owner_id = _owner AND psid = _psid;
    attempt_row.attempts := 0;
  END IF;

  SELECT s.low_stock_alert_pin_hash INTO stored_hash
  FROM public.shop_settings s
  WHERE s.owner_id = _owner
  FOR UPDATE;

  IF stored_hash IS NULL OR stored_hash <> crypt(_pin, stored_hash) THEN
    next_attempts := attempt_row.attempts + 1;
    UPDATE public.low_stock_alert_pair_attempts
    SET attempts = CASE WHEN next_attempts >= 5 THEN 0 ELSE next_attempts END,
        window_started_at = CASE WHEN next_attempts >= 5 THEN now() ELSE window_started_at END,
        blocked_until = CASE WHEN next_attempts >= 5 THEN now() + interval '15 minutes' ELSE NULL END
    WHERE owner_id = _owner AND psid = _psid;
    RETURN false;
  END IF;

  UPDATE public.shop_settings
  SET low_stock_alert_psid = _psid,
      low_stock_alert_pin_hash = NULL,
      updated_at = now()
  WHERE owner_id = _owner;

  UPDATE public.low_stock_alert_pair_attempts
  SET attempts = 0, blocked_until = NULL, window_started_at = now()
  WHERE owner_id = _owner AND psid = _psid;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.pair_low_stock_alert_recipient(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pair_low_stock_alert_recipient(uuid, text, text) TO service_role;

-- Re-arm the next alert only after stock rises above the configured threshold.
CREATE OR REPLACE FUNCTION public.reset_low_stock_alert_after_restock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  threshold int;
BEGIN
  SELECT s.low_stock_threshold INTO threshold
  FROM public.shop_settings s
  WHERE s.owner_id = NEW.owner_id;

  IF NEW.stock > COALESCE(threshold, 5) THEN
    NEW.low_stock_alert_sent := false;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.reset_low_stock_alert_after_restock() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_products_reset_low_stock_alert ON public.products;
CREATE TRIGGER trg_products_reset_low_stock_alert
  BEFORE UPDATE OF stock ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.reset_low_stock_alert_after_restock();

-- Claim each low-stock transition atomically so concurrent stock changes cannot send duplicates.
CREATE OR REPLACE FUNCTION public.claim_low_stock_alerts(_owner uuid, _product_id uuid DEFAULT NULL)
RETURNS TABLE(
  product_id uuid,
  product_code text,
  product_name text,
  stock int,
  threshold int,
  recipient_psid text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT p.id, p.code, p.name, p.stock, s.low_stock_threshold, s.low_stock_alert_psid
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
    RETURNING p.id, c.code, c.name, p.stock, c.low_stock_threshold, c.low_stock_alert_psid
  )
  SELECT claimed.id, claimed.code, claimed.name, claimed.stock, claimed.low_stock_threshold, claimed.low_stock_alert_psid
  FROM claimed;
$$;
REVOKE ALL ON FUNCTION public.claim_low_stock_alerts(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_low_stock_alerts(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.release_low_stock_alert(_product_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.products p
  SET low_stock_alert_sent = false
  FROM public.shop_settings s
  WHERE p.id = _product_id
    AND s.owner_id = p.owner_id
    AND p.stock <= s.low_stock_threshold;
$$;
REVOKE ALL ON FUNCTION public.release_low_stock_alert(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_low_stock_alert(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
