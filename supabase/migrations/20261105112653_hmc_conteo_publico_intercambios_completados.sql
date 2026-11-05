create or replace function public.hmc_conteo_intercambios_completados(p_perfil_ids uuid[])
returns table(perfil_id uuid, total_completados bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada';
  end if;
  if p_perfil_ids is null or cardinality(p_perfil_ids) = 0 then
    return;
  end if;
  if cardinality(p_perfil_ids) > 200 then
    raise exception 'La consulta supera el máximo de perfiles permitido';
  end if;
  return query
  select p.id, count(distinct i.id)::bigint
  from public.perfiles as p
  left join public.intercambios as i
    on i.estado = 'completado'
   and (i.usuario_a = p.id or i.usuario_b = p.id)
  where p.id = any(p_perfil_ids)
    and coalesce(p.estado_acceso_comunidad, 'activo') = 'activo'
  group by p.id;
end;
$$;
revoke all on function public.hmc_conteo_intercambios_completados(uuid[]) from public;
revoke all on function public.hmc_conteo_intercambios_completados(uuid[]) from anon;
revoke all on function public.hmc_conteo_intercambios_completados(uuid[]) from authenticated;
grant execute on function public.hmc_conteo_intercambios_completados(uuid[]) to authenticated;