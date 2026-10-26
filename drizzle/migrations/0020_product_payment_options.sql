ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS allow_prepaid boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_seller_delivery_cash boolean NOT NULL DEFAULT true;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_at_least_one_payment_method_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_at_least_one_payment_method_check
  CHECK (allow_prepaid OR allow_seller_delivery_cash);
