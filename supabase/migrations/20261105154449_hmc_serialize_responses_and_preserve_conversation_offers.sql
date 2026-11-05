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
  v_publicacion_id uuid;
  v_estado_publicacion text;
BEGIN
  -- Orden de bloqueos estable: publicación y luego propuesta.
  SELECT publicacion_id INTO v_publicacion_id
  FROM public.intercambios
  WHERE id = p_intercambio_id;

  IF NOT FOUND OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autorizado para responder esta propuesta';
  END IF;

  IF p_opcion NOT IN ('aceptar_condiciones', 'conversar', 'rechazar_propuesta') THEN
    RAISE EXCEPTION 'Opción de respuesta inválida';
  END IF;

  IF p_opcion <> 'rechazar_propuesta' AND v_publicacion_id IS NOT NULL THEN
    SELECT estado INTO v_estado_publicacion
    FROM public.publicaciones
    WHERE id = v_publicacion_id
    FOR UPDATE;
  END IF;

  SELECT * INTO v
  FROM public.intercambios
  WHERE id = p_intercambio_id
  FOR UPDATE;

  IF NOT FOUND OR auth.uid() <> v.usuario_a THEN
    RAISE EXCEPTION 'No autorizado para responder esta propuesta';
  END IF;

  IF v.estado <> 'pendiente_respuesta' THEN
    RAISE EXCEPTION 'La propuesta ya no admite respuestas';
  END IF;

  IF v.fecha_respuesta_limite < now() THEN
    UPDATE public.intercambios SET estado = 'vencido' WHERE id = v.id;
    RAISE EXCEPTION 'La propuesta venció';
  END IF;

  IF p_opcion = 'aceptar_condiciones' AND v.publicacion_id IS NOT NULL THEN
    IF v_estado_publicacion IS DISTINCT FROM 'publicada' THEN
      RAISE EXCEPTION 'La publicación ya no está disponible para aceptar otra oferta';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.intercambios i
      WHERE i.publicacion_id = v.publicacion_id
        AND i.id <> v.id
        AND i.estado IN (
          'respuesta_recibida',
          'conversacion_pendiente',
          'acuerdo_pendiente_confirmacion',
          'en_proceso',
          'incumplido',
          'regularizacion_pendiente'
        )
    ) THEN
      RAISE EXCEPTION 'Ya hay otra propuesta aceptada o en conversación para esta publicación';
    END IF;
  END IF;

  v_estado := CASE
    WHEN p_opcion = 'conversar' THEN 'conversacion_pendiente'
    WHEN p_opcion = 'rechazar_propuesta' THEN 'rechazado'
    ELSE 'respuesta_recibida'
  END;

  UPDATE public.intercambios
  SET respuesta_b = jsonb_build_object(
        'opcion', p_opcion,
        'oferta', coalesce(p_oferta, '{}'::jsonb),
        'respondido_en', now(),
        'archivada_por_iniciador', false
      ),
      estado = v_estado
  WHERE id = v.id;

  -- Solo la aceptación explícita cierra las otras ofertas pendientes.
  IF p_opcion = 'aceptar_condiciones' AND v.publicacion_id IS NOT NULL THEN
    UPDATE public.intercambios
    SET estado = 'rechazado',
        respuesta_b = jsonb_build_object(
          'opcion', 'rechazar_propuesta',
          'motivo', 'otra_oferta_aceptada',
          'respondido_en', now(),
          'archivada_por_iniciador', false
        )
    WHERE publicacion_id = v.publicacion_id
      AND id <> v.id
      AND estado = 'pendiente_respuesta';
  END IF;

  RETURN jsonb_build_object('ok', true, 'estado', v_estado);
END;
$function$;

REVOKE ALL ON FUNCTION public.hmc_responder_intercambio(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hmc_responder_intercambio(uuid, text, jsonb) TO authenticated;