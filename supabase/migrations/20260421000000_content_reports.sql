-- Content reports: users flag incorrect definitions, examples, etc.
CREATE TABLE IF NOT EXISTS public.content_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  word        TEXT NOT NULL,
  word_id     TEXT,
  reason      TEXT NOT NULL,
  description TEXT,
  context     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_content_reports_created ON public.content_reports(created_at DESC);

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reports_insert" ON public.content_reports
  FOR INSERT WITH CHECK (true);

CREATE POLICY "reports_owner_select" ON public.content_reports
  FOR SELECT USING (auth.uid() = user_id);
