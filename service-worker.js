const CACHE_NAME = "humanometro-comunidad-v17";
const CACHE_PREFIX = "humanometro-comunidad-";

// Archivos estáticos principales de la interfaz
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
  "./js/supabase.js"
];

// Archivos indispensables para garantizar que la app cargue
const ARCHIVOS_ESENCIALES = [
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/storage.js",
  "./js/supabase.js"
];

// 1. INSTALL: Descarga y guarda los recursos estáticos esenciales
self.addEventListener("install", (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      try {
        await Promise.all(
          ARCHIVOS.map(async (archivo) => {
            try {
              const url = new URL(archivo, self.registration.scope);
              const solicitud = new Request(url.href, { cache: "reload" });
              await cache.add(solicitud);
            } catch (error) {
              console.warn("Recurso opcional no cacheado:", archivo);
            }
          })
        );

        // Validar que los archivos esenciales sí o sí estén en caché
        for (const archivo of ARCHIVOS_ESENCIALES) {
          const url = new URL(archivo, self.registration.scope);
          const guardado = await cache.match(url.href);
          if (!guardado) {
            throw new Error("Falta archivo esencial: " + archivo);
          }
        }
      } catch (error) {
        await caches.delete(CACHE_NAME);
        throw error;
      }
    })()
  );
});

// 2. ACTIVATE: Limpia cachés antiguas para que la app siempre tome lo nuevo
self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(
        nombres
          .filter(
            (nombre) =>
              nombre.startsWith(CACHE_PREFIX) && nombre !== CACHE_NAME
          )
          .map((nombre) => caches.delete(nombre))
      );
      await self.clients.claim();
    })()
  );
});

// 3. FETCH: Maneja las peticiones priorizando la red para datos y caché para estáticos
self.addEventListener("fetch", (evento) => {
  const solicitud = evento.request;

  // Solo interceptamos peticiones GET de nuestro propio origen (ignoramos Supabase y APIs externas)
  if (solicitud.method !== "GET") return;

  const url = new URL(solicitud.url);

  if (
    url.origin !== self.location.origin ||
    !url.href.startsWith(self.registration.scope)
  ) {
    return;
  }

  // Si es una petición a Supabase o rutas de API dinámicas, el Service Worker no se mete jamás
  if (url.pathname.includes("/rest/v1/") || url.pathname.includes("/auth/v1/")) {
    return;
  }

  evento.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      try {
        // Intentamos buscar primero en la red para tener siempre la última versión
        const respuestaRed = await fetch(solicitud);
        
        if (respuestaRed && respuestaRed.ok && respuestaRed.type === "basic") {
          cache.put(solicitud, respuestaRed.clone()).catch(() => {});
        }
        
        return respuestaRed;
      } catch (error) {
        // Si no hay red, recurrimos a la caché local
        const respuestaGuardada = await cache.match(solicitud);
        if (respuestaGuardada) {
          return respuestaGuardada;
        }

        // Si es navegación y falló todo, devolvemos el index.html principal
        if (solicitud.mode === "navigate") {
          const pagina = await cache.match(
            new URL("./index.html", self.registration.scope).href
          );
          if (pagina) return pagina;
        }

        return new Response("Sin conexión a la red.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }
    })()
  );
});
