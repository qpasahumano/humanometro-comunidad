CREATE OR REPLACE FUNCTION public.hmc_responder_intercambio(
  p_intercambio_id uuid,
  p_opcion text,
  p_oferta jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v public.intercambios%rowtype;
  v_estado text;
  v_estado_publicacion text;
BEGIN
  SELECT * INTO v FROM public.intercambios WHERE id = p_intercambio_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR auth.uid() <> v.usuario_a THEN
    RAISE EXCEPTION 'No autorizado para responder esta propuesta';
  END IF;
  IF v.estado <> 'pendiente_respuesta' THEN
    RAISE EXCEPTION 'La propuesta ya no admite respuestas';
  END IF;
  IF v.fecha_respuesta_limite < now() THEN
    UPDATE public.intercambios SET estado = 'vencido' WHERE id = v.id;
    RAISE EXCEPTION 'La propuesta venció';
  END IF;
  IF p_opcion NOT IN ('aceptar_condiciones', 'conversar', 'rechazar_propuesta') THEN
    RAISE EXCEPTION 'Opción de respuesta inválida';
  END IF;
  IF p_opcion <> 'rechazar_propuesta' AND v.publicacion_id IS NOT NULL THEN
    SELECT estado INTO v_estado_publicacion FROM public.publicaciones WHERE id = v.publicacion_id FOR UPDATE;
    IF NOT FOUND OR v_estado_publicacion <> 'publicada' THEN
      RAISE EXCEPTION 'La publicación ya no está disponible para aceptar otra oferta';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.intercambios i
      WHERE i.publicacion_id = v.publicacion_id AND i.id <> v.id
        AND i.estado IN ('respuesta_recibida','conversacion_pendiente','acuerdo_pendiente_confirmacion','en_proceso','incumplido','regularizacion_pendiente')
    ) THEN
      RAISE EXCEPTION 'Ya hay otra propuesta aceptada en curso para esta publicación';
    END IF;
  END IF;
  v_estado := CASE WHEN p_opcion = 'conversar' THEN 'conversacion_pendiente'
                   WHEN p_opcion = 'rechazar_propuesta' THEN 'rechazado'
                   ELSE 'respuesta_recibida' END;
  UPDATE public.intercambios
  SET respuesta_b = jsonb_build_object(
        'opcion', p_opcion, 'oferta', coalesce(p_oferta, '{}'::jsonb),
        'respondido_en', now(), 'archivada_por_iniciador', false
      ),
      estado = v_estado
  WHERE id = v.id;
  IF p_opcion <> 'rechazar_propuesta' AND v.publicacion_id IS NOT NULL THEN
    UPDATE public.intercambios
    SET estado = 'rechazado',
        respuesta_b = jsonb_build_object(
          'opcion', 'rechazar_propuesta', 'motivo', 'otra_oferta_aceptada',
          'respondido_en', now(), 'archivada_por_iniciador', false
        )
    WHERE publicacion_id = v.publicacion_id AND id <> v.id AND estado = 'pendiente_respuesta';
  END IF;
  RETURN jsonb_build_object('ok', true, 'estado', v_estado);
END;
$function$;

CREATE OR REPLACE FUNCTION public.hmc_archivar_propuesta_rechazada(p_intercambio_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v public.intercambios%rowtype;
BEGIN
  SELECT * INTO v FROM public.intercambios WHERE id = p_intercambio_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR auth.uid() <> v.usuario_b THEN
    RAISE EXCEPTION 'No autorizado para borrar esta propuesta';
  END IF;
  IF v.estado <> 'rechazado' THEN
    RAISE EXCEPTION 'Solo podés borrar propuestas rechazadas';
  END IF;
  IF coalesce((v.respuesta_b->>'archivada_por_iniciador')::boolean, false) THEN
    RETURN jsonb_build_object('ok', true, 'archivada', true);
  END IF;
  UPDATE public.intercambios
  SET respuesta_b = coalesce(respuesta_b, '{}'::jsonb) ||
    jsonb_build_object('archivada_por_iniciador', true, 'archivada_en', now())
  WHERE id = v.id;
  RETURN jsonb_build_object('ok', true, 'archivada', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.hmc_conteo_cancelaciones_intercambios(p_perfil_ids uuid[])
RETURNS TABLE(perfil_id uuid,total_iniciados bigint,total_cancelados bigint,cancelaciones_90_dias bigint,riesgo_membresia boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada'; END IF;
  IF p_perfil_ids IS NULL OR cardinality(p_perfil_ids) = 0 THEN RETURN; END IF;
  IF cardinality(p_perfil_ids) > 200 THEN RAISE EXCEPTION 'La consulta supera el máximo de perfiles permitido'; END IF;
  RETURN QUERY
  SELECT p.id,
    count(i.id) FILTER (WHERE i.usuario_b = p.id)::bigint,
    count(i.id) FILTER (
      WHERE i.cancelado_por = p.id AND EXISTS (
        SELECT 1 FROM public.intercambio_eventos e
        WHERE e.intercambio_id = i.id AND e.evento = 'cambio_estado'
          AND e.estado_nuevo = 'cancelado'
          AND e.estado_anterior IN ('respuesta_recibida','conversacion_pendiente','acuerdo_pendiente_confirmacion','en_proceso','incumplido','regularizacion_pendiente')
      )
    )::bigint,
    count(i.id) FILTER (
      WHERE i.cancelado_por = p.id AND i.estado = 'cancelado'
        AND i.cancelado_en >= now() - interval '90 days'
        AND EXISTS (
          SELECT 1 FROM public.intercambio_eventos e
          WHERE e.intercambio_id = i.id AND e.evento = 'cambio_estado'
            AND e.estado_nuevo = 'cancelado'
            AND e.estado_anterior IN ('respuesta_recibida','conversacion_pendiente','acuerdo_pendiente_confirmacion','en_proceso','incumplido','regularizacion_pendiente')
        )
    )::bigint,
    (count(i.id) FILTER (
      WHERE i.cancelado_por = p.id AND i.estado = 'cancelado'
        AND i.cancelado_en >= now() - interval '90 days'
        AND EXISTS (
          SELECT 1 FROM public.intercambio_eventos e
          WHERE e.intercambio_id = i.id AND e.evento = 'cambio_estado'
            AND e.estado_nuevo = 'cancelado'
            AND e.estado_anterior IN ('respuesta_recibida','conversacion_pendiente','acuerdo_pendiente_confirmacion','en_proceso','incumplido','regularizacion_pendiente')
        )
    ) >= 3)
  FROM public.perfiles p
  LEFT JOIN public.intercambios i ON (i.usuario_a = p.id OR i.usuario_b = p.id)
  WHERE p.id = ANY(p_perfil_ids) AND coalesce(p.estado_acceso_comunidad, 'activo') = 'activo'
  GROUP BY p.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.hmc_responder_intercambio(uuid,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hmc_responder_intercambio(uuid,text,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.hmc_archivar_propuesta_rechazada(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hmc_archivar_propuesta_rechazada(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.hmc_conteo_cancelaciones_intercambios(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hmc_conteo_cancelaciones_intercambios(uuid[]) TO authenticated;
