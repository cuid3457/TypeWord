-- Records why users delete their accounts. Written by the delete-account
-- edge function just before it deletes the auth user. The user_id column
-- is a SNAPSHOT (no FK) so the row survives the auth.users cascade and
-- remains queryable for churn analysis afterward.
--
-- Reason input is optional — the modal lets users skip. Skipped deletes
-- still INSERT a row (with empty reasons + null comment) so we can
-- compute the skip rate.

create table public.deletion_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,                              -- snapshot, not FK (user is about to be deleted)
  reasons jsonb not null default '[]'::jsonb, -- array of stable reason keys (see client constants)
  comment text,
  user_lang text,                            -- UI lang at time of deletion (en/ko/ja/...)
  account_age_days int,                      -- days between auth.users.created_at and now
  was_premium boolean,                       -- snapshot of subscription state at deletion
  created_at timestamptz not null default now()
);

create index deletion_feedback_created_at_idx on public.deletion_feedback (created_at desc);

-- RLS: locked down. Only service_role can read/write. Users have no
-- legitimate reason to query this table — the edge function inserts on
-- their behalf using the service role, and analytics is operator-only.
alter table public.deletion_feedback enable row level security;
-- (no policies = service_role still bypasses RLS, anon/authenticated denied)
