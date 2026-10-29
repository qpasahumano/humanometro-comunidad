const STORAGE_KEY = "hm_mensajes_pendientes";

export function initMessages({ getItem, setItem, mostrarNotificacion }) {
  // Prepara la bandeja local de mensajes.
  const mensajes = getItem(STORAGE_KEY, []);

  if (!Array.isArray(mensajes)) {
    setItem(STORAGE_KEY, []);
  }

  // Informa que el módulo está preparado para una futura conexión.
  const estado = document.getElementById("estado-conexion");

  if (estado && !navigator.onLine) {
    estado.textContent =
      "Sin conexión. Los datos guardados en este dispositivo siguen disponibles.";
  }

  return {
    guardarMensaje(mensaje) {
      const texto = String(mensaje || "").trim();

      if (!texto) {
        if (typeof mostrarNotificacion === "function") {
          mostrarNotificacion("Escribí un mensaje antes de guardarlo.");
        }
        return false;
      }

      const bandeja = getItem(STORAGE_KEY, []);

      bandeja.push({
        texto,
        fecha: new Date().toISOString(),
        estado: "pendiente",
      });

      const guardado = setItem(STORAGE_KEY, bandeja);

      if (guardado && typeof mostrarNotificacion === "function") {
        mostrarNotificacion(
          "Mensaje guardado en este dispositivo. Todavía no fue enviado."
        );
      }

      return guardado;
    },

    obtenerMensajes() {
      return getItem(STORAGE_KEY, []);
    },
  };
}
