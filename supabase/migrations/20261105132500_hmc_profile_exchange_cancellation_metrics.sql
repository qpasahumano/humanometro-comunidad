CREATE OR REPLACE FUNCTION public.hmc_conteo_cancelaciones_intercambios(p_perfil_ids uuid[])
RETURNS TABLE(
  perfil_id uuid,
  total_iniciados bigint,
  total_cancelados bigint,
  cancelaciones_90_dias bigint,
  riesgo_membresia boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Se requiere una sesión autenticada';
  END IF;

  IF p_perfil_ids IS NULL OR cardinality(p_perfil_ids) = 0 THEN
    RETURN;
  END IF;

  IF cardinality(p_perfil_ids) > 200 THEN
    RAISE EXCEPTION 'La consulta supera el máximo de perfiles permitido';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    count(i.id) FILTER (WHERE i.usuario_b = p.id)::bigint,
    count(i.id) FILTER (WHERE i.cancelado_por = p.id)::bigint,
    count(i.id) FILTER (
      WHERE i.cancelado_por = p.id
        AND i.estado = 'cancelado'
        AND i.cancelado_en >= now() - interval '90 days'
    )::bigint,
    (
      count(i.id) FILTER (
        WHERE i.cancelado_por = p.id
          AND i.estado = 'cancelado'
          AND i.cancelado_en >= now() - interval '90 days'
      ) >= 3
    )
  FROM public.perfiles AS p
  LEFT JOIN public.intercambios AS i
    ON (i.usuario_a = p.id OR i.usuario_b = p.id)
  WHERE p.id = ANY(p_perfil_ids)
    AND coalesce(p.estado_acceso_comunidad, 'activo') = 'activo'
  GROUP BY p.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.hmc_conteo_cancelaciones_intercambios(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hmc_conteo_cancelaciones_intercambios(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.hmc_conteo_cancelaciones_intercambios(uuid[]) TO authenticated;