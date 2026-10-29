const STORAGE_KEY = "hm_publicaciones";

export function initCommunity({ getItem, setItem, mostrarNotificacion }) {
  const formulario = document.getElementById("form-publicacion");
  const lista = document.getElementById("lista-publicaciones");

  function obtenerPublicaciones() {
    const publicaciones = getItem(STORAGE_KEY, []);
    return Array.isArray(publicaciones) ? publicaciones : [];
  }

  function mostrarPublicaciones() {
    if (!lista) return;

    lista.replaceChildren();

    const publicaciones = obtenerPublicaciones();

    if (publicaciones.length === 0) {
      const mensaje = document.createElement("p");
      mensaje.textContent =
        "Todavía no hay publicaciones guardadas en este dispositivo.";
      lista.appendChild(mensaje);
      return;
    }

    publicaciones.slice().reverse().forEach((publicacion) => {
      const tarjeta = document.createElement("article");
      tarjeta.className = "tarjeta-publicacion";

      const titulo = document.createElement("h3");
      titulo.textContent = publicacion.titulo;

      const categoria = document.createElement("p");
      categoria.textContent = `Categoría: ${publicacion.categoria}`;

      const detalle = document.createElement("p");
      detalle.textContent = publicacion.detalle;

      const fecha = document.createElement("small");
      fecha.textContent = `Guardada: ${new Date(
        publicacion.fecha
      ).toLocaleString("es-AR")}`;

      const alcance = document.createElement("small");
      alcance.textContent = "Visible solamente en este dispositivo.";

      tarjeta.append(titulo, categoria, detalle, fecha, alcance);
      lista.appendChild(tarjeta);
    });
  }

  if (formulario) {
    formulario.addEventListener("submit", (evento) => {
      evento.preventDefault();

      const categoria = document.getElementById("categoria-publicacion");
      const titulo = document.getElementById("titulo-publicacion");
      const detalle = document.getElementById("detalle-publicacion");

      if (!categoria || !titulo || !detalle) {
        mostrarNotificacion(
          "No se encontraron todos los campos del formulario."
        );
        return;
      }

      const nuevaPublicacion = {
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        categoria: categoria.value.trim(),
        titulo: titulo.value.trim(),
        detalle: detalle.value.trim(),
        fecha: new Date().toISOString(),
      };

      if (
        !nuevaPublicacion.categoria ||
        !nuevaPublicacion.titulo ||
        !nuevaPublicacion.detalle
      ) {
        mostrarNotificacion("Completá todos los campos de la publicación.");
        return;
      }

      const publicaciones = obtenerPublicaciones();
      publicaciones.push(nuevaPublicacion);

      if (!setItem(STORAGE_KEY, publicaciones)) {
        mostrarNotificacion(
          "No se pudo guardar. Revisá el almacenamiento del navegador."
        );
        return;
      }

      formulario.reset();
      mostrarPublicaciones();
      mostrarNotificacion(
        "Publicación guardada en este dispositivo; todavía no se compartió."
      );
    });
  }

  mostrarPublicaciones();

  return { mostrarPublicaciones };
}
