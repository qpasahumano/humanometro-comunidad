
const CACHE_NAME = "humanometro-comunidad-v1";

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
  "./assets/boton-principal.png",
  "./assets/fondo-comunidad.png"
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(
        ARCHIVOS.map(async (archivo) => {
          try {
            await cache.add(archivo);
          } catch (error) {
            console.warn("No se pudo guardar en caché:", archivo, error);
          }
        })
      );

      await self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then(async (nombres) => {
      await Promise.all(
        nombres
          .filter((nombre) => nombre !== CACHE_NAME)
          .map((nombre) => caches.delete(nombre))
      );

      await self.clients.claim();
    })
  );
});

self.addEventListener("fetch", (evento) => {
  const solicitud = evento.request;

  if (solicitud.method !== "GET") return;

  const url = new URL(solicitud.url);

  if (url.origin !== self.location.origin) return;

  evento.respondWith(
    (async () => {
      try {
        const respuestaRed = await fetch(solicitud);

        if (respuestaRed && respuestaRed.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(solicitud, respuestaRed.clone()).catch(() => {});
        }

        return respuestaRed;
      } catch (error) {
        const respuestaGuardada = await caches.match(solicitud);

        if (respuestaGuardada) return respuestaGuardada;

        if (solicitud.mode === "navigate") {
          const pagina = await caches.match("./index.html");
          if (pagina) return pagina;
        }

        return new Response(
          "Este recurso no está disponible sin conexión. Conectate a internet e intentá nuevamente.",
          {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          }
        );
      }
    })()
  );
});
