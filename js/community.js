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

// Umbral de vigencia temporal para la caché local (ej. 48 horas en milisegundos)
const UMBRAL_VIGENCIA_CACHE_MS = 48 * 60 * 60 * 1000;

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
  const filtroZonaGondola = document.getElementById("filtro-zona-gondola");
  const filtroTipoInput = document.getElementById("filtro-tipo");
  const filtroOfflineActivoInput = document.getElementById("filtro-offline-activo");
  const limpiarFiltrosBtn = document.getElementById(
    "btn-limpiar-filtros"
  );
  const buscarPublicacionesBtn = document.getElementById(
    "btn-buscar-publicaciones"
  );
  const actualizarRedBtn = document.getElementById("btn-actualizar-red");
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

  // --- LÓGICA DE ZONA INTELIGENTE ---
  function obtenerZona() {
    try {
      const zonaGondola = normalizarTexto(filtroZonaGondola?.value);
      if (zonaGondola) return zonaGondola;

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
      offline_activo: Boolean(registro.offline_activo ?? false),
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
    const palabraClave = normalizarTexto(busquedaInput?.value);

    // Feedback visual instantáneo en pantalla
    if (lista) {
      lista.innerHTML = "<p class='texto-ayuda'>Buscando publicaciones en la red...</p>";
    }

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
              "offline_activo",
              "fotos",
              "estado",
              "creado_en",
              "actualizado_en"
            ].join(",")
          )
          .eq("estado", "activa");

        // Filtro flexible por zona con ilike
        if (zonaActualFiltro) {
          query = query.ilike("zona_aproximada", `%${zonaActualFiltro}%`);
        }

        // Filtro flexible por palabra clave (título o descripción) con ilike
        if (palabraClave) {
          query = query.or(`titulo.ilike.%${palabraClave}%,descripcion.ilike.%${palabraClave}%`);
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
          cargando = false;
          return;
        } else if (error) {
          console.error("Error en consulta Supabase:", error);
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

    if (palabraClave) {
      const q = palabraClave.toLowerCase();
      remotasCache = remotasCache.filter(p => 
        p.titulo.toLowerCase().includes(q) || p.descripcion.toLowerCase().includes(q)
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
    const offlineActivo = Boolean(publicacion.offline_activo);

    let requiereRevalidar = false;
    if (publicacion.creado_en) {
      const tiempoCreacion = new Date(publicacion.creado_en).getTime();
      const tiempoActual = Date.now();
      if (!Number.isNaN(tiempoCreacion) && (tiempoActual - tiempoCreacion > UMBRAL_VIGENCIA_CACHE_MS)) {
        requiereRevalidar = true;
      }
    }

    tarjeta.innerHTML = `
      <div class="publicacion-cabecera">
        <span class="publicacion-tipo">${tipo}</span>
        <span class="publicacion-categoria">${categoria}</span>
      </div>

      ${
        requiereRevalidar
          ? `<div style="margin: 6px 0; background: #78350f; border: 1px solid #d97706; padding: 6px 10px; border-radius: 6px; font-size: 0.8rem; color: #fde68a; display: flex; align-items: center; gap: 6px;">
               <span>⚠️</span> <strong>En caché local - Requiere revalidar:</strong> Esta publicación supera las 48h sin sincronizar.
             </div>`
          : ""
      }

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

      ${
        offlineActivo
          ? `<div style="margin: 8px 0; background: #0f172a; border: 1px solid #38bdf8; padding: 6px 10px; border-radius: 6px; font-size: 0.85rem; color: #38bdf8; display: flex; align-items: center; gap: 6px;">
               <span>📡</span> <strong>Conectividad Offline Activa:</strong> Este vecino cuenta con apps alternativas (Bridgefy/Briar) para emergencias sin internet.
             </div>`
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

  let contactoPendiente = null;

  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("btn-contactar-trueque")) {
      const destinatarioId = e.target.getAttribute("data-id");
      const destinatarioNombre = e.target.getAttribute("data-nombre");

      contactoPendiente = { destinatarioNombre, destinatarioId };

      const modalWsp = document.getElementById("modal-whatsapp-seguro");
      if (modalWsp) {
        modalWsp.hidden = false;
      } else if (window.abrirChatConVecino) {
        window.abrirChatConVecino(destinatarioNombre, destinatarioId);
      }
    }
  });

  const btnConfirmarWsp = document.getElementById("btn-confirmar-wsp");
  const btnCancelarWsp = document.getElementById("btn-cancelar-wsp");
  const modalWsp = document.getElementById("modal-whatsapp-seguro");

  btnConfirmarWsp?.addEventListener("click", () => {
    if (modalWsp) modalWsp.hidden = true;
    if (contactoPendiente && window.abrirChatConVecino) {
      window.abrirChatConVecino(contactoPendiente.destinatarioNombre, contactoPendiente.destinatarioId);
    }
    contactoPendiente = null;
  });

  btnCancelarWsp?.addEventListener("click", () => {
    if (modalWsp) modalWsp.hidden = true;
    contactoPendiente = null;
  });

  function renderizarPublicaciones() {
    if (!lista) return;

    const tipoFiltro = normalizarTexto(
      filtroTipoInput?.value
    ).toLocaleLowerCase("es-AR");

    const soloOffline = Boolean(filtroOfflineActivoInput?.checked);

    const filtradas = publicaciones.filter(publicacion => {
      const coincideTipo =
        !tipoFiltro ||
        tipoFiltro === "todos" ||
        tipoFiltro === "todas" ||
        String(publicacion.tipo)
          .toLocaleLowerCase("es-AR") === tipoFiltro;

      const coincideOffline = !soloOffline || Boolean(publicacion.offline_activo);

      return coincideTipo && coincideOffline;
    });

    lista.replaceChildren();

    if (filtradas.length === 0) {
      const mensaje = document.createElement("p");

      mensaje.className = "sin-publicaciones";
      mensaje.textContent =
        "Todavía no hay publicaciones que coincidan con tu búsqueda o filtros de emergencia.";

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
      offline_activo: Boolean(getItem("hm_offline_activo", false)),
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
            "offline_activo",
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

    if (filtroZonaGondola) {
      filtroZonaGondola.value = "";
    }

    if (filtroTipoInput) {
      filtroTipoInput.value = "todas";
    }

    if (filtroOfflineActivoInput) {
      filtroOfflineActivoInput.checked = false;
    }

    cargarPublicacionesRemotas();
  }

  const manejarCategoria = () => {
    actualizarCampoOtraCategoria();
  };

  const manejarBusqueda = () => {
    cargarPublicacionesRemotas();
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

  actualizarRedBtn?.addEventListener("click", async () => {
    notificar("Actualizando estado de la red...", "info");
    await cargarPublicacionesRemotas();
    notificar("¡Estado de la red actualizado con éxito!", "success");
  });

  busquedaInput?.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") {
      evento.preventDefault();
      manejarBusqueda();
    }
  });

  filtroZonaGondola?.addEventListener("keydown", (evento) => {
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

  filtroOfflineActivoInput?.addEventListener("change", () => {
    renderizarPublicaciones();
  });

  limpiarFiltrosBtn?.addEventListener(
    "click",
    limpiarFiltros
  );

  form?.addEventListener(
    "submit",
    manejarSubmit
  );

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

      filtroOfflineActivoInput?.removeEventListener(
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
