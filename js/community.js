import { supabase } from "./supabase.js";
import {
  obtenerUsuarioActual,
  obtenerPerfilActual
} from "./auth.js";

const STORAGE_KEY = "hm_publicaciones";
const MATRIX_CONFIG = {
  DB_NAME: 'HumanometroComunidadDB',
  DB_VERSION: 1,
  STORE_PUBLICACIONES: 'publicaciones_cache'
};

export function initCommunity({
  getItem,
  setItem,
  mostrarNotificacion
}) {
  const form = document.getElementById("form-publicacion");
  const lista = document.getElementById("lista-publicaciones");
  const tipoInput = document.getElementById("tipo-publicacion");
  const categoriaInput = document.getElementById("categoria-publicacion");
  const otraCategoriaInput = document.getElementById("otra-categoria");
  const contenedorOtraCategoria = document.getElementById(
    "contenedor-otra-categoria"
  );
  const tituloInput = document.getElementById("titulo-publicacion");
  const detalleInput = document.getElementById("detalle-publicacion");
  const condicionInput = document.getElementById("condicion-publicacion");
  const modalidadInput = document.getElementById("modalidad-intercambio");
  const necesitaInput = document.getElementById(
    "que-necesita-a-cambio"
  );
  const busquedaInput = document.getElementById("buscar-publicaciones");
  const filtroTipoInput = document.getElementById("filtro-tipo");
  const limpiarFiltrosBtn = document.getElementById(
    "btn-limpiar-filtros"
  );
  const buscarPublicacionesBtn = document.getElementById(
    "btn-buscar-publicaciones"
  );
  const estadoPublicacion = document.getElementById("estado-publicacion");

  let publicaciones = [];
  let cargando = false;
  let destruido = false;
  let suscripcionAuth = null;
  let ultimaCarga = 0;
  let dbMatrixInstance = null;

  // --- NÚCLEO MATRIX: INDEXEDDB LOCAL ---
  function abrirMatrixDB() {
    return new Promise((resolve, reject) => {
      if (dbMatrixInstance) return resolve(dbMatrixInstance);

      const request = indexedDB.open(MATRIX_CONFIG.DB_NAME, MATRIX_CONFIG.DB_VERSION);
      request.onerror = (e) => reject(e.target.error);
      request.onsuccess = (e) => {
        dbMatrixInstance = e.target.result;
        resolve(dbMatrixInstance);
      };
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(MATRIX_CONFIG.STORE_PUBLICACIONES)) {
          db.createObjectStore(MATRIX_CONFIG.STORE_PUBLICACIONES, { keyPath: 'id' });
        }
      };
    });
  }

  async function guardarMatrixCache(pubs) {
    try {
      const db = await abrirMatrixDB();
      const tx = db.transaction([MATRIX_CONFIG.STORE_PUBLICACIONES], 'readwrite');
      const store = tx.objectStore(MATRIX_CONFIG.STORE_PUBLICACIONES);
      pubs.forEach(pub => store.put(pub));
    } catch (err) {
      console.warn("Matrix: No se pudo guardar caché en IndexedDB", err);
    }
  }

  async function obtenerMatrixCache() {
    try {
      const db = await abrirMatrixDB();
      return new Promise((resolve) => {
        const tx = db.transaction([MATRIX_CONFIG.STORE_PUBLICACIONES], 'readonly');
        const store = tx.objectStore(MATRIX_CONFIG.STORE_PUBLICACIONES);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  const notificar = (mensaje, tipo = "info") => {
    if (typeof mostrarNotificacion === "function") {
      mostrarNotificacion(mensaje, tipo);
    } else {
      console.info(mensaje);
    }
  };

  function obtenerLocales() {
    try {
      const resultado = getItem(STORAGE_KEY, []);
      return Array.isArray(resultado) ? resultado : [];
    } catch (error) {
      console.error("Error leyendo publicaciones locales:", error);
      return [];
    }
  }

  function guardarLocales(datos) {
    try {
      const resultado = setItem(STORAGE_KEY, datos);
      return resultado !== false;
    } catch (error) {
      console.error("Error guardando publicaciones locales:", error);
      return false;
    }
  }

  function normalizarTexto(valor) {
    return String(valor ?? "").trim();
  }

  function escaparHTML(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, caracter => {
      const entidades = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      };

      return entidades[caracter];
    });
  }

  function fechaLegible(fecha) {
    if (!fecha) return "Fecha no disponible";

    const fechaObjeto = new Date(fecha);

    if (Number.isNaN(fechaObjeto.getTime())) {
      return "Fecha no disponible";
    }

    return fechaObjeto.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  // --- LÓGICA DE ZONA INTELIGENTE (BARRIO ESTRICTO VS EXPLORACIÓN) ---
  function obtenerZona() {
    try {
      const modo = getItem("hm_modo_visualizacion", "barrio");
      if (modo === "explorar") {
        return normalizarTexto(getItem("hm_zona_explorar", ""));
      }
      return normalizarTexto(getItem("hm_barrio", ""));
    } catch {
      return "";
    }
  }

  function obtenerCategoria() {
    const categoriaSeleccionada = normalizarTexto(
      categoriaInput?.value
    );

    if (
      categoriaSeleccionada.toLowerCase() === "otra" ||
      categoriaSeleccionada.toLowerCase() === "otro"
    ) {
      return normalizarTexto(otraCategoriaInput?.value);
    }

    return categoriaSeleccionada;
  }

  function actualizarCampoOtraCategoria() {
    if (!categoriaInput || !contenedorOtraCategoria) return;

    const valor = normalizarTexto(categoriaInput.value).toLowerCase();
    const mostrar = valor === "otra" || valor === "otro";

    contenedorOtraCategoria.hidden = !mostrar;

    if (otraCategoriaInput) {
      otraCategoriaInput.required = mostrar;
    }
  }

  function obtenerCondicion(descripcion) {
    const texto = normalizarTexto(descripcion);

    const coincidencia = texto.match(
      /(?:^|\n)\[Condición informada:\s*([^\]]*)\]\s*$/
    );

    if (!coincidencia) {
      return {
        descripcion: texto,
        condicion: ""
      };
    }

    return {
      descripcion: texto
        .replace(coincidencia[0], "")
        .trim(),
      condicion: normalizarTexto(coincidencia[1])
    };
  }

  function convertirRegistroRemoto(registro) {
    const datosDescripcion = obtenerCondicion(
      registro.descripcion
    );

    return {
      id: String(registro.id),
      perfil_id: registro.perfil_id ?? null,
      tipo: registro.tipo ?? "",
      categoria: registro.categoria ?? "",
      titulo: registro.titulo ?? "",
      descripcion: datosDescripcion.descripcion,
      condicion: datosDescripcion.condicion,
      modalidad: registro.modalidad ?? null,
      modalidad_intercambio:
        registro.modalidad_intercambio ?? "",
      que_necesita_a_cambio:
        registro.que_necesita_a_cambio ?? "",
      zona_aproximada: registro.zona_aproximada ?? "",
      fotos: Array.isArray(registro.fotos)
        ? registro.fotos
        : [],
      estado: registro.estado ?? "activa",
      creado_en: registro.creado_en ?? null,
      actualizado_en: registro.actualizado_en ?? null,
      origen: "remoto"
    };
  }

  function combinarPublicaciones(locales, remotas) {
    const mapa = new Map();

    for (const publicacion of remotas) {
      mapa.set(String(publicacion.id), {
        ...publicacion,
        origen: "remoto"
      });
    }

    for (const publicacion of locales) {
      const id = String(publicacion.id);

      if (!mapa.has(id)) {
        mapa.set(id, {
          ...publicacion,
          origen: publicacion.origen ?? "local"
        });
      }
    }

    return [...mapa.values()].sort((a, b) => {
      const fechaA = new Date(
        a.creado_en ?? 0
      ).getTime();

      const fechaB = new Date(
        b.creado_en ?? 0
      ).getTime();

      return fechaB - fechaA;
    });
  }

  async function cargarPublicacionesRemotas() {
    if (destruido || cargando) return;

    cargando = true;
    const identificadorCarga = ++ultimaCarga;

    const zonaActualFiltro = obtenerZona();

    try {
      if (navigator.onLine) {
        let query = supabase
          .from("publicaciones")
          .select(
            [
              "id",
              "perfil_id",
              "tipo",
              "categoria",
              "titulo",
              "descripcion",
              "modalidad",
              "modalidad_intercambio",
              "que_necesita_a_cambio",
              "zona_aproximada",
              "fotos",
              "estado",
              "creado_en",
              "actualizado_en"
            ].join(",")
          )
          .eq("estado", "activa");

        // Si hay una zona definida (ya sea tu barrio o Esquel), filtramos por ella en Supabase
        if (zonaActualFiltro) {
          query = query.ilike("zona_aproximada", `%${zonaActualFiltro}%`);
        }

        const { data, error } = await query.order("creado_en", {
          ascending: false
        });

        if (destruido || identificadorCarga !== ultimaCarga) {
          return;
        }

        if (!error && data) {
          const remotas = data.map(convertirRegistroRemoto);
          await guardarMatrixCache(remotas);
          
          publicaciones = combinarPublicaciones(
            obtenerLocales(),
            remotas
          );
          renderizarPublicaciones();
          return;
        }
      }
    } catch (error) {
      console.warn("Red intermitente, cargando desde red de relevo local Matrix...", error);
    } finally {
      cargando = false;
    }

    // Fallback Matrix Cache local
    const cacheLocal = await obtenerMatrixCache();
    let remotasCache = cacheLocal.map(convertirRegistroRemoto);

    if (zonaActualFiltro) {
      remotasCache = remotasCache.filter(p => 
        p.zona_aproximada.toLowerCase().includes(zonaActualFiltro.toLowerCase())
      );
    }
    
    publicaciones = combinarPublicaciones(
      obtenerLocales(),
      remotasCache
    );
    renderizarPublicaciones();
  }

  function crearTarjeta(publicacion) {
    const tarjeta = document.createElement("article");

    tarjeta.className = "tarjeta-publicacion";

    const tipo = escaparHTML(publicacion.tipo);
    const categoria = escaparHTML(publicacion.categoria);
    const titulo = escaparHTML(publicacion.titulo);
    const descripcion = escaparHTML(publicacion.descripcion);
    const condicion = escaparHTML(publicacion.condicion);
    const zona = escaparHTML(publicacion.zona_aproximada);
    const modalidad = escaparHTML(
      publicacion.modalidad_intercambio
    );
    const necesita = escaparHTML(
      publicacion.que_necesita_a_cambio
    );
    const fecha = escaparHTML(
      fechaLegible(publicacion.creado_en)
    );

    const esIntercambio =
      String(publicacion.tipo).toLowerCase().includes("intercambio");

    const nombreAutor = escaparHTML(publicacion.perfil_nombre || "Vecino");
    const autorId = publicacion.perfil_id || "";

    tarjeta.innerHTML = `
      <div class="publicacion-cabecera">
        <span class="publicacion-tipo">${tipo}</span>
        <span class="publicacion-categoria">${categoria}</span>
      </div>

      <h3 class="publicacion-titulo">${titulo}</h3>

      <p class="publicacion-descripcion">${descripcion}</p>

      ${
        condicion
          ? `<p class="publicacion-condicion">
               <strong>Condición:</strong> ${condicion}
             </p>`
          : ""
      }

      ${
        esIntercambio && modalidad
          ? `<p class="publicacion-modalidad">
               <strong>Modalidad:</strong> ${modalidad}
             </p>`
          : ""
      }

      ${
        esIntercambio && necesita
          ? `<p class="publicacion-necesita">
               <strong>Busca a cambio:</strong> ${necesita}
             </p>`
          : ""
      }

      ${
        zona
          ? `<p class="publicacion-zona">
               <strong>Zona:</strong> ${zona}
             </p>`
          : ""
      }

      <small class="publicacion-fecha">${fecha}</small>

      <button 
        class="boton-secundario btn-contactar-trueque" 
        data-id="${autorId}" 
        data-nombre="${nombreAutor}"
        style="margin-top: 10px; width: 100%; font-size: 0.85rem; cursor: pointer;"
      >
        Contactar por este trueque
      </button>
    `;

    return tarjeta;
  }

  // Event listener global para capturar clics en el botón de contacto directo
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("btn-contactar-trueque")) {
      const destinatarioId = e.target.getAttribute("data-id");
      const destinatarioNombre = e.target.getAttribute("data-nombre");

      if (window.abrirChatConVecino) {
        window.abrirChatConVecino(destinatarioNombre, destinatarioId);
      }
    }
  });

  function renderizarPublicaciones() {
    if (!lista) return;

    const textoBusqueda = normalizarTexto(
      busquedaInput?.value
    ).toLocaleLowerCase("es-AR");

    const tipoFiltro = normalizarTexto(
      filtroTipoInput?.value
    ).toLocaleLowerCase("es-AR");

    const filtradas = publicaciones.filter(publicacion => {
      const coincideTipo =
        !tipoFiltro ||
        tipoFiltro === "todos" ||
        tipoFiltro === "todas" ||
        String(publicacion.tipo)
          .toLocaleLowerCase("es-AR") === tipoFiltro;

      const contenido = [
        publicacion.titulo,
        publicacion.descripcion,
        publicacion.categoria,
        publicacion.tipo,
        publicacion.zona_aproximada,
        publicacion.modalidad_intercambio,
        publicacion.que_necesita_a_cambio
      ]
        .join(" ")
        .toLocaleLowerCase("es-AR");

      return coincideTipo && contenido.includes(textoBusqueda);
    });

    lista.replaceChildren();

    if (filtradas.length === 0) {
      const mensaje = document.createElement("p");

      mensaje.className = "sin-publicaciones";
      mensaje.textContent =
        "Todavía no hay publicaciones que coincidan con tu búsqueda.";

      lista.appendChild(mensaje);
      return;
    }

    const fragmento = document.createDocumentFragment();

    for (const publicacion of filtradas) {
      fragmento.appendChild(
        crearTarjeta(publicacion)
      );
    }

    lista.appendChild(fragmento);
  }

  function validarFormulario() {
    const tipo = normalizarTexto(tipoInput?.value);
    const categoria = obtenerCategoria();
    const titulo = normalizarTexto(tituloInput?.value);
    const descripcion = normalizarTexto(detalleInput?.value);

    if (!tipo || !categoria || !titulo || !descripcion) {
      notificar(
        "Completá el tipo, la categoría, el título y la descripción.",
        "error"
      );

      return null;
    }

    const esIntercambio = tipo
      .toLocaleLowerCase("es-AR")
      .includes("intercambio");

    const modalidad = normalizarTexto(
      modalidadInput?.value
    );

    const necesita = normalizarTexto(
      necesitaInput?.value
    );

    if (esIntercambio && !modalidad) {
      notificar(
        "Indicá la modalidad del intercambio.",
        "error"
      );

      modalidadInput?.focus();
      return null;
    }

    if (esIntercambio && !necesita) {
      notificar(
        "Indicá qué necesitás a cambio.",
        "error"
      );

      necesitaInput?.focus();
      return null;
    }

    return {
      tipo,
      categoria,
      titulo,
      descripcion,
      condicion: normalizarTexto(condicionInput?.value),
      modalidad_intercambio: esIntercambio
        ? modalidad
        : "",
      que_necesita_a_cambio: esIntercambio
        ? necesita
        : "",
      zona_aproximada: normalizarTexto(getItem("hm_barrio", ""))
    };
  }

  function generarIdLocal() {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return `local-${crypto.randomUUID()}`;
    }

    return `local-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;
  }

  async function publicar(evento) {
    evento.preventDefault();

    const datos = validarFormulario();

    if (!datos) return;

    const usuario = await obtenerUsuarioActual();
    const perfil = await obtenerPerfilActual();

    if (!usuario || !perfil) {
      notificar(
        "Iniciá sesión y completá tu perfil para publicar en la comunidad.",
        "error"
      );

      return;
    }

    const ahora = new Date().toISOString();

    let descripcionRemota = datos.descripcion;

    if (datos.condicion) {
      descripcionRemota +=
        `\n[Condición informada: ${datos.condicion}]`;
    }

    const registro = {
      perfil_id: perfil.id,
      tipo: datos.tipo,
      categoria: datos.categoria,
      titulo: datos.titulo,
      descripcion: descripcionRemota,
      modalidad: null,
      modalidad_intercambio:
        datos.modalidad_intercambio,
      que_necesita_a_cambio:
        datos.que_necesita_a_cambio,
      zona_aproximada: datos.zona_aproximada,
      fotos: [],
      estado: "activa",
      actualizado_en: ahora
    };

    if (estadoPublicacion) {
      estadoPublicacion.textContent =
        "Publicando...";
    }

    try {
      const { data, error } = await supabase
        .from("publicaciones")
        .insert(registro)
        .select(
          [
            "id",
            "perfil_id",
            "tipo",
            "categoria",
            "titulo",
            "descripcion",
            "modalidad",
            "modalidad_intercambio",
            "que_necesita_a_cambio",
            "zona_aproximada",
            "fotos",
            "estado",
            "creado_en",
            "actualizado_en"
          ].join(",")
        )
        .single();

      if (error) {
        console.error(
          "Error publicando en Supabase:",
          error
        );

        const publicacionLocal = {
          ...registro,
          ...datos,
          id: generarIdLocal(),
          creado_en: ahora,
          origen: "local"
        };

        const locales = obtenerLocales();
        locales.unshift(publicacionLocal);

        if (!guardarLocales(locales)) {
          notificar(
            "No se pudo publicar ni guardar localmente. Revisá la conexión e intentá nuevamente.",
            "error"
          );

          if (estadoPublicacion) {
            estadoPublicacion.textContent = "";
          }

          return;
        }

        publicaciones = combinarPublicaciones(
          locales,
          publicaciones.filter(p => p.origen === "remoto")
        );

        renderizarPublicaciones();

        notificar(
          "No se pudo publicar en la comunidad compartida. La publicación quedó guardada en este dispositivo.",
          "warning"
        );

        form.reset();
        actualizarCampoOtraCategoria();

        if (estadoPublicacion) {
          estadoPublicacion.textContent =
            "Guardada localmente";
        }

        return;
      }

      const publicacionRemota =
        convertirRegistroRemoto(data);

      publicaciones = combinarPublicaciones(
        obtenerLocales(),
        [
          publicacionRemota,
          ...publicaciones.filter(
            p => p.origen === "remoto"
          )
        ]
      );

      renderizarPublicaciones();
      form.reset();
      actualizarCampoOtraCategoria();

      notificar(
        "¡Publicación compartida con la comunidad!",
        "success"
      );

      if (estadoPublicacion) {
        estadoPublicacion.textContent =
          "Publicación compartida";
      }
    } catch (error) {
      console.error(
        "Error inesperado al publicar:",
        error
      );

      notificar(
        "Ocurrió un error al publicar. Intentá nuevamente.",
        "error"
      );

      if (estadoPublicacion) {
        estadoPublicacion.textContent =
          "No se pudo publicar";
      }
    }
  }

  function limpiarFiltros() {
    if (busquedaInput) {
      busquedaInput.value = "";
    }

    if (filtroTipoInput) {
      filtroTipoInput.value = "todas";
    }

    renderizarPublicaciones();
  }

  const manejarCategoria = () => {
    actualizarCampoOtraCategoria();
  };

  const manejarBusqueda = () => {
    renderizarPublicaciones();
  };

  const manejarSubmit = evento => {
    publicar(evento);
  };

  categoriaInput?.addEventListener(
    "change",
    manejarCategoria
  );

  buscarPublicacionesBtn?.addEventListener(
    "click",
    manejarBusqueda
  );

  busquedaInput?.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") {
      evento.preventDefault();
      manejarBusqueda();
    }
  });

  filtroTipoInput?.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") {
      evento.preventDefault();
      manejarBusqueda();
    }
  });

  limpiarFiltrosBtn?.addEventListener(
    "click",
    limpiarFiltros
  );

  form?.addEventListener(
    "submit",
    manejarSubmit
  );

  // Escuchar cuando el usuario cambia el selector de zona en app.js para refrescar el feed al instante
  window.addEventListener("cambioZonaComunidad", () => {
    cargarPublicacionesRemotas();
  });

  actualizarCampoOtraCategoria();

  window.addEventListener('online', () => {
    cargarPublicacionesRemotas();
  });

  abrirMatrixDB().then(() => {
    obtenerMatrixCache().then(cacheLocal => {
      const remotasCache = cacheLocal.map(convertirRegistroRemoto);
      publicaciones = combinarPublicaciones(obtenerLocales(), remotasCache);
      renderizarPublicaciones();
      cargarPublicacionesRemotas();
    });
  }).catch(() => {
    publicaciones = combinarPublicaciones(obtenerLocales(), []);
    renderizarPublicaciones();
    cargarPublicacionesRemotas();
  });

  try {
    const resultado = supabase.auth.onAuthStateChange(() => {
      cargarPublicacionesRemotas();
    });

    suscripcionAuth =
      resultado?.data?.subscription ?? null;
  } catch (error) {
    console.error(
      "No se pudo registrar el cambio de sesión:",
      error
    );
  }

  return {
    recargar: cargarPublicacionesRemotas,

    destruir() {
      destruido = true;
      ultimaCarga++;

      categoriaInput?.removeEventListener(
        "change",
        manejarCategoria
      );

      busquedaInput?.removeEventListener(
        "input",
        manejarBusqueda
      );

      filtroTipoInput?.removeEventListener(
        "change",
        manejarBusqueda
      );

      limpiarFiltrosBtn?.removeEventListener(
        "click",
        limpiarFiltros
      );

      form?.removeEventListener(
        "submit",
        manejarSubmit
      );

      suscripcionAuth?.unsubscribe();
    }
  };
}
