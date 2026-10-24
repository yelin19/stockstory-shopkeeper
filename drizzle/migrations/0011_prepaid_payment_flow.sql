-- Prepaid fallback for customers whose COD delivery failed.
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account_name text,
  ADD COLUMN IF NOT EXISTS bank_account_number text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'cod',
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS payment_proof_url text,
  ADD COLUMN IF NOT EXISTS payment_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_approved_at timestamptz;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('cod', 'prepaid'));

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('not_required', 'awaiting_payment', 'proof_submitted', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS orders_payment_status_idx
  ON public.orders(owner_id, payment_status, created_at DESC);
