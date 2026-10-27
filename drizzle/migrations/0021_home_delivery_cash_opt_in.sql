-- Home-delivery cash should be enabled explicitly per product.
-- Existing product values are intentionally preserved.
ALTER TABLE public.products
  ALTER COLUMN allow_seller_delivery_cash SET DEFAULT false;
