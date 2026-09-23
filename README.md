# Do Tell.

Where power puts its money. Internal, invite-only dashboard that tracks disclosed and on-chain trades by people close to US policy and sets each move against the policy calendar.

- `app/` — Next.js dashboard (Vercel). Sign-in by email link; only emails in `allowed_users` can read data.
- `supabase/migrations/` — database schema (run in order).
- `supabase/functions/` — ingest jobs (Edge Functions, scheduled with pg_cron): `ingest-form4`, `ingest-events`, `ingest-house`.
- `HANDOFF.md` — current status and next steps.
