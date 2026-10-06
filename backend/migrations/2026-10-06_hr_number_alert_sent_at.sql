-- Records when the HR "Client Phone Number asked" email went out for a call,
-- so re-analysing the same call never sends it twice. Nullable, no backfill.
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS hr_number_alert_sent_at timestamptz;
-- To undo: ALTER TABLE public.tickets DROP COLUMN IF EXISTS hr_number_alert_sent_at;
