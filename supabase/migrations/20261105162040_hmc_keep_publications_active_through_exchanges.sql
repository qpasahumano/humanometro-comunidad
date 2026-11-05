-- Mantener las publicaciones activas durante todo el circuito de intercambio.
-- Solo la persona propietaria puede retirarlas desde la gestión de publicaciones.

UPDATE public.publicaciones
SET estado = 'publicada',
    actualizado_en = now()
WHERE estado = 'reservada';

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
  v_publicacion_id uuid;
  v_estado_publicacion text;
  v_estado text;
BEGIN
  SELECT publicacion_id INTO v_publicacion_id
  FROM public.intercambios
  WHERE id = p_intercambio_id;

  IF NOT FOUND OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autorizado para responder esta propuesta';
  END IF;

  IF p_opcion NOT IN ('aceptar_condiciones', 'rechazar_propuesta') THEN
    RAISE EXCEPTION 'Opción de respuesta inválida';
  END IF;

  -- La aceptación se serializa por publicación para evitar dos aceptaciones simultáneas.
  IF p_opcion = 'aceptar_condiciones' AND v_publicacion_id IS NOT NULL THEN
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

    -- Una conversación histórica no equivale a una aceptación y no reserva la publicación.
    IF EXISTS (
      SELECT 1
      FROM public.intercambios i
      WHERE i.publicacion_id = v.publicacion_id
        AND i.id <> v.id
        AND i.estado IN (
          'respuesta_recibida',
          'acuerdo_pendiente_confirmacion',
          'en_proceso',
          'incumplido',
          'regularizacion_pendiente'
        )
    ) THEN
      RAISE EXCEPTION 'Ya hay otra propuesta aceptada o en proceso para esta publicación';
    END IF;
  END IF;

  v_estado := CASE
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

  -- Solo una aceptación explícita cierra las demás ofertas pendientes.
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

CREATE OR REPLACE FUNCTION public.hmc_confirmar_acuerdo(p_intercambio_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v public.intercambios%rowtype;
  v_ahora timestamptz := now();
BEGIN
  SELECT * INTO v
  FROM public.intercambios
  WHERE id = p_intercambio_id
  FOR UPDATE;

  IF NOT FOUND OR auth.uid() IS NULL OR auth.uid() NOT IN (v.usuario_a, v.usuario_b) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF v.estado <> 'acuerdo_pendiente_confirmacion' OR v.propuesta_final IS NULL THEN
    RAISE EXCEPTION 'No hay un acuerdo pendiente de confirmación';
  END IF;

  UPDATE public.intercambios
  SET acuerdo_confirmado_a = acuerdo_confirmado_a OR (auth.uid() = usuario_a),
      acuerdo_confirmado_b = acuerdo_confirmado_b OR (auth.uid() = usuario_b)
  WHERE id = v.id;

  SELECT * INTO v
  FROM public.intercambios
  WHERE id = p_intercambio_id;

  IF v.acuerdo_confirmado_a AND v.acuerdo_confirmado_b THEN
    UPDATE public.intercambios
    SET estado = 'en_proceso',
        fecha_limite_a = v_ahora + ((v.propuesta_final->>'horas_a')::int * interval '1 hour'),
        fecha_limite_b = v_ahora + ((v.propuesta_final->>'horas_b')::int * interval '1 hour'),
        fecha_limite = greatest(
          v_ahora + ((v.propuesta_final->>'horas_a')::int * interval '1 hour'),
          v_ahora + ((v.propuesta_final->>'horas_b')::int * interval '1 hour')
        )
    WHERE id = v.id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'estado', CASE
      WHEN v.acuerdo_confirmado_a AND v.acuerdo_confirmado_b THEN 'en_proceso'
      ELSE 'acuerdo_pendiente_confirmacion'
    END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.hmc_cancelar_intercambio(
  p_intercambio_id uuid,
  p_motivo text DEFAULT 'sin_motivo'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v public.intercambios%rowtype;
  v_motivo text := COALESCE(NULLIF(btrim(p_motivo), ''), 'sin_motivo');
BEGIN
  IF v_motivo NOT IN ('sin_motivo','me_arrepenti','motivos_personales','no_estoy_conforme','no_estoy_seguro') THEN
    RAISE EXCEPTION 'Motivo de cancelación no válido';
  END IF;

  SELECT * INTO v
  FROM public.intercambios
  WHERE id = p_intercambio_id
  FOR UPDATE;

  IF NOT FOUND OR auth.uid() IS NULL OR auth.uid() NOT IN (v.usuario_a, v.usuario_b) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF v.estado NOT IN (
    'en_proceso',
    'acuerdo_pendiente_confirmacion',
    'pendiente_respuesta',
    'respuesta_recibida',
    'conversacion_pendiente',
    'incumplido',
    'regularizacion_pendiente'
  ) THEN
    RAISE EXCEPTION 'Este proceso no se puede cancelar en su estado actual';
  END IF;

  -- La cancelación voluntaria no genera incumplimientos nuevos y no altera la publicación.
  UPDATE public.intercambios
  SET estado = 'cancelado',
      cancelado_por = auth.uid(),
      cancelado_en = now(),
      cancelacion_motivo = v_motivo,
      regularizacion_solicitada_por = NULL,
      regularizacion_confirmada_por = NULL
  WHERE id = v.id;

  RETURN jsonb_build_object(
    'ok', true,
    'estado', 'cancelado',
    'motivo', v_motivo,
    'penalizacion', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.hmc_finalizar_intercambio_evaluado(p_intercambio_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v public.intercambios%rowtype;
  v_total integer;
BEGIN
  SELECT * INTO v
  FROM public.intercambios
  WHERE id = p_intercambio_id
  FOR UPDATE;

  IF NOT FOUND OR auth.uid() IS NULL OR auth.uid() NOT IN (v.usuario_a, v.usuario_b) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF v.estado <> 'en_proceso' OR NOT v.confirmado_a OR NOT v.confirmado_b THEN
    RAISE EXCEPTION 'Ambas partes deben confirmar el cumplimiento';
  END IF;

  SELECT count(DISTINCT evaluador_id) INTO v_total
  FROM public.evaluaciones
  WHERE intercambio_id = v.id
    AND evaluador_id IN (v.usuario_a, v.usuario_b);

  IF v_total < 2 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'estado', v.estado,
      'mensaje', 'Falta la evaluación de una de las partes'
    );
  END IF;

  UPDATE public.intercambios
  SET estado = 'completado'
  WHERE id = v.id
    AND estado = 'en_proceso';

  -- La finalización del intercambio no retira ni reserva la publicación.
  RETURN jsonb_build_object('ok', true, 'estado', 'completado');
END;
$function$;
