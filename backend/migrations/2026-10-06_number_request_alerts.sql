-- Number-request alerts (HR email + admin app push), one per call.
--   number_alert_claimed_at  set just before the alert goes out, so a re-analysis never resends
--   hr_email_sent_at         set once the HR email was accepted by the mail server; the dashboard
--                            shows a Mail badge on the call when it is set
-- Both nullable, no backfill.
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS number_alert_claimed_at timestamptz;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS hr_email_sent_at timestamptz;
-- To undo:
-- ALTER TABLE public.tickets DROP COLUMN IF EXISTS number_alert_claimed_at, DROP COLUMN IF EXISTS hr_email_sent_at;
