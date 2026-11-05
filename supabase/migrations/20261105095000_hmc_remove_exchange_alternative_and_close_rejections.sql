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
BEGIN
  SELECT * INTO v
  FROM public.intercambios
  WHERE id = p_intercambio_id
  FOR UPDATE;

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

  v_estado := CASE WHEN p_opcion = 'conversar' THEN 'conversacion_pendiente'
                   WHEN p_opcion = 'rechazar_propuesta' THEN 'rechazado'
                   ELSE 'respuesta_recibida' END;

  UPDATE public.intercambios
  SET respuesta_b = jsonb_build_object(
        'opcion', p_opcion,
        'oferta', coalesce(p_oferta, '{}'::jsonb),
        'respondido_en', now()
      ),
      estado = v_estado
  WHERE id = v.id;

  RETURN jsonb_build_object('ok', true, 'estado', v_estado);
END;
$function$;

CREATE OR REPLACE FUNCTION public.hmc_cancelar_intercambio(p_intercambio_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v public.intercambios%rowtype;
  v_limite timestamptz;
BEGIN
  SELECT * INTO v
  FROM public.intercambios
  WHERE id = p_intercambio_id
  FOR UPDATE;

  IF NOT FOUND OR auth.uid() IS NULL OR auth.uid() NOT IN (v.usuario_a, v.usuario_b) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF v.estado NOT IN ('en_proceso', 'acuerdo_pendiente_confirmacion', 'pendiente_respuesta', 'respuesta_recibida', 'conversacion_pendiente', 'rechazado') THEN
    RAISE EXCEPTION 'Este proceso no se puede cancelar en su estado actual';
  END IF;

  IF v.estado = 'pendiente_respuesta' AND auth.uid() <> v.usuario_b THEN
    RAISE EXCEPTION 'Solo quien inició el intercambio puede cancelar la solicitud antes de recibir respuesta';
  END IF;

  IF v.estado = 'en_proceso' THEN
    v_limite := CASE WHEN auth.uid() = v.usuario_a THEN v.fecha_limite_b ELSE v.fecha_limite_a END;
    IF v_limite IS NULL OR now() > v_limite - interval '24 hours' THEN
      RAISE EXCEPTION 'La cancelación debe realizarse al menos 24 horas antes de tu vencimiento';
    END IF;
  END IF;

  UPDATE public.intercambios
  SET estado = 'cancelado', cancelado_por = auth.uid(), cancelado_en = now()
  WHERE id = v.id;

  IF v.publicacion_id IS NOT NULL THEN
    UPDATE public.publicaciones
    SET estado = 'publicada', actualizado_en = now()
    WHERE id = v.publicacion_id AND estado = 'reservada';
  END IF;

  RETURN jsonb_build_object('ok', true, 'estado', 'cancelado');
END;
$function$;