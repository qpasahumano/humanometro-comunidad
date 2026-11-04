CREATE OR REPLACE FUNCTION public.hmc_bloquear_medicamentos_en_publicaciones()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_texto text;
  v_es_directorio_oficial boolean;
BEGIN
  -- El directorio institucional se identifica por el metadato de categoría
  -- que genera el formulario oficial; no se habilitan ofertas particulares.
  v_es_directorio_oficial :=
    NEW.categoria = 'servicios'
    AND position('categoriaui%22%3a%22bancos_salud_oficial' IN lower(coalesce(NEW.descripcion, ''))) > 0;

  IF v_es_directorio_oficial THEN
    RETURN NEW;
  END IF;

  v_texto := translate(
    lower(coalesce(NEW.titulo, '') || ' ' || coalesce(NEW.descripcion, '') || ' ' || coalesce(NEW.que_necesita_a_cambio, '')),
    'áéíóúü',
    'aeiouu'
  );

  IF v_texto ~ E'\\m(medicamentos?|remedios?|farmacos?|pastillas?|antibioticos?|vacunas?|ampollas?|comprimidos?|jarabes?|insulinas?|analgesicos?|antiinflamatorios?|psicotropicos?)\\M' THEN
    RAISE EXCEPTION 'No se permite ofrecer, solicitar, donar ni intercambiar medicamentos entre particulares. Consultá el directorio oficial de Bancos de Medicamentos y Redes de Salud.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_hmc_bloquear_medicamentos_publicaciones ON public.publicaciones;

CREATE TRIGGER trg_hmc_bloquear_medicamentos_publicaciones
BEFORE INSERT OR UPDATE OF titulo, descripcion, que_necesita_a_cambio, categoria
ON public.publicaciones
FOR EACH ROW
EXECUTE FUNCTION public.hmc_bloquear_medicamentos_en_publicaciones();