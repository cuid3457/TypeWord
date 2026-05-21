-- Admin RLS for report_fixes: 대표님 (junesung07@gmail.com) can read/update.
-- service_role policy already exists from the create migration.

CREATE POLICY "report_fixes_admin_select" ON public.report_fixes
  FOR SELECT USING (
    (auth.jwt() ->> 'email') = 'junesung07@gmail.com'
  );

CREATE POLICY "report_fixes_admin_update" ON public.report_fixes
  FOR UPDATE USING (
    (auth.jwt() ->> 'email') = 'junesung07@gmail.com'
  );
