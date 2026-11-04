-- HUMANÓMETRO COMUNIDAD
-- Elimina políticas permisivas duplicadas conservando las políticas vigentes equivalentes.
DROP POLICY IF EXISTS "Permitir insertar evaluaciones a usuarios autenticados" ON public.evaluaciones;
DROP POLICY IF EXISTS "Perfiles visibles publicamente" ON public.perfiles;
DROP POLICY IF EXISTS "Actualizar perfil propio" ON public.perfiles;
DROP POLICY IF EXISTS "Permitir eliminación al autor de la publicación" ON public.publicaciones;
DROP POLICY IF EXISTS "Permitir inserción a usuarios autenticados" ON public.publicaciones;
DROP POLICY IF EXISTS "Permitir modificación al autor de la publicación" ON public.publicaciones;
DROP POLICY IF EXISTS "publicaciones_insert_policy" ON public.publicaciones;
DROP POLICY IF EXISTS "publicaciones_update_policy" ON public.publicaciones;

-- Estas funciones son triggers internos: no deben exponerse como RPC a clientes.
REVOKE EXECUTE ON FUNCTION public.hmc_registrar_evento_evaluacion() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hmc_validar_evaluacion_intercambio() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hmc_validar_perfil_activo_publicacion() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hmc_bloquear_nuevas_solicitudes_si_restringido() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_evento_intercambio() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.actualizar_porcentaje_humanidad() FROM PUBLIC, anon, authenticated;
