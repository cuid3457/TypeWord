-- Delivery log for backend-sent transactional emails (subscription lifecycle
-- + trial reminders). Each SES send attempt records one row so we can verify
-- after the fact whether a given user's email actually went out — previously
-- send results lived only in edge-function console.log, which Supabase doesn't
-- retain, making "did the welcome email send?" unanswerable (notably for
-- Apple private-relay recipients).
--
-- user_id is a real FK with ON DELETE CASCADE: the recipient address is PII,
-- so a deleted account's email log is purged with it (unlike deletion_feedback
-- which deliberately snapshots).

create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email_type text not null,   -- subscription_welcome / trial_ending_soon / subscription_cancelled / ...
  recipient text not null,    -- address SES was asked to deliver to (may be an Apple relay alias)
  status text not null,       -- 'sent' | 'failed'
  error text,                 -- SES error message when status = 'failed'
  created_at timestamptz not null default now()
);

create index email_log_user_id_idx on public.email_log (user_id);
create index email_log_created_at_idx on public.email_log (created_at desc);

-- RLS: locked down. The edge functions insert via service_role (bypasses RLS);
-- end users have no reason to read it.
alter table public.email_log enable row level security;
-- (no policies = service_role only, anon/authenticated denied)
