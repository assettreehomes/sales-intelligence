-- Speed up every date-filtered tickets query (analytics, presales performance,
-- ticket list, heatmap counts).
--
-- Before: tickets had no index on createdat, so "createdat >= X ORDER BY createdat"
-- read all ~130k rows (~174 MB) each time. With the database freshly restored
-- (cold cache) and several dashboard pages loading at once, those scans hit the
-- 8 s PostgREST statement timeout and the API returned
-- "Failed to generate presales performance analytics".
--
-- Run in the Supabase SQL editor. CONCURRENTLY keeps the table writable while the
-- index builds; run each statement on its own (not inside a transaction).

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_source_createdat
    ON public.tickets (source, createdat DESC)
    WHERE deletedat IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_createdat
    ON public.tickets (createdat DESC)
    WHERE deletedat IS NULL;

-- analysisresults has never been analysed since the restore (planner thinks it
-- holds 8 rows); refresh its statistics so ticketid lookups get a sane plan.
ANALYZE public.tickets;
ANALYZE public.analysisresults;

-- Undo:
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_tickets_source_createdat;
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_tickets_createdat;
