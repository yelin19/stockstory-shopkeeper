CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.shop_settings (
  owner_id uuid PRIMARY KEY,
  shop_name text NOT NULL DEFAULT 'My Shop',
  pin_hash text,
  fb_page_id text UNIQUE,
  messenger_username text,
  low_stock_threshold int NOT NULL DEFAULT 5,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.shop_settings TO authenticated;
GRANT ALL ON public.shop_settings TO service_role;
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings select" ON public.shop_settings FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "own settings insert" ON public.shop_settings FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "own settings update" ON public.shop_settings FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'General',
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  stock int NOT NULL DEFAULT 0 CHECK (stock >= 0),
  image_url text,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own products all" ON public.products FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no bigserial,
  owner_id uuid NOT NULL,
  psid text,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_code text NOT NULL,
  product_name text NOT NULL,
  category text NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  quantity int NOT NULL CHECK (quantity > 0),
  total numeric(12,2) NOT NULL,
  customer_name text NOT NULL,
  phone text NOT NULL,
  township text NOT NULL,
  address text NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','delivered','cancelled')),
  sent boolean NOT NULL DEFAULT false,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.orders(owner_id, created_at);
GRANT SELECT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
GRANT USAGE ON SEQUENCE public.orders_order_no_seq TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own orders select" ON public.orders FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "own orders update" ON public.orders FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.stock_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  product_code text NOT NULL,
  change int NOT NULL,
  balance int NOT NULL,
  reason text NOT NULL CHECK (reason IN ('initial','increase','sale','cancel','adjust')),
  order_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stock_history TO authenticated;
GRANT ALL ON public.stock_history TO service_role;
ALTER TABLE public.stock_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own history select" ON public.stock_history FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE TABLE public.messenger_sessions (
  owner_id uuid NOT NULL,
  psid text NOT NULL,
  pin_verified boolean NOT NULL DEFAULT false,
  state text NOT NULL DEFAULT 'idle',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, psid)
);
GRANT ALL ON public.messenger_sessions TO service_role;
ALTER TABLE public.messenger_sessions ENABLE ROW LEVEL SECURITY;

-- initial stock history on product insert
CREATE FUNCTION public.products_after_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO stock_history(owner_id, product_id, product_code, change, balance, reason, note)
  VALUES (NEW.owner_id, NEW.id, NEW.code, NEW.stock, NEW.stock, 'initial', 'Product created');
  RETURN NEW;
END $$;
CREATE TRIGGER trg_products_after_insert AFTER INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.products_after_insert();

-- block direct stock edits from clients (must use RPCs)
CREATE FUNCTION public.products_guard_stock() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.stock <> OLD.stock AND current_setting('shop.stock_rpc', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Use stock actions to change stock';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_products_guard_stock BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.products_guard_stock();

CREATE FUNCTION public.change_stock(_product_id uuid, _delta int, _reason text, _note text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p products%ROWTYPE;
BEGIN
  IF _reason NOT IN ('increase','adjust') THEN RAISE EXCEPTION 'Invalid reason'; END IF;
  IF _reason = 'increase' AND _delta <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
  PERFORM set_config('shop.stock_rpc','on', true);
  UPDATE products SET stock = stock + _delta
   WHERE id = _product_id AND owner_id = auth.uid() AND stock + _delta >= 0
   RETURNING * INTO p;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found or stock would go negative'; END IF;
  INSERT INTO stock_history(owner_id, product_id, product_code, change, balance, reason, note)
  VALUES (p.owner_id, p.id, p.code, _delta, p.stock, _reason, _note);
  PERFORM set_config('shop.stock_rpc','off', true);
  RETURN p.stock;
END $$;
REVOKE ALL ON FUNCTION public.change_stock FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_stock TO authenticated;

CREATE FUNCTION public.cancel_order(_order_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o orders%ROWTYPE; p products%ROWTYPE;
BEGIN
  SELECT * INTO o FROM orders WHERE id = _order_id AND owner_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status = 'cancelled' THEN RETURN; END IF;
  UPDATE orders SET status = 'cancelled' WHERE id = o.id;
  IF o.product_id IS NOT NULL THEN
    PERFORM set_config('shop.stock_rpc','on', true);
    UPDATE products SET stock = stock + o.quantity WHERE id = o.product_id RETURNING * INTO p;
    INSERT INTO stock_history(owner_id, product_id, product_code, change, balance, reason, order_id, note)
    VALUES (o.owner_id, p.id, p.code, o.quantity, p.stock, 'cancel', o.id, 'Order #' || o.order_no || ' cancelled');
    PERFORM set_config('shop.stock_rpc','off', true);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.cancel_order FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_order TO authenticated;

-- atomic order placement, service role only (Messenger webhook)
CREATE FUNCTION public.place_order(_owner uuid, _psid text, _product_id uuid, _qty int, _name text, _phone text, _township text, _address text, _note text)
RETURNS orders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p products%ROWTYPE; o orders%ROWTYPE;
BEGIN
  IF _qty <= 0 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
  PERFORM set_config('shop.stock_rpc','on', true);
  UPDATE products SET stock = stock - _qty
   WHERE id = _product_id AND owner_id = _owner AND active AND stock >= _qty
   RETURNING * INTO p;
  IF NOT FOUND THEN RAISE EXCEPTION 'OUT_OF_STOCK'; END IF;
  INSERT INTO orders(owner_id, psid, product_id, product_code, product_name, category, unit_price, quantity, total, customer_name, phone, township, address, note)
  VALUES (_owner, _psid, p.id, p.code, p.name, p.category, p.price, _qty, p.price * _qty, _name, _phone, _township, _address, NULLIF(_note,''))
  RETURNING * INTO o;
  INSERT INTO stock_history(owner_id, product_id, product_code, change, balance, reason, order_id, note)
  VALUES (_owner, p.id, p.code, -_qty, p.stock, 'sale', o.id, 'Order #' || o.order_no);
  PERFORM set_config('shop.stock_rpc','off', true);
  RETURN o;
END $$;
REVOKE ALL ON FUNCTION public.place_order FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_order TO service_role;

CREATE FUNCTION public.set_shop_pin(_pin text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _pin !~ '^[0-9]{4,8}$' THEN RAISE EXCEPTION 'PIN must be 4-8 digits'; END IF;
  INSERT INTO shop_settings(owner_id, pin_hash) VALUES (auth.uid(), crypt(_pin, gen_salt('bf')))
  ON CONFLICT (owner_id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, updated_at = now();
  UPDATE messenger_sessions SET pin_verified = false WHERE owner_id = auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.set_shop_pin FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_shop_pin TO authenticated;

CREATE FUNCTION public.verify_shop_pin(_owner uuid, _pin text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT coalesce((SELECT pin_hash IS NOT NULL AND pin_hash = crypt(_pin, pin_hash) FROM shop_settings WHERE owner_id = _owner), false)
$$;
REVOKE ALL ON FUNCTION public.verify_shop_pin FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_shop_pin TO service_role;

-- public product page data
CREATE FUNCTION public.get_public_product(_code text)
RETURNS TABLE(code text, name text, category text, price numeric, stock int, image_url text, description text, shop_name text, messenger_username text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.code, p.name, p.category, p.price, p.stock, p.image_url, p.description, s.shop_name, s.messenger_username
  FROM products p LEFT JOIN shop_settings s ON s.owner_id = p.owner_id
  WHERE p.code = _code AND p.active LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.get_public_product TO anon, authenticated, service_role;

-- storage policies for product images
CREATE POLICY "product images public read" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY "product images owner write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "product images owner update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "product images owner delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text);