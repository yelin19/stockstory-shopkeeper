-- Shop-owner managed Messenger question/answer replies.
CREATE TABLE IF NOT EXISTS public.bot_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  question text NOT NULL CHECK (length(trim(question)) > 0),
  answer text NOT NULL CHECK (length(trim(answer)) > 0),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bot_replies_owner_enabled_idx
  ON public.bot_replies (owner_id, enabled, created_at);

ALTER TABLE public.bot_replies ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.bot_replies TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_replies TO authenticated;

DROP POLICY IF EXISTS bot_replies_owner_policy ON public.bot_replies;
CREATE POLICY bot_replies_owner_policy ON public.bot_replies
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
