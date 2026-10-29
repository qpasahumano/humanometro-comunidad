import { supabase } from "./supabase.js";
import { obtenerUsuarioActual, obtenerPerfilActual } from "./auth.js";

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

  let publicacionesLocales = [];
  let publicacionesRemotas = [];
  let cargandoPublicaciones = false;

  function crearId() {
    return typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function obtenerPublicacionesLocales() {
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

  function traducirCondicion(condicion) {
    const opciones = {
      nuevo: "Nuevo",
      "usado-buen-estado": "Usado en buen estado",
      "usado-con-detalles": "Usado con detalles informados"
    };

    return opciones[condicion] || condicion || "";
  }

  function convertirRemota(publicacion) {
    const descripcion = String(publicacion.descripcion || "");
    const prefijoCondicion = "[Condición informada: ";
    let detalle = descripcion;
    let condicion = "";

    // La condición se identifica en la descripción sin depender
    // de que el campo "modalidad" tenga ese significado.
    const inicioCondicion = descripcion.lastIndexOf(prefijoCondicion);

    if (inicioCondicion >= 0 && descripcion.endsWith("]")) {
      condicion = descripcion
        .slice(
          inicioCondicion + prefijoCondicion.length,
          -1
        )
        .trim();

      detalle = descripcion
        .slice(0, inicioCondicion)
        .trim()
        .replace(/\n+$/, "");
    }

    return {
      id: publicacion.id,
      perfil_id: publicacion.perfil_id,
      tipo: publicacion.tipo,
      categoria: publicacion.categoria,
      otraCategoria: "",
      titulo: publicacion.titulo,
      detalle,
      condicion,
      modalidad: publicacion.modalidad || "",
      modalidadIntercambio: publicacion.modalidad_intercambio || "",
      queNecesitaACambio: publicacion.que_necesita_a_cambio || "",
      barrio: publicacion.zona_aproximada || "",
      fotos: Array.isArray(publicacion.fotos) ? publicacion.fotos : [],
      estado: publicacion.estado,
      fecha: publicacion.creado_en,
      origen: "supabase"
    };
  }

  function obtenerTodasLasPublicaciones() {
    const combinadas = new Map();

    publicacionesLocales.forEach((publicacion) => {
      combinadas.set(String(publicacion.id), {
        ...publicacion,
        origen: publicacion.origen || "local"
      });
    });

    publicacionesRemotas.forEach((publicacion) => {
      combinadas.set(String(publicacion.id), publicacion);
    });

    return Array.from(combinadas.values());
  }

  function mostrarPublicaciones() {
    if (!lista) return;

    lista.replaceChildren();

    const termino = normalizar(busqueda?.value);
    const tipoSeleccionado = filtroTipo?.value || "todas";

    const publicaciones = obtenerTodasLasPublicaciones().filter((publicacion) => {
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
        publicacion.modalidad,
        publicacion.modalidadIntercambio,
        publicacion.queNecesitaACambio,
        publicacion.condicion,
        tipo
      ].join(" "));

      return !termino || contenido.includes(termino);
    });

    if (!publicaciones.length) {
      const mensaje = document.createElement("p");

      mensaje.textContent = termino || tipoSeleccionado !== "todas"
        ? "No hay publicaciones que coincidan con esa búsqueda."
        : "Todavía no hay publicaciones disponibles en La Góndola.";

      lista.appendChild(mensaje);
      return;
    }

    publicaciones
      .slice()
      .sort((a, b) => {
        return new Date(b.fecha || 0) - new Date(a.fecha || 0);
      })
      .forEach((publicacion) => {
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

        if (publicacion.modalidadIntercambio) {
          const modalidad = document.createElement("p");

          modalidad.textContent =
            `Modalidad de intercambio: ${publicacion.modalidadIntercambio}`;

          tarjeta.appendChild(modalidad);
        }

        if (publicacion.queNecesitaACambio) {
          const cambio = document.createElement("p");

          cambio.textContent =
            `Qué necesita a cambio: ${publicacion.queNecesitaACambio}`;

          tarjeta.appendChild(cambio);
        }

        if (publicacion.barrio) {
          const barrio = document.createElement("p");
          barrio.textContent = `Zona aproximada: ${publicacion.barrio}`;
          tarjeta.appendChild(barrio);
        }

        const fecha = document.createElement("small");
        const fechaValida = publicacion.fecha
          ? new Date(publicacion.fecha)
          : null;

        fecha.textContent =
          `Fecha: ${
            fechaValida && !Number.isNaN(fechaValida.getTime())
              ? fechaValida.toLocaleString("es-AR")
              : "No informada"
          }`;

        const alcance = document.createElement("small");
        alcance.style.display = "block";

        alcance.textContent = publicacion.origen === "supabase"
          ? "Publicación compartida en la comunidad."
          : "Publicación guardada en este dispositivo; todavía no se compartió.";

        tarjeta.append(fecha, alcance);
        lista.appendChild(tarjeta);
      });
  }

  function actualizarCampoOtraCategoria() {
    if (!categoria || !contenedorOtra || !otraCategoria) return;

    const mostrar = categoria.value === "otros";

    contenedorOtra.hidden = !mostrar;
    otraCategoria.required = mostrar;

    if (!mostrar) otraCategoria.value = "";
  }

  async function cargarPublicacionesRemotas() {
    if (cargandoPublicaciones) return;

    cargandoPublicaciones = true;

    try {
      const { data: usuarioData, error: usuarioError } =
        await supabase.auth.getUser();

      if (usuarioError) throw usuarioError;

      if (!usuarioData.user) {
        publicacionesRemotas = [];
        mostrarPublicaciones();
        return;
      }

      const { data, error } = await supabase
        .from("publicaciones")
        .select(`
          id,
          perfil_id,
          tipo,
          categoria,
          titulo,
          descripcion,
          modalidad,
          modalidad_intercambio,
          que_necesita_a_cambio,
          zona_aproximada,
          fotos,
          estado,
          creado_en,
          actualizado_en
        `)
        .eq("estado", "activa")
        .order("creado_en", { ascending: false });

      if (error) throw error;

      publicacionesRemotas = (data || []).map(convertirRemota);
      mostrarPublicaciones();
    } catch (error) {
      console.error("Error al cargar publicaciones compartidas:", error);

      if (estado) {
        estado.textContent =
          "No se pudieron actualizar las publicaciones compartidas. Se conservan las publicaciones locales.";
      }

      mostrarPublicaciones();
    } finally {
      cargandoPublicaciones = false;
    }
  }

  async function guardarPublicacion(evento) {
    evento.preventDefault();

    const tipo = document.getElementById("tipo-publicacion")?.value;
    const titulo = document.getElementById("titulo-publicacion")?.value.trim();
    const detalle = document.getElementById("detalle-publicacion")?.value.trim();
    const condicion =
      document.getElementById("condicion-publicacion")?.value || "";

    const modalidadIntercambio =
      document.getElementById("modalidad-intercambio")?.value || "";

    const queNecesitaACambio =
      document.getElementById("que-necesita-a-cambio")?.value.trim() || "";

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

    const usuario = obtenerUsuarioActual();
    const perfil = obtenerPerfilActual();

    if (!usuario) {
      mostrarNotificacion("Iniciá sesión para publicar en La Góndola.");

      mostrarEstadoFormulario(
        "Iniciá sesión para publicar. Tus publicaciones locales anteriores se conservan."
      );

      return;
    }

    if (!perfil || !perfil.id) {
      mostrarNotificacion("Primero completá y guardá tu perfil comunitario.");

      mostrarEstadoFormulario(
        "Para publicar en la comunidad, primero tenés que guardar tu perfil."
      );

      return;
    }

    const zona = String(getItem("hm_barrio", "") || "").trim();
    const categoriaFinal = categoriaPersonalizada || categoriaSeleccionada;

    const detalleConCondicion = condicion
      ? `${detalle}\n\n[Condición informada: ${condicion}]`
      : detalle;

    const nuevaPublicacion = {
      id: crearId(),
      perfil_id: perfil.id,
      tipo,
      categoria: categoriaFinal,
      otraCategoria: categoriaSeleccionada === "otros"
        ? categoriaPersonalizada
        : "",
      titulo,
      detalle,
      condicion,
      modalidadIntercambio,
      queNecesitaACambio,
      barrio: zona,
      fotos: [],
      estado: "activa",
      fecha: new Date().toISOString(),
      origen: "local"
    };

    const registroRemoto = {
      perfil_id: perfil.id,
      tipo,
      categoria: categoriaFinal,
      titulo,
      descripcion: detalleConCondicion,
      modalidad: null,
      modalidad_intercambio: modalidadIntercambio || null,
      que_necesita_a_cambio: queNecesitaACambio || null,
      zona_aproximada: zona || perfil.zona_aproximada || null,
      fotos: [],
      estado: "activa",
      actualizado_en: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from("publicaciones")
      .insert(registroRemoto)
      .select(`
        id,
        perfil_id,
        tipo,
        categoria,
        titulo,
        descripcion,
        modalidad,
        modalidad_intercambio,
        que_necesita_a_cambio,
        zona_aproximada,
        fotos,
        estado,
        creado_en,
        actualizado_en
      `)
      .single();

    if (error) {
      console.error("Error al compartir publicación:", error);

      publicacionesLocales.push(nuevaPublicacion);

      if (!setItem(STORAGE_KEY, publicacionesLocales)) {
        mostrarNotificacion(
          "Supabase rechazó la publicación y tampoco se pudo guardar localmente."
        );
        return;
      }

      formulario.reset();
      actualizarCampoOtraCategoria();
      mostrarPublicaciones();

      mostrarEstadoFormulario(
        "La publicación quedó guardada en este dispositivo, pero no se compartió. Detalle: " +
        error.message
      );

      mostrarNotificacion(
        "Guardada localmente. No se pudo compartir en Supabase."
      );

      return;
    }

    if (data) {
      publicacionesRemotas.unshift(convertirRemota(data));
    }

    formulario.reset();
    actualizarCampoOtraCategoria();
    mostrarPublicaciones();

    mostrarEstadoFormulario(
      "¡Publicación compartida en La Góndola!"
    );

    mostrarNotificacion("¡Publicación compartida en la comunidad!");
  }

  function mostrarEstadoFormulario(mensaje) {
    if (estado) estado.textContent = mensaje;
  }

  categoria?.addEventListener("change", actualizarCampoOtraCategoria);
  busqueda?.addEventListener("input", mostrarPublicaciones);
  filtroTipo?.addEventListener("change", mostrarPublicaciones);

  limpiarFiltros?.addEventListener("click", () => {
    if (busqueda) busqueda.value = "";
    if (filtroTipo) filtroTipo.value = "todas";

    mostrarPublicaciones();
  });

  formulario?.addEventListener("submit", guardarPublicacion);

  publicacionesLocales = obtenerPublicacionesLocales();

  actualizarCampoOtraCategoria();
  mostrarPublicaciones();
  cargarPublicacionesRemotas();

  const cambioSesion = supabase.auth.onAuthStateChange(() => {
    cargarPublicacionesRemotas();
  });

  return {
    mostrarPublicaciones,
    cargarPublicacionesRemotas,

    destruir() {
      cambioSesion.data.subscription.unsubscribe();
    }
  };
}
