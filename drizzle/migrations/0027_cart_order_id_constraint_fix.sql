-- Cart line items intentionally share the same customer-facing Order ID.
-- Remove both unique constraints and unique indexes that may have been created
-- by different versions of the earlier public_order_id migration.
DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%public_order_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS %I', item.conname);
  END LOOP;

  FOR item IN
    SELECT indexrelid::regclass AS index_name
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE i.indrelid = 'public.orders'::regclass
      AND i.indisunique
      AND pg_get_indexdef(i.indexrelid) ILIKE '%public_order_id%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %s', item.index_name);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS orders_public_order_id_idx ON public.orders(public_order_id);
