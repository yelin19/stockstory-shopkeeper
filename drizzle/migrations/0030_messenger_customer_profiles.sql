-- Keep each Messenger customer's most recently used delivery details separately
-- from order history so admin order cleanup does not erase the saved address.
CREATE TABLE IF NOT EXISTS public.messenger_customer_profiles (
  owner_id uuid NOT NULL,
  psid text NOT NULL,
  customer_name text NOT NULL,
  phone text NOT NULL,
  address text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, psid)
);

ALTER TABLE public.messenger_customer_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.messenger_customer_profiles FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.messenger_customer_profiles TO service_role;

-- Preserve the latest known details for existing Messenger customers before
-- historic orders are removed. township and address are separate order fields.
INSERT INTO public.messenger_customer_profiles (
  owner_id, psid, customer_name, phone, address, updated_at
)
SELECT DISTINCT ON (o.owner_id, o.psid)
  o.owner_id,
  o.psid,
  o.customer_name,
  o.phone,
  concat_ws(', ', NULLIF(btrim(o.township), ''), NULLIF(btrim(o.address), '')),
  o.created_at
FROM public.orders AS o
WHERE o.psid IS NOT NULL
  AND btrim(o.psid) <> ''
  AND btrim(o.customer_name) <> ''
  AND btrim(o.phone) <> ''
  AND (btrim(o.township) <> '' OR btrim(o.address) <> '')
ORDER BY o.owner_id, o.psid, o.created_at DESC, o.id DESC
ON CONFLICT (owner_id, psid) DO UPDATE
SET customer_name = EXCLUDED.customer_name,
    phone = EXCLUDED.phone,
    address = EXCLUDED.address,
    updated_at = EXCLUDED.updated_at
WHERE EXCLUDED.updated_at > public.messenger_customer_profiles.updated_at;

-- The order RPCs create all order rows through INSERT; this trigger makes profile
-- retention transactional with order creation and independent of session state.
CREATE OR REPLACE FUNCTION public.remember_messenger_customer_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.psid IS NULL OR btrim(NEW.psid) = ''
    OR btrim(NEW.customer_name) = '' OR btrim(NEW.phone) = ''
    OR (btrim(NEW.township) = '' AND btrim(NEW.address) = '') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.messenger_customer_profiles (
    owner_id, psid, customer_name, phone, address, updated_at
  ) VALUES (
    NEW.owner_id,
    NEW.psid,
    btrim(NEW.customer_name),
    btrim(NEW.phone),
    concat_ws(', ', NULLIF(btrim(NEW.township), ''), NULLIF(btrim(NEW.address), '')),
    clock_timestamp()
  )
  ON CONFLICT (owner_id, psid) DO UPDATE
  SET customer_name = EXCLUDED.customer_name,
      phone = EXCLUDED.phone,
      address = EXCLUDED.address,
      updated_at = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.remember_messenger_customer_profile() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS orders_remember_messenger_customer_profile ON public.orders;
CREATE TRIGGER orders_remember_messenger_customer_profile
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.remember_messenger_customer_profile();
