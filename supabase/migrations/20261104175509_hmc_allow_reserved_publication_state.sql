-- HUMANÓMETRO COMUNIDAD
-- Permite reservar una publicación al confirmar bilateralmente un acuerdo.
-- La publicación vuelve a publicada al cancelar/regularizar y pasa a retirada
-- cuando el intercambio termina con ambas evaluaciones.
ALTER TABLE public.publicaciones
  DROP CONSTRAINT IF EXISTS publicaciones_estado_check;

ALTER TABLE public.publicaciones
  ADD CONSTRAINT publicaciones_estado_check
  CHECK (estado = ANY (ARRAY['publicada'::text, 'reservada'::text, 'retirada'::text]));
