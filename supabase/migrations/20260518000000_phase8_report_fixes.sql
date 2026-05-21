-- Phase 8: AI judge + auto-fix loop for user reports.
-- Pipeline: content_reports → process-report edge function → report_fixes queue.

-- Extend content_reports with source/target lang context (new reports only).
ALTER TABLE public.content_reports
  ADD COLUMN IF NOT EXISTS source_lang TEXT,
  ADD COLUMN IF NOT EXISTS target_lang TEXT,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_content_reports_word_lang
  ON public.content_reports(word, source_lang, target_lang)
  WHERE processed_at IS NULL;

-- Report fix queue: aggregated reports → AI judge → regen result.
CREATE TABLE IF NOT EXISTS public.report_fixes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word            TEXT NOT NULL,
  source_lang     TEXT NOT NULL,
  target_lang     TEXT NOT NULL,
  -- Reports aggregated into this fix
  report_ids      UUID[] NOT NULL,
  report_count    INT NOT NULL,
  -- AI judge verdict
  judge_verdict   TEXT NOT NULL CHECK (judge_verdict IN ('VALID', 'BORDERLINE', 'INVALID')),
  judge_confidence INT,                 -- 0–100
  judge_reasoning TEXT,
  judge_model     TEXT,
  -- Snapshot of the entry that triggered reports (for rollback context)
  original_result JSONB,
  -- Fresh regeneration (when VALID)
  regen_result    JSONB,
  regen_model     TEXT,
  -- Workflow status
  status          TEXT NOT NULL CHECK (status IN (
    'pending_review',    -- moderator queue
    'auto_applied',      -- automatically applied (high confidence + ≥2 reports)
    'manually_applied',  -- moderator approved
    'rejected'           -- judge INVALID or moderator rejected
  )),
  applied_at      TIMESTAMPTZ,
  reviewer_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_note   TEXT,
  -- Tokens / cost tracking
  judge_cost_usd  NUMERIC(10, 6),
  regen_cost_usd  NUMERIC(10, 6),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_report_fixes_status ON public.report_fixes(status, created_at DESC);
CREATE INDEX idx_report_fixes_word ON public.report_fixes(word, source_lang, target_lang);

-- Reporter trust tracking on profiles.
-- Used to weight future reports — repeated bad reports lower the user's signal.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS report_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS report_valid_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS report_invalid_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_report_at TIMESTAMPTZ;

-- RLS
ALTER TABLE public.report_fixes ENABLE ROW LEVEL SECURITY;
-- Read-only for owners (no direct write — only edge function via service_role).
CREATE POLICY "report_fixes_admin_only" ON public.report_fixes
  FOR ALL USING (auth.role() = 'service_role');

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.report_fixes_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER report_fixes_updated_at
BEFORE UPDATE ON public.report_fixes
FOR EACH ROW EXECUTE FUNCTION public.report_fixes_set_updated_at();
