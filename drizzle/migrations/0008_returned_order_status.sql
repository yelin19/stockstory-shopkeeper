-- Allow admins to mark a delivered order as returned.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_delivery_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_delivery_status_check
  CHECK (delivery_status IN ('confirmed', 'preparing', 'shipped', 'in_transit', 'delivered', 'returned', 'cancelled'));

