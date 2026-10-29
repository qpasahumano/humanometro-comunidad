const STORAGE_KEY = "hm_mensajes_pendientes";

export function initMessages({
  getItem,
  setItem,
  mostrarNotificacion
}) {
  const formulario = document.getElementById("form-mensaje");
  const lista = document.getElementById("lista-mensajes");
  const estado = document.getElementById("estado-mensaje");

  function obtenerMensajes() {
    const mensajes = getItem(STORAGE_KEY, []);
    return Array.isArray(mensajes) ? mensajes : [];
  }

  function renderizarMensajes() {
    if (!lista) return;

    lista.replaceChildren();
    const mensajes = obtenerMensajes();

    if (!mensajes.length) {
      const aviso = document.createElement("p");
      aviso.textContent = "Todavía no hay mensajes guardados en este dispositivo.";
      lista.appendChild(aviso);
      return;
    }

    mensajes.slice().reverse().forEach((mensaje) => {
      const tarjeta = document.createElement("article");
      tarjeta.className = "tarjeta-publicacion";

      const titulo = document.createElement("h3");
      titulo.textContent = mensaje.destinatario
        ? `Para: ${mensaje.destinatario}`
        : "Mensaje sin destinatario";

      const texto = document.createElement("p");
      texto.textContent = mensaje.texto;

      const fecha = document.createElement("small");
      fecha.textContent = `Guardado: ${new Date(
        mensaje.fecha
      ).toLocaleString("es-AR")}`;

      const estadoMensaje = document.createElement("small");
      estadoMensaje.textContent = "Pendiente: todavía no fue enviado.";

      tarjeta.append(titulo, texto, fecha, estadoMensaje);
      lista.appendChild(tarjeta);
    });
  }

  if (!Array.isArray(getItem(STORAGE_KEY, []))) {
    setItem(STORAGE_KEY, []);
  }

  const estadoConexion = document.getElementById("estado-conexion");

  if (estadoConexion) {
    estadoConexion.textContent = navigator.onLine
      ? "Conexión a internet disponible. El chat entre usuarios aún no está conectado."
      : "Sin conexión. Los datos guardados en este dispositivo siguen disponibles.";
  }

  formulario?.addEventListener("submit", (evento) => {
    evento.preventDefault();

    const texto = document.getElementById("texto-mensaje")?.value.trim();
    const destinatario =
      document.getElementById("destinatario-mensaje")?.value.trim() || "";

    if (!texto) {
      mostrarNotificacion("Escribí un mensaje antes de guardarlo.");
      return;
    }

    const mensajes = obtenerMensajes();

    mensajes.push({
      id: typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      destinatario,
      texto,
      fecha: new Date().toISOString(),
      estado: "pendiente"
    });

    if (!setItem(STORAGE_KEY, mensajes)) {
      mostrarNotificacion("No se pudo guardar el mensaje.");
      return;
    }

    formulario.reset();

    if (estado) {
      estado.textContent =
        "Mensaje guardado localmente. Todavía no fue enviado.";
    }

    renderizarMensajes();
    mostrarNotificacion("Mensaje guardado en este dispositivo.");
  });

  renderizarMensajes();

  return {
    guardarMensaje(mensaje, destinatario = "") {
      const texto = String(mensaje || "").trim();

      if (!texto) {
        if (typeof mostrarNotificacion === "function") {
          mostrarNotificacion("Escribí un mensaje antes de guardarlo.");
        }
        return false;
      }

      const mensajes = obtenerMensajes();

      mensajes.push({
        id: typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        texto,
        destinatario: String(destinatario || "").trim(),
        fecha: new Date().toISOString(),
        estado: "pendiente"
      });

      const guardado = setItem(STORAGE_KEY, mensajes);

      if (guardado) {
        renderizarMensajes();
        mostrarNotificacion("Mensaje guardado localmente; no fue enviado.");
      }

      return guardado;
    },

    obtenerMensajes,
    renderizarMensajes
  };
}
