-- Optional quick-reply buttons shown below a saved bot answer.
ALTER TABLE public.bot_replies
  ADD COLUMN IF NOT EXISTS quick_replies jsonb NOT NULL DEFAULT '[]'::jsonb;
