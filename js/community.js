const STORAGE_KEY = "hm_publicaciones";

export function initCommunity({
  getItem,
  setItem,
  mostrarNotificacion
}) {
  const formulario = document.getElementById("form-publicacion");
  const lista = document.getElementById("lista-publicaciones");
  const categoria = document.getElementById("categoria-publicacion");
  const otraCategoria = document.getElementById("otra-categoria");
  const contenedorOtra = document.getElementById("contenedor-otra-categoria");
  const busqueda = document.getElementById("buscar-publicaciones");
  const filtroTipo = document.getElementById("filtro-tipo");
  const limpiarFiltros = document.getElementById("btn-limpiar-filtros");
  const estado = document.getElementById("estado-publicacion");

  function crearId() {
    return typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function obtenerPublicaciones() {
    const publicaciones = getItem(STORAGE_KEY, []);
    return Array.isArray(publicaciones) ? publicaciones : [];
  }

  function normalizar(texto) {
    return String(texto || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function mostrarPublicaciones() {
    if (!lista) return;

    lista.replaceChildren();

    const termino = normalizar(busqueda?.value);
    const tipoSeleccionado = filtroTipo?.value || "todas";

    const publicaciones = obtenerPublicaciones().filter((publicacion) => {
      const tipo = publicacion.tipo || "necesidad";

      if (tipoSeleccionado !== "todas" && tipo !== tipoSeleccionado) {
        return false;
      }

      const contenido = normalizar([
        publicacion.titulo,
        publicacion.detalle,
        publicacion.categoria,
        publicacion.otraCategoria,
        publicacion.barrio,
        tipo
      ].join(" "));

      return !termino || contenido.includes(termino);
    });

    if (!publicaciones.length) {
      const mensaje = document.createElement("p");
      mensaje.textContent = termino || tipoSeleccionado !== "todas"
        ? "No hay publicaciones que coincidan con esa búsqueda."
        : "Todavía no hay publicaciones guardadas en este dispositivo.";
      lista.appendChild(mensaje);
      return;
    }

    publicaciones.slice().reverse().forEach((publicacion) => {
      const tarjeta = document.createElement("article");
      tarjeta.className = "tarjeta-publicacion";

      const titulo = document.createElement("h3");
      titulo.textContent = publicacion.titulo || "Publicación sin título";

      const tipo = document.createElement("p");
      tipo.textContent = publicacion.tipo === "oferta"
        ? "OFREZCO"
        : "BUSCO";

      const categoriaTexto = publicacion.otraCategoria
        || publicacion.categoria
        || "Sin categoría";

      const categoriaElemento = document.createElement("p");
      categoriaElemento.textContent = `Categoría: ${categoriaTexto}`;

      const detalle = document.createElement("p");
      detalle.textContent = publicacion.detalle || "";

      tarjeta.append(titulo, tipo, categoriaElemento, detalle);

      if (publicacion.condicion) {
        const condicion = document.createElement("p");
        condicion.textContent =
          `Condición informada: ${traducirCondicion(publicacion.condicion)}`;
        tarjeta.appendChild(condicion);
      }

      if (publicacion.barrio) {
        const barrio = document.createElement("p");
        barrio.textContent = `Barrio: ${publicacion.barrio}`;
        tarjeta.appendChild(barrio);
      }

      const fecha = document.createElement("small");
      fecha.textContent = `Guardada: ${new Date(
        publicacion.fecha
      ).toLocaleString("es-AR")}`;

      const alcance = document.createElement("small");
      alcance.textContent = "Visible solamente en este dispositivo.";

      tarjeta.append(fecha, alcance);
      lista.appendChild(tarjeta);
    });
  }

  function traducirCondicion(condicion) {
    const opciones = {
      nuevo: "Nuevo",
      "usado-buen-estado": "Usado en buen estado",
      "usado-con-detalles": "Usado con detalles informados"
    };

    return opciones[condicion] || condicion;
  }

  function actualizarCampoOtraCategoria() {
    if (!categoria || !contenedorOtra || !otraCategoria) return;

    const mostrar = categoria.value === "otros";
    contenedorOtra.hidden = !mostrar;
    otraCategoria.required = mostrar;

    if (!mostrar) otraCategoria.value = "";
  }

  categoria?.addEventListener("change", actualizarCampoOtraCategoria);
  busqueda?.addEventListener("input", mostrarPublicaciones);
  filtroTipo?.addEventListener("change", mostrarPublicaciones);

  limpiarFiltros?.addEventListener("click", () => {
    if (busqueda) busqueda.value = "";
    if (filtroTipo) filtroTipo.value = "todas";
    mostrarPublicaciones();
  });

  formulario?.addEventListener("submit", (evento) => {
    evento.preventDefault();

    const tipo = document.getElementById("tipo-publicacion")?.value;
    const titulo = document.getElementById("titulo-publicacion")?.value.trim();
    const detalle = document.getElementById("detalle-publicacion")?.value.trim();
    const condicion = document.getElementById("condicion-publicacion")?.value || "";

    if (!tipo || !categoria || !titulo || !detalle) {
      mostrarNotificacion("Completá los campos obligatorios.");
      return;
    }

    const categoriaSeleccionada = categoria.value;
    const categoriaPersonalizada = otraCategoria?.value.trim() || "";

    if (categoriaSeleccionada === "otros" && !categoriaPersonalizada) {
      mostrarNotificacion("Especificá la categoría en el campo Otros.");
      otraCategoria?.focus();
      return;
    }

    const nuevaPublicacion = {
      id: crearId(),
      tipo,
      categoria: categoriaSeleccionada,
      otraCategoria: categoriaSeleccionada === "otros"
        ? categoriaPersonalizada
        : "",
      titulo,
      detalle,
      condicion,
      barrio: getItem("hm_barrio", ""),
      fecha: new Date().toISOString()
    };

    const publicaciones = obtenerPublicaciones();
    publicaciones.push(nuevaPublicacion);

    if (!setItem(STORAGE_KEY, publicaciones)) {
      mostrarNotificacion("No se pudo guardar. Revisá el almacenamiento del navegador.");
      return;
    }

    formulario.reset();
    actualizarCampoOtraCategoria();

    if (estado) {
      estado.textContent =
        "Publicación guardada en este dispositivo; todavía no se compartió.";
    }

    mostrarPublicaciones();
    mostrarNotificacion("Publicación guardada localmente.");
  });

  actualizarCampoOtraCategoria();
  mostrarPublicaciones();

  return { mostrarPublicaciones };
}
