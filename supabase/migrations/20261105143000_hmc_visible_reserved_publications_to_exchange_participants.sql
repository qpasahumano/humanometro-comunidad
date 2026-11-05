DROP POLICY IF EXISTS "HMC participantes ven publicaciones reservadas" ON public.publicaciones;
CREATE POLICY "HMC participantes ven publicaciones reservadas"
ON public.publicaciones
FOR SELECT
TO authenticated
USING (
  estado = 'reservada'
  AND EXISTS (
    SELECT 1 FROM public.intercambios i
    WHERE i.publicacion_id = publicaciones.id
      AND i.estado IN ('pendiente_respuesta','respuesta_recibida','conversacion_pendiente','acuerdo_pendiente_confirmacion','en_proceso','incumplido','regularizacion_pendiente')
      AND auth.uid() IN (i.usuario_a, i.usuario_b)
  )
);