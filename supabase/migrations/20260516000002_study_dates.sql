-- Server-side study_dates so the calendar/streak survive device switches.
-- Local SQLite study_dates already tracks "did the user qualify on day X"
-- per device; we mirror that to the server append-only so multiple
-- devices (Galaxy + iPad on the same account) converge.

CREATE TABLE IF NOT EXISTS public.study_dates (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date         TEXT NOT NULL,           -- YYYY-MM-DD in the streak day boundary (4 AM local)
  qualified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_study_dates_user_qualified
  ON public.study_dates(user_id, qualified_at);

ALTER TABLE public.study_dates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "study_dates_select_own" ON public.study_dates;
CREATE POLICY "study_dates_select_own" ON public.study_dates
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "study_dates_insert_own" ON public.study_dates;
CREATE POLICY "study_dates_insert_own" ON public.study_dates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- DELETE intentionally NOT granted: study history is append-only on the
-- client too (no UI to "unrecord" a study day). Account deletion drops
-- rows via the FK cascade.
