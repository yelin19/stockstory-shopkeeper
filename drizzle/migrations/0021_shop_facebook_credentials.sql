ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS fb_page_access_token text,
  ADD COLUMN IF NOT EXISTS fb_app_secret text;

COMMENT ON COLUMN public.shop_settings.fb_page_access_token IS 'Page access token for this shop. Never expose in public API responses.';
COMMENT ON COLUMN public.shop_settings.fb_app_secret IS 'Meta app secret for this shop. Never expose in public API responses.';
