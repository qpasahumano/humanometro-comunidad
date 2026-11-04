-- HUMANÓMETRO COMUNIDAD
-- Evaluate auth.uid() once per statement in exchange participant policies.
DROP POLICY IF EXISTS "intercambios_insert_policy" ON public.intercambios;
CREATE POLICY "intercambios_insert_policy" ON public.intercambios
  FOR INSERT TO public
  WITH CHECK ((SELECT auth.uid()) = usuario_b);

DROP POLICY IF EXISTS "intercambios_select_policy" ON public.intercambios;
CREATE POLICY "intercambios_select_policy" ON public.intercambios
  FOR SELECT TO public
  USING ((SELECT auth.uid()) = usuario_a OR (SELECT auth.uid()) = usuario_b);
