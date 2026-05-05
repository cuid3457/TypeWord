-- Replace the open WITH CHECK (true) policy with one that requires the
-- caller to be authenticated AND inserting their own user_id. The previous
-- policy allowed anonymous bots to flood the moderation queue.

DROP POLICY IF EXISTS "reports_insert" ON public.content_reports;

CREATE POLICY "reports_insert"
  ON public.content_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- user_id stays nullable so that ON DELETE SET NULL (account deletion) keeps
-- moderation history intact. The policy above prevents inserting with a NULL
-- user_id at write time.
