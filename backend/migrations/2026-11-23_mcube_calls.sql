-- MCube → Plumbline: MCube calls become tickets with source = 'mcube'.
-- Additive only; TeleCMI rows are untouched.

alter table public.tickets
  add column if not exists mcube_callid          text,
  add column if not exists mcube_recording_url   text,
  add column if not exists mcube_agent_phone     text,
  add column if not exists mcube_agent_name      text,
  add column if not exists mcube_group           text,
  add column if not exists mcube_did             text,
  add column if not exists mcube_dialstatus      text,
  add column if not exists mcube_disconnected_by text,
  add column if not exists mcube_raw             jsonb;   -- push body with customer numbers masked

comment on column public.tickets.mcube_callid is 'MCube callid; unique, used for webhook idempotency and Sell.Do matching';
comment on column public.tickets.mcube_raw is 'MCube push body, customer numbers masked, recording URL removed';

create unique index if not exists tickets_mcube_callid_key
  on public.tickets (mcube_callid) where mcube_callid is not null;

-- Plumbline functions that treated "phone call" as source = 'telecmi' (and everything
-- else as a site visit) now also count MCube calls as phone calls.
do $$
declare
  r record; d text; n text;
  pairs text[][] := array[
    array['qc_lead_history',  $a$coalesce(v.source, '') <> 'telecmi'$a$, $b$coalesce(v.source, '') not in ('telecmi', 'mcube')$b$],
    array['qc_lead_history',  $a$t.telecmi_filename is not null has_rec$a$, $b$(t.telecmi_filename is not null or t.mcube_recording_url is not null) has_rec$b$],
    array['qc_lookup_calls',  $a$coalesce(t.source,'') = 'telecmi'$a$, $b$coalesce(t.source,'') in ('telecmi', 'mcube')$b$],
    array['qc_lookup_calls',  $a$coalesce(v.source,'') <> 'telecmi'$a$, $b$coalesce(v.source,'') not in ('telecmi', 'mcube')$b$],
    array['qc_lookup_calls',  $a$t.telecmi_filename is not null rec$a$, $b$(t.telecmi_filename is not null or t.mcube_recording_url is not null) rec$b$],
    array['qc_report_summary', $a$where t.source = 'telecmi' and$a$, $b$where t.source in ('telecmi', 'mcube') and$b$]
  ];
  i int;
begin
  for i in 1 .. array_length(pairs, 1) loop
    select p.oid, pg_get_functiondef(p.oid) def into r
      from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = pairs[i][1];
    d := r.def;
    if position(pairs[i][3] in d) > 0 then continue; end if;          -- already applied
    if position(pairs[i][2] in d) = 0 then
      raise exception 'MCube migration: expected text not found in %: %', pairs[i][1], pairs[i][2];
    end if;
    n := replace(d, pairs[i][2], pairs[i][3]);
    execute n;
  end loop;
end $$;
