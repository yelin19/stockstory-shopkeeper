ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS sender_name text;
