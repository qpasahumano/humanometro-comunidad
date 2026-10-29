import { supabase } from "./supabase.js";
import {
  obtenerUsuarioActual,
  obtenerPerfilActual
} from "./auth.js";

const STORAGE_KEY = "hm_publicaciones";

export function initCommunity({
  getItem,
  setItem,
  mostrarNotificacion
}) {
  const $ = (id) => document.getElementById(id);

  const formulario = $("form-publicacion");
  const lista = $("lista-publicaciones");
  const categoria = $("categoria-publicacion");
  const otraCategoria = $("otra-categoria");
  const contenedorOtra = $("contenedor-otra-categoria");
  const busqueda = $("buscar-publicaciones");
  const filtroTipo = $("filtro-tipo");
  const limpiarFiltros = $("btn-limpiar-filtros");
  const estado = $("estado-publicacion");
  const campoModalidad = $("modalidad-intercambio");
  const campoCambio = $("que-necesita-a-cambio");

  let publicacionesLocales = [];
  let publicacionesRemotas = [];
  let cargandoPublicaciones = false;
  let inicializado = false;

  function crearId() {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizar(texto) {
    return String(texto || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function obtenerPublicacionesLocales() {
    const publicaciones = getItem(STORAGE_KEY, []);
    return Array.isArray(publicaciones) ? publicaciones : [];
  }

  function guardarPublicacionesLocales() {
    return setItem(STORAGE_KEY, publicacionesLocales);
  }

  function traducirCondicion(condicion) {
    const opciones = {
      nuevo: "Nuevo",
      "usado-buen-estado": "Usado en buen estado",
      "usado-con-detalles": "Usado con detalles informados"
    };

    return opciones[condicion] || condicion || "";
  }

  function traducirModalidad(modalidad) {
    const opciones = {
      trueque: "Trueque",
      donacion: "Donación",
      venta: "Venta",
      colaboracion: "Colaboración",
      flexible: "A convenir"
    };

    return opciones[modalidad] || modalidad || "";
  }

  function convertirRemota(publicacion) {
    return {
      id: publicacion.id,
      perfil_id: publicacion.perfil_id,
      tipo: publicacion.tipo,
      categoria: publicacion.categoria,
      otraCategoria: "",
      titulo: publicacion.titulo,
      detalle: publicacion.descripcion || "",
      condicion: publicacion.condicion_publicacion || "",
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

    const publicaciones = obtenerTodasLasPublicaciones().filter(
      (publicacion) => {
        const tipo = publicacion.tipo || "necesidad";

        if (
          tipoSeleccionado !== "todas" &&
          tipo !== tipoSeleccionado
        ) {
          return false;
        }

        const contenido = normalizar([
          publicacion.titulo,
          publicacion.detalle,
          publicacion.categoria,
          publicacion.otraCategoria,
          publicacion.barrio,
          publicacion.condicion,
          publicacion.modalidadIntercambio,
          publicacion.queNecesitaACambio,
          tipo
        ].join(" "));

        return !termino || contenido.includes(termino);
      }
    );

    if (!publicaciones.length) {
      const mensaje = document.createElement("p");
      mensaje.textContent =
        termino || tipoSeleccionado !== "todas"
          ? "No hay publicaciones que coincidan con esa búsqueda."
          : "Todavía no hay publicaciones disponibles en La Góndola.";

      lista.appendChild(mensaje);
      return;
    }

    publicaciones
      .slice()
      .sort(
        (a, b) =>
          new Date(b.fecha || 0).getTime() -
          new Date(a.fecha || 0).getTime()
      )
      .forEach((publicacion) => {
        const tarjeta = document.createElement("article");
        tarjeta.className = "tarjeta-publicacion";

        const titulo = document.createElement("h3");
        titulo.textContent =
          publicacion.titulo || "Publicación sin título";

        const tipo = document.createElement("p");
        tipo.textContent =
          publicacion.tipo === "oferta" ? "OFREZCO" : "BUSCO";

        const categoriaElemento = document.createElement("p");
        categoriaElemento.textContent =
          `Categoría: ${
            publicacion.otraCategoria ||
            publicacion.categoria ||
            "Sin categoría"
          }`;

        const detalle = document.createElement("p");
        detalle.textContent = publicacion.detalle || "";

        tarjeta.append(titulo, tipo, categoriaElemento, detalle);

        if (publicacion.condicion) {
          const condicion = document.createElement("p");
          condicion.textContent =
            `Condición: ${traducirCondicion(publicacion.condicion)}`;
          tarjeta.appendChild(condicion);
        }

        if (publicacion.modalidadIntercambio) {
          const modalidad = document.createElement("p");
          modalidad.textContent =
            `Modalidad: ${traducirModalidad(
              publicacion.modalidadIntercambio
            )}`;
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
          barrio.textContent =
            `Zona aproximada: ${publicacion.barrio}`;
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
        alcance.textContent =
          publicacion.origen === "supabase"
            ? "Publicación compartida en la comunidad."
            : "Publicación guardada en este dispositivo; todavía no se compartió.";

        tarjeta.append(fecha, alcance);
        lista.appendChild(tarjeta);
      });
  }

  function mostrarEstadoFormulario(mensaje) {
    if (estado) estado.textContent = mensaje;
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
      const { data, error } = await supabase
        .from("publicaciones")
        .select(
          "id, perfil_id, tipo, categoria, titulo, descripcion, modalidad, modalidad_intercambio, que_necesita_a_cambio, zona_aproximada, fotos, estado, creado_en, actualizado_en"
        )
        .eq("estado", "activa")
        .order("creado_en", { ascending: false });

      if (error) throw error;

      publicacionesRemotas = (data || []).map((registro) => {
        const publicacion = convertirRemota(registro);

        /*
         * La columna "modalidad" se conserva como un campo
         * distinto de "modalidad_intercambio".
         * No se usa para guardar la condición del producto.
         */
        if (registro.modalidad) {
          publicacion.modalidadIntercambio =
            registro.modalidad_intercambio || registro.modalidad;
        }

        return publicacion;
      });

      mostrarPublicaciones();
    } catch (error) {
      console.error(
        "Error al cargar publicaciones compartidas:",
        error
      );

      mostrarEstadoFormulario(
        "No se pudieron actualizar las publicaciones compartidas. " +
        "Se conservan las publicaciones locales."
      );

      mostrarPublicaciones();
    } finally {
      cargandoPublicaciones = false;
    }
  }

  async function guardarPublicacion(evento) {
    evento.preventDefault();

    const tipo = $("tipo-publicacion")?.value || "";
    const titulo = $("titulo-publicacion")?.value.trim() || "";
    const detalle = $("detalle-publicacion")?.value.trim() || "";
    const condicion = $("condicion-publicacion")?.value || "";
    const modalidadIntercambio = campoModalidad?.value || "";
    const queNecesitaACambio = campoCambio?.value.trim() || "";

    if (!tipo || !categoria || !titulo || !detalle) {
      mostrarNotificacion("Completá los campos obligatorios.");
      return;
    }

    const categoriaSeleccionada = categoria.value;
    const categoriaPersonalizada = otraCategoria?.value.trim() || "";

    if (
      categoriaSeleccionada === "otros" &&
      !categoriaPersonalizada
    ) {
      mostrarNotificacion("Especificá la categoría en el campo Otros.");
      otraCategoria?.focus();
      return;
    }

    const usuario = obtenerUsuarioActual();
    const perfil = obtenerPerfilActual();

    if (!usuario) {
      mostrarNotificacion(
        "Iniciá sesión para compartir una publicación con la comunidad."
      );
      mostrarEstadoFormulario(
        "Iniciá sesión y guardá tu perfil para compartir publicaciones. " +
        "Las publicaciones locales anteriores se conservan."
      );
      return;
    }

    if (!perfil?.id) {
      mostrarNotificacion(
        "Primero completá y guardá tu perfil comunitario."
      );
      mostrarEstadoFormulario(
        "Para compartir publicaciones, primero tenés que guardar tu perfil."
      );
      return;
    }

    const zona = String(getItem("hm_barrio", "") || "").trim();

    const categoriaFinal =
      categoriaPersonalizada || categoriaSeleccionada;

    const nuevaPublicacion = {
      id: crearId(),
      tipo,
      categoria: categoriaFinal,
      otraCategoria:
        categoriaSeleccionada === "otros"
          ? categoriaPersonalizada
          : "",
      titulo,
      detalle,
      condicion,
      modalidadIntercambio,
      queNecesitaACambio,
      barrio: zona,
      fecha: new Date().toISOString(),
      origen: "local"
    };

    const registroRemoto = {
      perfil_id: usuario.id,
      tipo,
      categoria: categoriaFinal,
      titulo,
      descripcion: detalle,
      modalidad: modalidadIntercambio || null,
      modalidad_intercambio: modalidadIntercambio || null,
      que_necesita_a_cambio: queNecesitaACambio || null,
      zona_aproximada:
        zona || perfil.zona_aproximada || perfil.localidad || null,
      fotos: [],
      estado: "activa",
      actualizado_en: new Date().toISOString()
    };

    const botonEnviar = formulario?.querySelector(
      'button[type="submit"]'
    );

    if (botonEnviar) {
      botonEnviar.disabled = true;
      botonEnviar.textContent = "PUBLICANDO…";
    }

    try {
      const { data, error } = await supabase
        .from("publicaciones")
        .insert(registroRemoto)
        .select(
          "id, perfil_id, tipo, categoria, titulo, descripcion, modalidad, modalidad_intercambio, que_necesita_a_cambio, zona_aproximada, fotos, estado, creado_en, actualizado_en"
        )
        .single();

      if (error) throw error;

      if (data) {
        publicacionesRemotas.unshift(convertirRemota(data));
      }

      formulario.reset();
      actualizarCampoOtraCategoria();
      mostrarPublicaciones();

      mostrarEstadoFormulario(
        "¡Publicación compartida en La Góndola!"
      );
      mostrarNotificacion(
        "¡Publicación compartida en la comunidad!"
      );
    } catch (error) {
      console.error("Error al compartir publicación:", error);

      /*
       * Si falla Supabase, se conserva una copia local.
       * Se indica expresamente que no fue compartida.
       */
      publicacionesLocales.push(nuevaPublicacion);

      if (!guardarPublicacionesLocales()) {
        publicacionesLocales.pop();

        mostrarNotificacion(
          "No se pudo compartir ni guardar la publicación en este dispositivo."
        );
        mostrarEstadoFormulario(
          "No se pudo guardar la publicación. Revisá el almacenamiento e intentá nuevamente."
        );
        return;
      }

      formulario.reset();
      actualizarCampoOtraCategoria();
      mostrarPublicaciones();

      mostrarEstadoFormulario(
        "La publicación quedó guardada en este dispositivo, " +
        "pero no se compartió. Detalle: " +
        (error?.message || "error de conexión o permisos")
      );

      mostrarNotificacion(
        "Guardada localmente. No se pudo compartir en Supabase."
      );
    } finally {
      if (botonEnviar) {
        botonEnviar.disabled = false;
        botonEnviar.textContent = "GUARDAR PUBLICACIÓN";
      }
    }
  }

  function configurarEventos() {
    categoria?.addEventListener(
      "change",
      actualizarCampoOtraCategoria
    );

    formulario?.addEventListener("submit", guardarPublicacion);

    busqueda?.addEventListener("input", mostrarPublicaciones);
    filtroTipo?.addEventListener("change", mostrarPublicaciones);

    limpiarFiltros?.addEventListener("click", () => {
      if (busqueda) busqueda.value = "";
      if (filtroTipo) filtroTipo.value = "todas";
      mostrarPublicaciones();
    });
  }

  if (!inicializado) {
    inicializado = true;
    publicacionesLocales = obtenerPublicacionesLocales();

    configurarEventos();
    actualizarCampoOtraCategoria();
    mostrarPublicaciones();

    void cargarPublicacionesRemotas();

    supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => {
        void cargarPublicacionesRemotas();
      }, 0);
    });
  }
}
