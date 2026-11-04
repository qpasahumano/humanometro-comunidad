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
  IF p_opcion NOT IN ('aceptar_condiciones', 'propuesta_alternativa', 'conversar', 'rechazar_propuesta') THEN
    RAISE EXCEPTION 'Opción de respuesta inválida';
  END IF;
  v_estado := CASE WHEN p_opcion = 'conversar' THEN 'conversacion_pendiente'
                   WHEN p_opcion = 'rechazar_propuesta' THEN 'rechazado'
                   ELSE 'respuesta_recibida' END;
  UPDATE public.intercambios
  SET respuesta_b = jsonb_build_object('opcion', p_opcion, 'oferta', coalesce(p_oferta, '{}'::jsonb), 'respondido_en', now()),
      estado = v_estado
  WHERE id = v.id;
  RETURN jsonb_build_object('ok', true, 'estado', v_estado);
END;
$function$;