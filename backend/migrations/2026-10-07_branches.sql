-- Branches: Asset Tree Homes Chrompet ('chrompet') and Asset Tree Homes Pammal ('pammal').
--   users.branch               field sales staff (site-visit tickets follow tickets.createdby)
--   presales_teams.branch      presales teams
--   presales_employees.branch  presales agents (presales calls follow tickets.presales_agent_id)
-- All nullable. NULL means "not set": an agent then follows their team, a team whose name contains
-- "pammal" counts as Pammal, and everything else counts as Chrompet (see backend/src/services/branches.js).
-- Tickets get no column: their branch comes from the person who made the call, so no backfill.
-- Teams whose name contains "pammal" count as Pammal without any tagging. Staff are tagged per person on
-- the Employees page (Branch column) or with a one-off UPDATE kept outside this public repo.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS branch text;
ALTER TABLE public.presales_teams ADD COLUMN IF NOT EXISTS branch text;
ALTER TABLE public.presales_employees ADD COLUMN IF NOT EXISTS branch text;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_branch_check') THEN
        ALTER TABLE public.users ADD CONSTRAINT users_branch_check CHECK (branch IN ('chrompet', 'pammal'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'presales_teams_branch_check') THEN
        ALTER TABLE public.presales_teams ADD CONSTRAINT presales_teams_branch_check CHECK (branch IN ('chrompet', 'pammal'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'presales_employees_branch_check') THEN
        ALTER TABLE public.presales_employees ADD CONSTRAINT presales_employees_branch_check CHECK (branch IN ('chrompet', 'pammal'));
    END IF;
END $$;

-- To undo:
-- ALTER TABLE public.users DROP COLUMN IF EXISTS branch;
-- ALTER TABLE public.presales_teams DROP COLUMN IF EXISTS branch;
-- ALTER TABLE public.presales_employees DROP COLUMN IF EXISTS branch;
