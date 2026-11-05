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
  SELECT * INTO v FROM public.intercambios WHERE id = p_intercambio_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR auth.uid() NOT IN (v.usuario_a, v.usuario_b) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF v.estado NOT IN ('en_proceso','acuerdo_pendiente_confirmacion','pendiente_respuesta','respuesta_recibida','conversacion_pendiente','incumplido','regularizacion_pendiente') THEN
    RAISE EXCEPTION 'Este proceso no se puede cancelar en su estado actual';
  END IF;

  -- La cancelación voluntaria no genera incumplimientos nuevos. Si ya existía
  -- un incumplimiento previo, se conserva su registro histórico sin borrarlo.
  UPDATE public.intercambios
  SET estado = 'cancelado',
      cancelado_por = auth.uid(),
      cancelado_en = now(),
      cancelacion_motivo = v_motivo,
      regularizacion_solicitada_por = NULL,
      regularizacion_confirmada_por = NULL
  WHERE id = v.id;

  IF v.publicacion_id IS NOT NULL THEN
    UPDATE public.publicaciones
    SET estado = 'publicada', actualizado_en = now()
    WHERE id = v.publicacion_id AND estado IN ('reservada','publicada');
  END IF;

  RETURN jsonb_build_object('ok',true,'estado','cancelado','motivo',v_motivo,'penalizacion',false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.hmc_cancelar_intercambio(p_intercambio_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT public.hmc_cancelar_intercambio(p_intercambio_id, 'sin_motivo');
$function$;

REVOKE ALL ON FUNCTION public.hmc_cancelar_intercambio(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hmc_cancelar_intercambio(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.hmc_cancelar_intercambio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hmc_cancelar_intercambio(uuid) TO authenticated;