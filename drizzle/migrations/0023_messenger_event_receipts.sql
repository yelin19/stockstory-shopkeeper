-- Facebook may retry the same Messenger webhook event. Store each message id once
-- so one customer message produces one bot reply.
CREATE TABLE IF NOT EXISTS public.messenger_event_receipts (
  owner_id uuid NOT NULL,
  event_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, event_id)
);

GRANT ALL ON public.messenger_event_receipts TO service_role;
ALTER TABLE public.messenger_event_receipts ENABLE ROW LEVEL SECURITY;
