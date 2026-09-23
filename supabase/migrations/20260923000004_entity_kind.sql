alter table public.entities add column if not exists kind text not null default 'person'
  check (kind in ('person','trust','company','protocol','fund'));
alter table public.entities add column if not exists verify text;   -- open questions for manual check
