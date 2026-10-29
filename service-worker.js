const CACHE_NAME = "humanometro-comunidad-v3";
const CACHE_PREFIX = "humanometro-comunidad-";

const ARCHIVOS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/app.js",
  "./js/storage.js",
  "./js/connectivity.js",
  "./js/messages.js",
  "./js/community.js",
  "./js/auth.js",
  "./js/supabase.js",
  "./assets/boton-principal.png",
  "./assets/fondo-comunidad.png"
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      await Promise.all(
        ARCHIVOS.map(async (archivo) => {
          try {
            await cache.add(archivo);
          } catch (error) {
            console.warn(
              "No se pudo guardar en caché:",
              archivo,
              error
            );
          }
        })
      );

      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      const nombres = await caches.keys();

      await Promise.all(
        nombres
          .filter(
            (nombre) =>
              nombre.startsWith(CACHE_PREFIX) &&
              nombre !== CACHE_NAME
          )
          .map((nombre) => caches.delete(nombre))
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (evento) => {
  const solicitud = evento.request;

  if (solicitud.method !== "GET") {
    return;
  }

  const url = new URL(solicitud.url);

  // Solo se gestionan recursos del mismo sitio.
  // Las solicitudes a Supabase y otros servicios externos
  // no se guardan en esta caché.
  if (url.origin !== self.location.origin) {
    return;
  }

  evento.respondWith(
    (async () => {
      try {
        const respuestaRed = await fetch(solicitud);

        if (respuestaRed && respuestaRed.ok) {
          const cache = await caches.open(CACHE_NAME);

          await cache
            .put(solicitud, respuestaRed.clone())
            .catch((error) => {
              console.warn(
                "No se pudo actualizar la caché:",
                solicitud.url,
                error
              );
            });
        }

        return respuestaRed;
      } catch (error) {
        const cache = await caches.open(CACHE_NAME);
        const respuestaGuardada = await cache.match(solicitud);

        if (respuestaGuardada) {
          return respuestaGuardada;
        }

        if (solicitud.mode === "navigate") {
          const pagina = await cache.match("./index.html");

          if (pagina) {
            return pagina;
          }
        }

        return new Response(
          "Este recurso no está disponible sin conexión. " +
            "Conectate a internet e intentá nuevamente.",
          {
            status: 503,
            headers: {
              "Content-Type": "text/plain; charset=utf-8"
            }
          }
        );
      }
    })()
  );
});
