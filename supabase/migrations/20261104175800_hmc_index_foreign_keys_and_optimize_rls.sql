-- HUMANÓMETRO COMUNIDAD
-- Indexes for foreign-key lookups reported by Supabase advisors.
CREATE INDEX IF NOT EXISTS idx_conversaciones_participante_2 ON public.conversaciones(participante_2);
CREATE INDEX IF NOT EXISTS idx_denuncias_denunciante_id ON public.denuncias(denunciante_id);
CREATE INDEX IF NOT EXISTS idx_denuncias_perfil_denunciado_id ON public.denuncias(perfil_denunciado_id);
CREATE INDEX IF NOT EXISTS idx_denuncias_publicacion_id ON public.denuncias(publicacion_id);
CREATE INDEX IF NOT EXISTS idx_evaluaciones_evaluado_id ON public.evaluaciones(evaluado_id);
CREATE INDEX IF NOT EXISTS idx_evaluaciones_evaluador_id ON public.evaluaciones(evaluador_id);
CREATE INDEX IF NOT EXISTS idx_intercambios_prorroga_solicitada_por ON public.intercambios(prorroga_solicitada_por);
CREATE INDEX IF NOT EXISTS idx_intercambios_publicacion_id ON public.intercambios(publicacion_id);
CREATE INDEX IF NOT EXISTS idx_intercambios_usuario_b ON public.intercambios(usuario_b);
CREATE INDEX IF NOT EXISTS idx_mediciones_evaluado_id ON public.mediciones_humanidad(evaluado_id);
CREATE INDEX IF NOT EXISTS idx_mediciones_evaluador_id ON public.mediciones_humanidad(evaluador_id);
CREATE INDEX IF NOT EXISTS idx_mediciones_publicacion_id ON public.mediciones_humanidad(publicacion_id);
CREATE INDEX IF NOT EXISTS idx_mensajes_conversacion_id ON public.mensajes(conversacion_id);
CREATE INDEX IF NOT EXISTS idx_mensajes_emisor_id ON public.mensajes(emisor_id);
CREATE INDEX IF NOT EXISTS idx_mensajes_receptor_id ON public.mensajes(receptor_id);
CREATE INDEX IF NOT EXISTS idx_publicaciones_perfil_id ON public.publicaciones(perfil_id);
CREATE INDEX IF NOT EXISTS idx_publicaciones_usuario_id ON public.publicaciones(usuario_id);

-- Avoid per-row reevaluation of auth.uid() in RLS expressions.
DROP POLICY IF EXISTS "Crear perfil propio" ON public.perfiles;
CREATE POLICY "Crear perfil propio" ON public.perfiles FOR INSERT TO public WITH CHECK (id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Modificar perfil propio" ON public.perfiles;
CREATE POLICY "Modificar perfil propio" ON public.perfiles FOR UPDATE TO authenticated USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Ver conversaciones propias" ON public.conversaciones;
CREATE POLICY "Ver conversaciones propias" ON public.conversaciones FOR SELECT TO public USING ((SELECT auth.uid()) = participante_1 OR (SELECT auth.uid()) = participante_2);
DROP POLICY IF EXISTS "Enviar mensajes propios" ON public.mensajes;
CREATE POLICY "Enviar mensajes propios" ON public.mensajes FOR INSERT TO public WITH CHECK ((SELECT auth.uid()) = emisor_id);
DROP POLICY IF EXISTS "Ver mensajes de sus conversaciones" ON public.mensajes;
CREATE POLICY "Ver mensajes de sus conversaciones" ON public.mensajes FOR SELECT TO public USING ((SELECT auth.uid()) = emisor_id OR (SELECT auth.uid()) = receptor_id);
DROP POLICY IF EXISTS "Crear publicaciones propias" ON public.publicaciones;
CREATE POLICY "Crear publicaciones propias" ON public.publicaciones FOR INSERT TO authenticated WITH CHECK (perfil_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Modificar publicaciones propias" ON public.publicaciones;
CREATE POLICY "Modificar publicaciones propias" ON public.publicaciones FOR UPDATE TO authenticated USING (perfil_id = (SELECT auth.uid())) WITH CHECK (perfil_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Eliminar publicaciones propias" ON public.publicaciones;
CREATE POLICY "Eliminar publicaciones propias" ON public.publicaciones FOR DELETE TO authenticated USING (perfil_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar sus evaluaciones" ON public.evaluaciones;
CREATE POLICY "Usuarios autenticados pueden insertar sus evaluaciones" ON public.evaluaciones FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = evaluador_id);
DROP POLICY IF EXISTS "Usuarios autenticados pueden leer evaluaciones relacionadas" ON public.evaluaciones;
CREATE POLICY "Usuarios autenticados pueden leer evaluaciones relacionadas" ON public.evaluaciones FOR SELECT TO authenticated USING ((SELECT auth.uid()) = evaluador_id OR (SELECT auth.uid()) = evaluado_id);
DROP POLICY IF EXISTS "Los usuarios autenticados pueden registrar mediciones" ON public.mediciones_humanidad;
CREATE POLICY "Los usuarios autenticados pueden registrar mediciones" ON public.mediciones_humanidad FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = evaluador_id);
DROP POLICY IF EXISTS "Lectura pública de mediciones" ON public.mediciones_humanidad;
CREATE POLICY "Lectura pública de mediciones" ON public.mediciones_humanidad FOR SELECT TO authenticated USING ((SELECT auth.uid()) = evaluador_id OR (SELECT auth.uid()) = evaluado_id);
DROP POLICY IF EXISTS "HMC solo perfiles activos ven publicaciones" ON public.publicaciones;
CREATE POLICY "HMC solo perfiles activos ven publicaciones" ON public.publicaciones FOR SELECT TO authenticated USING (
 perfil_id = (SELECT auth.uid()) OR (
  estado = 'publicada'
  AND EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = publicaciones.perfil_id AND p.estado_acceso_comunidad = 'activo')
  AND EXISTS (SELECT 1 FROM public.perfiles propio WHERE propio.id = (SELECT auth.uid()) AND propio.estado_acceso_comunidad = 'activo')
 )
);
