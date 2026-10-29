HUMANÓMETRO COMUNIDAD

Una red humana de ayuda mutua, solidaridad y colaboración.

HUMANÓMETRO COMUNIDAD es un proyecto orientado a conectar personas de una misma comunidad, facilitar la colaboración entre vecinos y promover acciones concretas de solidaridad.

Objetivos

- Conectar a las personas con su barrio.
- Facilitar el intercambio comunitario.
- Permitir que las personas expresen necesidades y ofrezcan ayuda.
- Promover la colaboración y el cuidado mutuo.
- Desarrollar un Humanómetro de Humanidad basado en acciones reales.
- Preparar una experiencia progresivamente accesible sin conexión a internet.

Estructura del proyecto

- "index.html": estructura de la aplicación.
- "manifest.json": identidad y configuración de la aplicación web.
- "service-worker.js": caché de recursos para mejorar la disponibilidad sin conexión.
- "css/styles.css": estilos visuales.
- "js/app.js": coordinación e interacción general.
- "js/community.js": publicaciones comunitarias.
- "js/connectivity.js": detección de conexión.
- "js/messages.js": base local para mensajes pendientes.
- "js/storage.js": almacenamiento local.
- "assets/": imágenes y recursos gráficos.

Estado actual

La aplicación está en desarrollo.

Actualmente se están preparando:

- La navegación entre secciones.
- La selección y el guardado local del barrio.
- El perfil básico del usuario.
- La estructura de la góndola comunitaria.
- El almacenamiento local de publicaciones.
- La detección de conexión y desconexión.
- La preparación de recursos para su uso sin conexión.

Limitaciones actuales

El almacenamiento local no equivale a una red comunitaria conectada.

Las publicaciones y los mensajes guardados localmente no se comparten automáticamente con otros dispositivos.

Para habilitar una comunidad real con usuarios conectados, será necesario incorporar y probar un servicio de datos compartidos, autenticación y mecanismos de protección de la información.

La comunicación directa sin internet también requiere una solución técnica específica compatible con los dispositivos y las condiciones de conexión.

Las funciones de solicitud de ayuda, ofrecimiento de ayuda y reputación basada en acciones reales deberán implementarse y probarse antes de considerarlas operativas.

Principios del proyecto

1. Solidaridad y ayuda mutua.
2. Respeto por las personas.
3. Protección de los datos personales.
4. Transparencia sobre las funciones disponibles.
5. Reconocimiento de las acciones humanas reales.
6. Desarrollo progresivo y accesible.

---

HUMANÓMETRO COMUNIDAD
Una comunidad más humana empieza con una acción concreta.

Ajustes de perfil, conectividad y mensajería

Esta versión añade búsqueda explícita de publicaciones, foto de perfil, preferencias voluntarias de Conectividad Solidaria, listado de publicaciones propias y envío de mensajes entre cuentas.

Antes de probar las funciones nuevas, revisar y ejecutar el archivo "supabase-ajustes.sql" en el SQL Editor del proyecto Supabase. El SQL debe revisarse contra las políticas RLS ya existentes; no reemplaza una auditoría de permisos.

La mensajería requiere que el destinatario exista en "perfiles" y que "perfiles.id" coincida con el ID de su usuario autenticado. El campo destinatario utiliza el nombre visible exacto; nombres duplicados no se aceptan para evitar enviar mensajes a la persona equivocada.

La foto usa el bucket público "fotos-perfil" y límite de 5 MB. El usuario solo puede subir archivos dentro de su propia carpeta de almacenamiento.
