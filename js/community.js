import { supabase } from "./supabase.js";
import {
  obtenerUsuarioActual,
  obtenerPerfilActual,
  perfilEstaCompleto
} from "./auth.js";

const STORAGE_KEY = "hm_publicaciones";

const MATRIX_CONFIG = {
  DB_NAME: "HumanometroComunidadDB",
  DB_VERSION: 3,
  STORE_PUBLICACIONES: "publicaciones_cache",
  STORE_MEDICIONES: "mediciones_pendientes"
};

const BRIAR_URL =
  "https://play.google.com/store/apps/details?id=org.briarproject.briar.android";

const UMBRAL_VIGENCIA_CACHE_MS = 48 * 60 * 60 * 1000;

export function initCommunity({
  getItem,
  setItem,
  mostrarNotificacion
}) {
  const form = document.getElementById("form-publicacion");
  const lista = document.getElementById("lista-publicaciones");
  const tipoInput = document.getElementById("tipo-publicacion");
  const botonFichaOfrezco = document.getElementById("btn-ficha-ofrezco");
  const botonFichaNecesito = document.getElementById("btn-ficha-necesito");
  const categoriaInput = document.getElementById("categoria-publicacion");
  const avisoMedicamentos = document.getElementById("aviso-seguridad-medicamentos");
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
  const labelNecesitaInput = document.querySelector("label[for='que-necesita-a-cambio']") || necesitaInput?.previousElementSibling;
  const zonaPublicacionInput = document.getElementById("zona-publicacion");
  const botonUbicacionPublicacion = document.getElementById("btn-ubicacion-publicacion");
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
  const botonSubmitForm = form?.querySelector("button[type='submit']");
  const listaVecinos = document.getElementById("lista-vecinos");
  const estadoVecinos = document.getElementById("estado-vecinos");
  const botonActualizarVecinos = document.getElementById("btn-actualizar-vecinos");
  const filtroVecinoActivo = document.getElementById("filtro-vecino-activo");
  const textoFiltroVecino = document.getElementById("texto-filtro-vecino");
  const botonQuitarFiltroVecino = document.getElementById("btn-quitar-filtro-vecino");

  let perfilFiltroActivo = null;
  let perfilFiltroNombre = "";
  let publicaciones = [];
  let cargando = false;
  let destruido = false;
  let suscripcionAuth = null;
  let ultimaCarga = 0;
  let dbMatrixInstance = null;
  let usuarioSesionId = "";

  function normalizarZonaRadar(valor) {
    return String(valor || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/gi, " ")
      .trim()
      .toLocaleLowerCase("es-AR")
      .replace(/\s+/g, " ");
  }

  function coincideZonaRadar(perfil, destino) {
    const componentesDestino = String(destino || "")
      .split(",")
      .map(normalizarZonaRadar)
      .filter((parte) => parte.length >= 3);
    if (!componentesDestino.length) return false;

    const ubicacionesPerfil = [
      perfil?.localidad,
      perfil?.zona_aproximada
    ].map(normalizarZonaRadar).filter(Boolean);
    if (!ubicacionesPerfil.length) return false;

    return componentesDestino.some((parte) =>
      ubicacionesPerfil.some((ubicacion) =>
        ubicacion === parte ||
        (" " + ubicacion + " ").includes(" " + parte + " ") ||
        (" " + parte + " ").includes(" " + ubicacion + " ")
      )
    );
  }

  function crearIndicadorMensajeriaOffline(perfil) {
    if (!perfil || !perfil.mensajeria_offline) {
      return null;
    }

    const enlace = document.createElement("a");
    enlace.className = "indicador-mensajeria-offline";
    enlace.href = BRIAR_URL;
    enlace.target = "_blank";
    enlace.rel = "noopener noreferrer";
    enlace.title =
      "Este vecino declara contar con mensajería offline. Conocé Briar.";
    enlace.setAttribute(
      "aria-label",
      "Mensajería offline. Abrir Briar en Google Play."
    );

    const icono = document.createElement("span");
    icono.className = "indicador-mensajeria-offline-icon";
    icono.setAttribute("aria-hidden", "true");
    icono.textContent = "📶";

    const texto = document.createElement("span");
    texto.textContent = "Mensajería offline disponible";

    const flecha = document.createElement("span");
    flecha.setAttribute("aria-hidden", "true");
    flecha.textContent = "↗";

    enlace.append(icono, texto, flecha);

    return enlace;
  }

  let modoListadoPerfiles = "directorio";
  let destinoRadarComunitario = "";

  function obtenerContenedorPerfiles() {
    return (
      document.getElementById("lista-comunidad") ||
      document.getElementById("directorio-comunidad") ||
      listaVecinos
    );
  }

  async function cargarVecinos() {
    const contenedor = obtenerContenedorPerfiles();
    if (!contenedor) return;

    contenedor.replaceChildren();
    const esRadar = modoListadoPerfiles === "radar";
    const estado = esRadar
      ? (document.getElementById("estado-radar") || estadoVecinos)
      : (document.getElementById("estado-comunidad") || estadoVecinos);

    if (estado) {
      estado.textContent = esRadar
        ? "Buscando integrantes en la zona indicada…"
        : "Cargando el directorio general de la comunidad…";
    }

    if (!navigator.onLine) {
      if (estado) estado.textContent = "Necesitás conexión para consultar los perfiles comunitarios.";
      return;
    }

    try {
      const { data: perfiles, error: errorPerfiles } = await supabase
        .from("perfiles")
        .select(
          "id, nombre_visible, presentacion, localidad, zona_aproximada, foto_url, conectividad_disponible, conectividad_modalidad, conectividad_emergencias, mensajeria_offline, porcentaje_humanidad, actualizado_en"
        );
      if (errorPerfiles) throw errorPerfiles;

      const { data: publicacionesActivas, error: errorPublicaciones } = await supabase
        .from("publicaciones")
        .select(
          [
            "id",
            "perfil_id",
            "usuario_id",
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
        .eq("estado", "publicada")
        .order("creado_en", { ascending: false });
      if (errorPublicaciones) throw errorPublicaciones;

      const publicacionesPorPerfil = new Map();
      (publicacionesActivas || []).forEach((registro) => {
        const publicacion = convertirRegistroRemoto(registro);
        const idsPropietario = new Set(
          [registro.perfil_id, registro.usuario_id]
            .filter(Boolean)
            .map((id) => String(id))
        );

        idsPropietario.forEach((id) => {
          if (!publicacionesPorPerfil.has(id)) {
            publicacionesPorPerfil.set(id, []);
          }
          publicacionesPorPerfil.get(id).push(publicacion);
        });
      });

      const usuario = await obtenerUsuarioActual();
      const idPropio = String(usuario?.id || "");

      let vecinos = (perfiles || []).filter((perfil) =>
        String(perfil.id || "") !== idPropio
      );

      if (esRadar) {
        const destino = normalizarZonaRadar(destinoRadarComunitario);
        if (!destino) {
          if (estado) estado.textContent = "Indicá una localidad o zona para iniciar la búsqueda del Radar.";
          return;
        }
        vecinos = vecinos.filter((perfil) =>
          coincideZonaRadar(perfil, destinoRadarComunitario)
        );
      }

      vecinos.sort((a, b) => {
        const fechaA = new Date(a.actualizado_en || 0).getTime();
        const fechaB = new Date(b.actualizado_en || 0).getTime();
        return fechaB - fechaA;
      });

      if (!vecinos.length) {
        if (estado) estado.textContent = esRadar
          ? `No encontramos perfiles cuya localidad o zona coincida con “${destinoRadarComunitario}”.`
          : "Todavía no hay otros perfiles para mostrar en el directorio comunitario.";
        return;
      }

      const fragmento = document.createDocumentFragment();
      vecinos.forEach((perfil) => {
        const tarjeta = document.createElement("article");
        tarjeta.className = "tarjeta-vecino";

        const encabezado = document.createElement("div");
        encabezado.className = "vecino-encabezado";
        const avatar = document.createElement("div");
        avatar.className = "vecino-avatar";
        if (perfil.foto_url) {
          const imagen = document.createElement("img");
          imagen.src = perfil.foto_url;
          imagen.alt = `Foto de ${perfil.nombre_visible || "integrante"}`;
          imagen.loading = "lazy";
          avatar.appendChild(imagen);
        } else {
          avatar.textContent = String(perfil.nombre_visible || "H").trim().charAt(0).toUpperCase() || "H";
        }

        const identidad = document.createElement("div");
        identidad.className = "vecino-identidad";
        const nombre = document.createElement("h3");
        nombre.textContent = perfil.nombre_visible || "Integrante de la comunidad";
        const ubicacion = document.createElement("p");
        ubicacion.textContent = [perfil.localidad, perfil.zona_aproximada].filter(Boolean).join(" · ") || "Ubicación no especificada";
        identidad.append(nombre, ubicacion);
        encabezado.append(avatar, identidad);
        tarjeta.appendChild(encabezado);

        const presentacion = document.createElement("p");
        presentacion.className = "vecino-presentacion";
        presentacion.textContent = perfil.presentacion || "Este integrante todavía no agregó una presentación.";
        tarjeta.appendChild(presentacion);

        const datos = document.createElement("div");
        datos.className = "vecino-indicadores";
        
        const publicacionesDeEstePerfil =
          publicacionesPorPerfil.get(String(perfil.id)) || [];
        const totalPubs = publicacionesDeEstePerfil.length;

        if (totalPubs > 0) {
          const publicacionesVecino = document.createElement("span");
          publicacionesVecino.className = "vecino-publicaciones-conteo";
          publicacionesVecino.textContent = `📦 ${totalPubs} ${totalPubs === 1 ? "publicación activa" : "publicaciones activas"}`;
          datos.appendChild(publicacionesVecino);
        }

        const humanometroVecino = document.createElement("span");
        const porcentajeHumanidad = perfil.porcentaje_humanidad ?? 0;
        humanometroVecino.className = "vecino-humanometro-badge";
        humanometroVecino.textContent = `🤝 Humanómetro: ${porcentajeHumanidad}%`;
        datos.appendChild(humanometroVecino);

        if (String(perfil.conectividad_disponible).toLowerCase() === "true") {
          const conectividad = document.createElement("span");
          conectividad.className = "vecino-conectividad";
          const modalidad = perfil.conectividad_modalidad || "solidaria";
          conectividad.textContent = `📡 Conectividad: ${modalidad}${perfil.conectividad_emergencias ? " · Emergencias" : ""}`;
          datos.appendChild(conectividad);
        }
        tarjeta.appendChild(datos);

        if (publicacionesDeEstePerfil.length > 0) {
          const seccionPublicaciones = document.createElement("section");
          seccionPublicaciones.className = "vecino-publicaciones";
          const tituloPublicaciones = document.createElement("h4");
          tituloPublicaciones.className = "vecino-publicaciones-titulo";
          tituloPublicaciones.textContent = "PUBLICACIONES ACTIVAS";
          seccionPublicaciones.appendChild(tituloPublicaciones);

          publicacionesDeEstePerfil.forEach((publicacion) => {
            const desplegable = document.createElement("details");
            desplegable.className = "vecino-publicacion-desplegable";
            const resumen = document.createElement("summary");
            resumen.textContent = `${publicacion.tipo || "Publicación"} · ${publicacion.titulo || "Ver detalles"}`;
            desplegable.appendChild(resumen);

            const detallePublicacion = crearTarjeta({
              ...publicacion,
              perfil_nombre: perfil.nombre_visible || "Integrante"
            });
            detallePublicacion.classList.add("vecino-publicacion-detalle");
            desplegable.appendChild(detallePublicacion);
            seccionPublicaciones.appendChild(desplegable);
          });

          tarjeta.appendChild(seccionPublicaciones);
        }

        const indicadorOffline = crearIndicadorMensajeriaOffline(perfil);
        if (indicadorOffline) tarjeta.appendChild(indicadorOffline);

        const acciones = document.createElement("div");
        acciones.className = "vecino-acciones";
        const verPublicaciones = document.createElement("button");
        verPublicaciones.type = "button";
        verPublicaciones.className = "boton-secundario";
        verPublicaciones.textContent = "VER PUBLICACIONES";
        
        verPublicaciones.addEventListener("click", () => {
          perfilFiltroActivo = perfil.id;
          perfilFiltroNombre = perfil.nombre_visible || "Integrante";
          if (filtroVecinoActivo) filtroVecinoActivo.hidden = false;
          if (textoFiltroVecino) textoFiltroVecino.textContent = `Mostrando publicaciones de ${perfilFiltroNombre}`;
          
          if (form) form.style.display = "none";

          if (busquedaInput) busquedaInput.value = "";
          
          cargarPublicacionesRemotas();
          window.dispatchEvent(new CustomEvent("abrirVistaGondola"));

          setTimeout(() => {
            lista?.scrollIntoView({ behavior: "smooth" });
          }, 150);
        });
        acciones.appendChild(verPublicaciones);

        const contactar = document.createElement("button");
        contactar.type = "button";
        contactar.className = "boton-accion btn-contactar-whatsapp";
        contactar.dataset.id = String(perfil.id || "");
        contactar.dataset.nombre = perfil.nombre_visible || "Integrante";
        contactar.textContent = "CONTACTAR POR WHATSAPP";
        acciones.appendChild(contactar);
        tarjeta.appendChild(acciones);
        fragmento.appendChild(tarjeta);
      });

      contenedor.appendChild(fragmento);
      if (estado) estado.textContent = esRadar
        ? `${vecinos.length} perfil${vecinos.length === 1 ? "" : "es"} encontrado${vecinos.length === 1 ? "" : "s"} para “${destinoRadarComunitario}”.`
        : `${vecinos.length} integrante${vecinos.length === 1 ? "" : "s"} en el directorio · ordenados por actualización del perfil.`;
    } catch (error) {
      console.error("No se pudieron cargar los perfiles comunitarios:", error);
      if (estado) estado.textContent = "No se pudieron cargar los perfiles. Verificá la conexión y los permisos de lectura de perfiles en Supabase.";
    }
  }

  function cargarDirectorioComunidad() {
    modoListadoPerfiles = "directorio";
    return cargarVecinos();
  }

  function cargarRadarComunitario(destino) {
    modoListadoPerfiles = "radar";
    if (typeof destino === "string") destinoRadarComunitario = destino.trim();
    else {
      const localidad = document.getElementById("zona-explorar")?.value || "";
      const provincia = document.getElementById("radar-provincia")?.value || "";
      const pais = document.getElementById("radar-pais")?.value || "";
      destinoRadarComunitario = [localidad, provincia, pais].filter(Boolean).join(", ");
    }
    return cargarVecinos();
  }

  function abrirMatrixDB() {
    return new Promise((resolve, reject) => {
      if (dbMatrixInstance) {
        return resolve(dbMatrixInstance);
      }

      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB no está disponible."));
        return;
      }

      const request = indexedDB.open(
        MATRIX_CONFIG.DB_NAME,
        MATRIX_CONFIG.DB_VERSION
      );

      request.onerror = (e) => reject(e.target.error);

      request.onsuccess = (e) => {
        dbMatrixInstance = e.target.result;

        dbMatrixInstance.onversionchange = () => {
          dbMatrixInstance.close();
          dbMatrixInstance = null;
        };

        resolve(dbMatrixInstance);
      };

      request.onupgradeneeded = (e) => {
        const db = e.target.result;

        if (
          !db.objectStoreNames.contains(
            MATRIX_CONFIG.STORE_PUBLICACIONES
          )
        ) {
          db.createObjectStore(
            MATRIX_CONFIG.STORE_PUBLICACIONES,
            { keyPath: "id" }
          );
        }

        if (
          !db.objectStoreNames.contains(
            MATRIX_CONFIG.STORE_MEDICIONES
          )
        ) {
          db.createObjectStore(
            MATRIX_CONFIG.STORE_MEDICIONES,
            {
              keyPath: "id",
              autoIncrement: true
            }
          );
        }
      };
    });
  }

  async function guardarMatrixCache(pubs) {
    try {
      const db = await abrirMatrixDB();
      const tx = db.transaction(
        [MATRIX_CONFIG.STORE_PUBLICACIONES],
        "readwrite"
      );
      const store = tx.objectStore(
        MATRIX_CONFIG.STORE_PUBLICACIONES
      );

      pubs.forEach((pub) => store.put(pub));
    } catch (err) {
      console.warn("Matrix: No se pudo guardar caché en IndexedDB", err);
    }
  }

  async function obtenerMatrixCache() {
    try {
      const db = await abrirMatrixDB();

      return new Promise((resolve) => {
        const tx = db.transaction(
          [MATRIX_CONFIG.STORE_PUBLICACIONES],
          "readonly"
        );
        const store = tx.objectStore(
          MATRIX_CONFIG.STORE_PUBLICACIONES
        );
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
    return String(valor ?? "").replace(/[&<>"']/g, (caracter) => {
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

  // La base usa valores cerrados (CHECK). Se conservan los valores y textos
  // originales de la interfaz mediante metadatos internos en la descripción.
  const MARCADOR_META_PUBLICACION = "[HMC_META:";

  function mapearTipoBD(tipo) {
    const valor = normalizarTexto(tipo).toLowerCase();
    if (valor === "oferta" || valor === "ofrezco") return "ofrezco";
    if (valor === "necesidad" || valor === "necesito") return "necesito";
    if (valor === "ayuda") return "ayuda";
    return valor;
  }

  function mapearCategoriaBD(categoria) {
    const valor = normalizarTexto(categoria).toLowerCase();
    const permitidas = ["alimentos", "herramientas", "hogar", "mascotas", "ropa", "servicios", "varios", "wifi"];
    if (permitidas.includes(valor)) return valor;
    const equivalencias = {
      productos: "varios",
      transporte: "servicios",
      energia: "wifi",
      recursos: "varios",
      ayuda: "varios",
      bancos_salud_oficial: "servicios",
      otros: "varios",
      otra: "varios"
    };
    return equivalencias[valor] || "varios";
  }

  function mapearModalidadBD(modalidadUI) {
    const valor = normalizarTexto(modalidadUI).toLowerCase();
    if (["trueque-productos", "trueque-servicios", "intercambio-mixto"].includes(valor)) {
      return { modalidad: "intercambio", modalidad_intercambio: "especifico" };
    }
    if (valor === "gratuito") {
      return { modalidad: "gratuito", modalidad_intercambio: "acepto_propuestas" };
    }
    if (valor === "colaboracion") {
      return { modalidad: "a_convenir", modalidad_intercambio: "escucho_tu_ofrecimiento" };
    }
    return { modalidad: null, modalidad_intercambio: null };
  }

  function obtenerCondicion(descripcion) {
    let texto = normalizarTexto(descripcion);
    let meta = {};
    const metaMatch = texto.match(/(?:^|\n)\[HMC_META:([^\]]+)\]\s*$/);
    if (metaMatch) {
      try { meta = JSON.parse(decodeURIComponent(metaMatch[1])); } catch (error) {
        console.warn("No se pudieron leer los metadatos de la publicación:", error);
      }
      texto = texto.replace(metaMatch[0], "").trim();
    }

    const coincidencia = texto.match(/(?:^|\n)\[Condición informada:\s*([^\]]*)\]\s*$/);
    if (!coincidencia) return { descripcion: texto, condicion: "", meta };

    return {
      descripcion: texto.replace(coincidencia[0], "").trim(),
      condicion: normalizarTexto(coincidencia[1]),
      meta
    };
  }

  function convertirRegistroRemoto(registro) {
    const datosDescripcion = obtenerCondicion(
      registro.descripcion
    );

    return {
      id: String(registro.id),
      perfil_id: registro.perfil_id ?? registro.usuario_id ?? null,
      tipo: datosDescripcion.meta.tipoUI || (registro.tipo === "ofrezco" ? "oferta" : registro.tipo === "necesito" ? "necesidad" : registro.tipo ?? ""),
      categoria: datosDescripcion.meta.categoriaUI || registro.categoria || "",
      titulo: registro.titulo ?? "",
      descripcion: datosDescripcion.descripcion,
      condicion: datosDescripcion.condicion,
      modalidad: registro.modalidad ?? null,
      modalidad_intercambio:
        datosDescripcion.meta.modalidadUI || registro.modalidad_intercambio || "",
      que_necesita_a_cambio:
        registro.que_necesita_a_cambio ?? "",
      zona_aproximada: registro.zona_aproximada ?? "",
      offline_activo: Boolean(registro.offline_activo ?? false),
      fotos: Array.isArray(registro.fotos)
        ? registro.fotos
        : [],
      estado: registro.estado ?? "publicada",
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

  async function sincronizarPublicacionesPendientes() {
    if (!navigator.onLine) return;
    const usuario = await obtenerUsuarioActual();
    if (!usuario?.id) return;
    const pendientes = obtenerLocales().filter((p) => String(p.origen || "") === "local" && String(p.usuario_id || p.perfil_id || "") === String(usuario.id) && String(p.id || "").startsWith("local-"));
    const sincronizadas = new Set();
    for (const pendiente of pendientes) {
      const registro = { perfil_id: usuario.id, usuario_id: usuario.id, tipo: pendiente.tipo, categoria: pendiente.categoria, titulo: pendiente.titulo, descripcion: pendiente.descripcion, modalidad: pendiente.modalidad ?? null, modalidad_intercambio: pendiente.modalidad_intercambio ?? null, que_necesita_a_cambio: pendiente.que_necesita_a_cambio || "", zona_aproximada: pendiente.zona_aproximada || "", offline_activo: Boolean(pendiente.offline_activo), fotos: Array.isArray(pendiente.fotos) ? pendiente.fotos : [], estado: "publicada", creado_en: pendiente.creado_en || new Date().toISOString(), actualizado_en: new Date().toISOString() };
      const { error } = await supabase.from("publicaciones").insert(registro);
      if (error) { console.warn("Publicación pendiente de sincronización:", error); continue; }
      sincronizadas.add(String(pendiente.id));
    }
    if (sincronizadas.size) guardarLocales(obtenerLocales().filter((p) => !sincronizadas.has(String(p.id))));
  }

  async function cargarPublicacionesRemotas() {
    if (destruido) return;
    const usuarioSesion = await obtenerUsuarioActual();
    usuarioSesionId = String(usuarioSesion?.id || "");

    cargando = true;
    const identificadorCarga = ++ultimaCarga;

    const zonaActualFiltro = obtenerZona();
    const palabraClave = normalizarTexto(busquedaInput?.value);

    if (lista) {
      lista.innerHTML = "<p class='texto-ayuda' style='text-align: center; padding: 20px; color: #38bdf8;'>🔍 Buscando publicaciones en la red...</p>";
    }

    try {
      if (navigator.onLine) {
        const columnasPublicacion = [
          "id", "perfil_id", "usuario_id", "tipo", "categoria", "titulo",
          "descripcion", "modalidad", "modalidad_intercambio",
          "que_necesita_a_cambio", "zona_aproximada", "offline_activo",
          "fotos", "estado", "creado_en", "actualizado_en"
        ].join(",");

        // Recuperar todas las publicaciones activas en páginas evita el límite
        // máximo de filas de PostgREST y evita combinar varios filtros OR en SQL.
        const data = [];
        let desde = 0;
        const tamanoPagina = 500;
        let error = null;
        while (true) {
          const respuesta = await supabase
            .from("publicaciones")
            .select(columnasPublicacion)
            .eq("estado", "publicada")
            .order("creado_en", { ascending: false })
            .range(desde, desde + tamanoPagina - 1);
          if (respuesta.error) {
            error = respuesta.error;
            break;
          }
          const pagina = respuesta.data || [];
          data.push(...pagina);
          if (pagina.length < tamanoPagina) break;
          desde += tamanoPagina;
        }

        if (destruido || identificadorCarga !== ultimaCarga) {
          return;
        }

        if (!error && data) {
          const perfilIds = [...new Set(
            data
              .flatMap((publicacion) => [publicacion.perfil_id, publicacion.usuario_id])
              .filter(Boolean)
              .map((id) => String(id))
          )];
          const perfilesMapa = new Map();

          if (perfilIds.length > 0) {
            const { data: perfilesData, error: errorPerfiles } = await supabase
              .from("perfiles")
              .select("id, nombre_visible")
              .in("id", perfilIds);

            if (errorPerfiles) throw errorPerfiles;
            (perfilesData || []).forEach((pf) => {
              perfilesMapa.set(String(pf.id), pf.nombre_visible);
            });
          }

          const todasRemotas = data.map((registro) => {
            const conv = convertirRegistroRemoto(registro);
            const idPerfil = String(registro.perfil_id || registro.usuario_id || "");
            conv.perfil_nombre = perfilesMapa.get(idPerfil) || "Vecino";
            return conv;
          });

          // La caché conserva el conjunto completo, no solamente los resultados
          // de una búsqueda o del perfil que se esté consultando en ese momento.
          await guardarMatrixCache(todasRemotas);

          const remotas = todasRemotas.filter((publicacion) => {
            const propietario = String(publicacion.perfil_id || "");
            if (perfilFiltroActivo && propietario !== String(perfilFiltroActivo)) return false;
            if (!perfilFiltroActivo && zonaActualFiltro) {
              const zonaPub = normalizarZonaRadar(publicacion.zona_aproximada);
              const zonaBuscada = normalizarZonaRadar(zonaActualFiltro);
              if (zonaPub && !zonaPub.includes(zonaBuscada)) return false;
            }
            if (!perfilFiltroActivo && palabraClave) {
              const q = palabraClave.toLocaleLowerCase("es-AR");
              const texto = `${publicacion.titulo || ""} ${publicacion.descripcion || ""}`.toLocaleLowerCase("es-AR");
              if (!texto.includes(q)) return false;
            }
            return true;
          });

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
      console.warn(
        "Red intermitente, cargando desde red de relevo local Matrix...",
        error
      );
    } finally {
      cargando = false;
    }

    const cacheLocal = await obtenerMatrixCache();
    let remotasCache = cacheLocal.map(convertirRegistroRemoto);

    if (perfilFiltroActivo) {
      remotasCache = remotasCache.filter(
        (p) => String(p.perfil_id) === String(perfilFiltroActivo)
      );
    } else if (zonaActualFiltro) {
      remotasCache = remotasCache.filter((p) =>
        String(p.zona_aproximada || "")
          .toLowerCase()
          .includes(zonaActualFiltro.toLowerCase())
      );
    }

    if (palabraClave && !perfilFiltroActivo) {
      const q = palabraClave.toLowerCase();
      remotasCache = remotasCache.filter(
        (p) =>
          p.titulo.toLowerCase().includes(q) ||
          p.descripcion.toLowerCase().includes(q)
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

    const idPublicacion = escaparHTML(publicacion.id);
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

    const esIntercambio = Boolean(
      publicacion.modalidad_intercambio ||
      publicacion.que_necesita_a_cambio
    );

    const nombreAutor = escaparHTML(
      publicacion.perfil_nombre || "Vecino"
    );
    const autorId = publicacion.perfil_id || "";
    const offlineActivo = Boolean(publicacion.offline_activo);
    const esPropia = Boolean(usuarioSesionId) && String(publicacion.perfil_id || publicacion.usuario_id || "") === usuarioSesionId;
    const esLocal = publicacion.origen === "local";

    let requiereRevalidar = false;

    if (publicacion.creado_en) {
      const tiempoCreacion = new Date(
        publicacion.creado_en
      ).getTime();
      const tiempoActual = Date.now();

      if (
        !Number.isNaN(tiempoCreacion) &&
        tiempoActual - tiempoCreacion > UMBRAL_VIGENCIA_CACHE_MS
      ) {
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
          ? `<div style="margin: 8px 0; background: #78350f; border: 1px solid #d97706; padding: 8px 12px; border-radius: 6px; font-size: 0.85rem; color: #fde68a;">
               ⚠️ <strong>Aviso de perfil o publicación sin actividad reciente:</strong> Esta publicación supera las 48h. Conviene consultar disponibilidad antes de coordinar.
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
               <span>📡</span> <strong>Conectividad Offline Activa:</strong> Vecino preparado para emergencias sin internet.
             </div>`
          : ""
      }

      <small class="publicacion-fecha">${fecha}</small>

      <div style="display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap;">
        <button
          class="boton-secundario btn-contactar-trueque"
          data-id="${autorId}"
          data-nombre="${nombreAutor}"
          style="flex: 1; font-size: 0.85rem; cursor: pointer;"
        >
          Contactar por este trueque
        </button>

        ${esPropia && !esLocal ? `<button class="boton-secundario btn-retirar-publicacion" data-pub-id="${idPublicacion}" style="flex:1;font-size:.85rem;">RETIRAR MI PUBLICACIÓN</button>` : ""}
        <button
          class="boton-accion btn-iniciar-intercambio-card"
          data-pub-id="${idPublicacion}"
          data-autor-id="${autorId}"
          style="flex: 1; font-size: 0.85rem; cursor: pointer; background: #0284c7; color: #fff;"
        >
          Iniciar Intercambio
        </button>
      </div>
    `;

    return tarjeta;
  }

  async function manejarInicioIntercambioDesdeCard(e) {
    const boton = e.target.closest(".btn-iniciar-intercambio-card");
    if (!boton) return;

    e.preventDefault();
    const publicacionId = boton.getAttribute("data-pub-id");
    const perfilDuenhoId = boton.getAttribute("data-autor-id");

    const usuarioActual = await obtenerUsuarioActual();
    if (!usuarioActual) {
      notificar("Debes iniciar sesión para realizar un intercambio.", "error");
      return;
    }

    if (String(usuarioActual.id) === String(perfilDuenhoId)) {
      notificar("No puedes iniciar un intercambio con tu propia publicación.", "warning");
      return;
    }

    const { data: publicacionVigente, error: errorPublicacion } = await supabase
      .from("publicaciones")
      .select("id, perfil_id, usuario_id, estado")
      .eq("id", publicacionId)
      .maybeSingle();
    if (errorPublicacion || !publicacionVigente ||
        publicacionVigente.estado !== "publicada" ||
        String(publicacionVigente.perfil_id || publicacionVigente.usuario_id) !== String(perfilDuenhoId)) {
      notificar("Esta publicación ya no está disponible para iniciar un intercambio.", "warning");
      return;
    }

    const { data: intercambioExistente, error: errorExistente } = await supabase
      .from("intercambios")
      .select("id")
      .eq("publicacion_id", publicacionId)
      .eq("usuario_a", perfilDuenhoId)
      .eq("usuario_b", usuarioActual.id)
      .eq("estado", "en_proceso")
      .maybeSingle();
    if (errorExistente) {
      notificar("No se pudo comprobar si ya existe una solicitud para esta publicación.", "error");
      return;
    }
    if (intercambioExistente) {
      notificar("Ya tenés un intercambio en curso para esta publicación.", "warning");
      return;
    }

    const horasStr = prompt("Ingresa el plazo estimado en horas para el intercambio (ej: 24, 48 o 72):", "24");
    if (!horasStr) return;

    const horas = parseInt(horasStr, 10);
    if (isNaN(horas) || horas <= 0) {
      notificar("Por favor, ingresa un número válido de horas.", "error");
      return;
    }

    const fechaLimite = new Date();
    fechaLimite.setHours(fechaLimite.getHours() + horas);

    try {
      const { error } = await supabase.from("intercambios").insert([{
        publicacion_id: publicacionId,
        usuario_a: perfilDuenhoId,
        usuario_b: usuarioActual.id,
        estado: "en_proceso",
        fecha_limite: fechaLimite.toISOString(),
        confirmado_a: false,
        confirmado_b: false
      }]);

      if (error) throw error;

      notificar("¡Intercambio iniciado con éxito!", "success");
      cargarPublicacionesRemotas();
    } catch (error) {
      console.error("Error al iniciar el intercambio:", error);
      notificar("Error al iniciar el intercambio: " + error.message, "error");
    }
  }

  document.addEventListener("click", manejarInicioIntercambioDesdeCard);

  async function manejarRetiroPublicacion(e) {
    const boton = e.target.closest?.(".btn-retirar-publicacion");
    if (!boton) return;
    e.preventDefault();
    const usuario = await obtenerUsuarioActual();
    if (!usuario?.id || !boton.dataset.pubId) return;
    boton.disabled = true;
    const { error } = await supabase.from("publicaciones").update({ estado: "retirada", actualizado_en: new Date().toISOString() }).eq("id", boton.dataset.pubId).eq("usuario_id", usuario.id);
    if (error) { console.error("No se pudo retirar la publicación:", error); boton.disabled = false; notificar("No se pudo retirar la publicación. Intentá nuevamente.", "error"); return; }
    notificar("Tu publicación fue retirada de la comunidad.", "success");
    cargarPublicacionesRemotas();
    cargarDirectorioComunidad();
  }
  document.addEventListener("click", manejarRetiroPublicacion);

  let contactoPendiente = null;

  function normalizarTelefonoWhatsApp(valor) {
    return String(valor || "").replace(/\D/g, "");
  }

  async function prepararContactoWhatsApp(perfilId, nombre) {
    if (!perfilId) {
      notificar("No se pudo identificar el perfil de contacto.", "error");
      return;
    }

    try {
      const { data: perfil, error } = await supabase
        .from("perfiles")
        .select("whatsapp")
        .eq("id", perfilId)
        .maybeSingle();

      if (error) throw error;

      const telefono = normalizarTelefonoWhatsApp(perfil?.whatsapp);
      if (!telefono) {
        notificar("Este integrante todavía no tiene un número de WhatsApp disponible.", "warning");
        return;
      }

      contactoPendiente = {
        nombre: nombre || "integrante",
        url: `https://wa.me/${telefono}`
      };

      const modal = document.getElementById("modal-whatsapp-seguro");
      const titulo = document.getElementById("titulo-modal-contacto");
      const texto = modal?.querySelector("p");
      const confirmar = document.getElementById("btn-confirmar-wsp");

      if (titulo) titulo.textContent = "Antes de contactar por WhatsApp";
      if (texto) {
        texto.textContent = `Vas a abrir WhatsApp para comunicarte directamente con ${contactoPendiente.nombre}. No compartas contraseñas, códigos ni datos privados.`;
      }
      if (confirmar) confirmar.textContent = "ABRIR WHATSAPP";

      if (modal) {
        modal.hidden = false;
      } else {
        window.open(contactoPendiente.url, "_blank", "noopener,noreferrer");
        contactoPendiente = null;
      }
    } catch (error) {
      console.error("No se pudo preparar el contacto por WhatsApp:", error);
      notificar("No se pudo consultar el contacto. Verificá la conexión y los permisos del perfil.", "error");
    }
  }

  function manejarClickContacto(e) {
    const boton = e.target.closest?.(".btn-contactar-whatsapp, .btn-contactar-trueque");
    if (!boton) return;

    e.preventDefault();
    prepararContactoWhatsApp(
      boton.getAttribute("data-id"),
      boton.getAttribute("data-nombre")
    );
  }

  document.addEventListener("click", manejarClickContacto);

  const btnConfirmarWsp = document.getElementById("btn-confirmar-wsp");
  const btnCancelarWsp = document.getElementById("btn-cancelar-wsp");
  const modalWsp = document.getElementById("modal-whatsapp-seguro");

  function confirmarContactoWsp() {
    if (modalWsp) modalWsp.hidden = true;

    if (contactoPendiente?.url) {
      window.open(contactoPendiente.url, "_blank", "noopener,noreferrer");
    }

    contactoPendiente = null;
  }

  function cancelarContactoWsp() {
    if (modalWsp) modalWsp.hidden = true;
    contactoPendiente = null;
  }

  btnConfirmarWsp?.addEventListener("click", confirmarContactoWsp);
  btnCancelarWsp?.addEventListener("click", cancelarContactoWsp);

  function renderizarPublicaciones() {
    if (!lista) return;

    const tipoFiltro = normalizarTexto(
      filtroTipoInput?.value
    ).toLocaleLowerCase("es-AR");

    const soloOffline = Boolean(
      filtroOfflineActivoInput?.checked
    );

    const filtradas = publicaciones.filter((publicacion) => {
      const tipoPublicacion = String(publicacion.tipo || "").toLocaleLowerCase("es-AR");
      const tipoFiltroNormalizado = tipoFiltro === "oferta" ? "ofrezco" : tipoFiltro === "necesidad" ? "necesito" : tipoFiltro;
      const tipoPublicacionNormalizado = tipoPublicacion === "oferta" ? "ofrezco" : tipoPublicacion === "necesidad" ? "necesito" : tipoPublicacion;
      const coincideTipo =
        !tipoFiltro || tipoFiltro === "todos" || tipoFiltro === "todas" ||
        tipoPublicacionNormalizado === tipoFiltroNormalizado;

      const coincideOffline =
        !soloOffline || Boolean(publicacion.offline_activo);

      const coincideAutor =
        !perfilFiltroActivo ||
        String(publicacion.perfil_id || publicacion.usuario_id || "") ===
          String(perfilFiltroActivo);

      return coincideTipo && coincideOffline && coincideAutor;
    });

    lista.replaceChildren();

    if (filtradas.length === 0) {
      const mensaje = document.createElement("div");
      mensaje.className = "tarjeta-publicacion";
      mensaje.style.cssText =
        "text-align: center; padding: 25px; background: #17212b; border: 1px solid #2b3b4f; border-radius: 8px;";

      mensaje.innerHTML = `
        <p style="color: #cbd5e1; font-weight: bold; margin-bottom: 6px;">No se encontraron publicaciones con esos criterios.</p>
        <small style="color: #94a3b8;">Probá limpiando los filtros o volviendo a la comunidad.</small>
      `;

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

  async function obtenerZonaPorCoordenadas(
    latitud,
    longitud
  ) {
    const parametros = new URLSearchParams({
      format: "jsonv2",
      lat: String(latitud),
      lon: String(longitud),
      zoom: "14",
      addressdetails: "1",
      "accept-language": "es"
    });

    const respuesta = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${parametros.toString()}`,
      {
        headers: {
          Accept: "application/json"
        },
        cache: "no-store"
      }
    );

    if (!respuesta.ok) {
      throw new Error("No se pudo consultar OpenStreetMap.");
    }

    const datos = await respuesta.json();
    const direccion = datos.address || {};

    const zona =
      direccion.neighbourhood ||
      direccion.suburb ||
      direccion.quarter ||
      direccion.city_district ||
      direccion.borough ||
      direccion.village ||
      direccion.town ||
      direccion.city ||
      direccion.municipality ||
      direccion.county;

    if (!zona) {
      throw new Error("No se pudo reconocer el barrio o localidad.");
    }

    return String(zona).trim();
  }

  function usarUbicacionEnPublicacion() {
    if (!navigator.geolocation) {
      notificar(
        "Este dispositivo no ofrece geolocalización.",
        "warning"
      );
      return;
    }

    if (!navigator.onLine) {
      notificar(
        "Necesitás conexión para identificar la zona con OpenStreetMap.",
        "warning"
      );
      return;
    }

    if (botonUbicacionPublicacion) {
      botonUbicacionPublicacion.disabled = true;
      botonUbicacionPublicacion.textContent =
        "IDENTIFICANDO ZONA…";
    }

    navigator.geolocation.getCurrentPosition(
      async (posicion) => {
        try {
          const zona = await obtenerZonaPorCoordenadas(
            posicion.coords.latitude,
            posicion.coords.longitude
          );

          if (zonaPublicacionInput) {
            zonaPublicacionInput.value = zona;
          }

          notificar(
            `Zona aproximada identificada: ${zona}. Revisala antes de publicar.`,
            "success"
          );
        } catch (error) {
          console.warn(
            "No se pudo identificar la zona de la publicación:",
            error
          );

          notificar(
            "No se pudo identificar la zona. Podés escribirla manualmente.",
            "warning"
          );
        } finally {
          if (botonUbicacionPublicacion) {
            botonUbicacionPublicacion.disabled = false;
            botonUbicacionPublicacion.textContent =
              "USAR UBICACIÓN APROXIMADA";
          }
        }
      },
      (error) => {
        if (botonUbicacionPublicacion) {
          botonUbicacionPublicacion.disabled = false;
          botonUbicacionPublicacion.textContent =
            "USAR UBICACIÓN APROXIMADA";
        }

        notificar(
          error.code === 1
            ? "No autorizaste la ubicación."
            : "No se pudo obtener la ubicación. Escribí la zona manualmente.",
          "warning"
        );
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 300000
      }
    );
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

    const modalidad = normalizarTexto(modalidadInput?.value);
    const necesita = normalizarTexto(necesitaInput?.value);

    return {
      tipo,
      categoria,
      titulo,
      descripcion,
      condicion: normalizarTexto(condicionInput?.value),
      modalidad_intercambio: modalidad,
      que_necesita_a_cambio: necesita,
      zona_aproximada: normalizarTexto(
        zonaPublicacionInput?.value ||
        getItem("hm_barrio", "") ||
        getItem("hm_zona_explorar", "")
      )
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
    actualizarAvisoMedicamentos();

    if (normalizarTexto(categoriaInput?.value).toLowerCase() === "medicamentos") {
      notificar("No se pueden publicar, ofrecer, donar ni intercambiar medicamentos particulares. Consultá el directorio de entidades oficiales.", "error");
      return;
    }

    const datos = validarFormulario();

    if (!datos) return;

    const usuario = await obtenerUsuarioActual();
    const perfil = await obtenerPerfilActual();

    if (!usuario || !perfil || !perfilEstaCompleto()) {
      notificar(
        "Iniciá sesión y completá todos los datos obligatorios de tu perfil para publicar en la comunidad.",
        "error"
      );

      return;
    }

    if (botonSubmitForm) {
      botonSubmitForm.disabled = true;
      botonSubmitForm.textContent =
        "COMPARTIENDO EN LA RED...";
    }

    if (estadoPublicacion) {
      estadoPublicacion.textContent =
        "Compartiendo publicación con la comunidad...";
    }

    const ahora = new Date().toISOString();
    let descripcionRemota = datos.descripcion;

    if (datos.condicion) {
      descripcionRemota +=
        `\n[Condición informada: ${datos.condicion}]`;
    }

    const modalidadBD = mapearModalidadBD(datos.modalidad_intercambio);
    const metadatosPublicacion = {
      tipoUI: datos.tipo,
      categoriaUI: datos.categoria,
      modalidadUI: datos.modalidad_intercambio
    };
    descripcionRemota += `\n${MARCADOR_META_PUBLICACION}${encodeURIComponent(JSON.stringify(metadatosPublicacion))}]`;

    // La sesión autenticada es la fuente de autoridad para identificar al propietario.
    if (!usuario.id || !perfil.id || String(perfil.id) !== String(usuario.id)) {
      notificar(
        "No se pudo validar que el perfil corresponda a la sesión iniciada. Volvé a ingresar antes de publicar.",
        "error"
      );
      if (estadoPublicacion) {
        estadoPublicacion.textContent = "No se pudo validar el propietario de la publicación.";
      }
      if (botonSubmitForm) {
        botonSubmitForm.disabled = false;
        botonSubmitForm.textContent = "PUBLICAR";
      }
      return;
    }

    const registro = {
      perfil_id: usuario.id,
      usuario_id: usuario.id,
      tipo: mapearTipoBD(datos.tipo),
      categoria: mapearCategoriaBD(datos.categoria),
      titulo: datos.titulo,
      descripcion: descripcionRemota,
      modalidad: modalidadBD.modalidad,
      modalidad_intercambio: modalidadBD.modalidad_intercambio,
      que_necesita_a_cambio:
        datos.que_necesita_a_cambio,
      zona_aproximada: datos.zona_aproximada,
      offline_activo: Boolean(
        getItem("hm_offline_activo", false)
      ),
      fotos: [],
      estado: "publicada",
      actualizado_en: ahora
    };

    try {
      const { data, error } = await supabase
        .from("publicaciones")
        .insert(registro)
        .select("id")
        .single();

      if (error) throw error;

      const publicacionRemota =
        convertirRegistroRemoto({ ...registro, ...data });

      publicaciones = combinarPublicaciones(
        obtenerLocales(),
        [
          publicacionRemota,
          ...publicaciones.filter(
            (p) => p.origen === "remoto"
          )
        ]
      );

      renderizarPublicaciones();

      window.dispatchEvent(
        new CustomEvent("publicacionComunidadActualizada")
      );

      // AJUSTE INCORPORADO: Actualización automática del contador (paquetito) en la ficha al publicar
      cargarVecinos();

      form.reset();
      actualizarAvisoMedicamentos();
      actualizarSelectorFicha();

      if (zonaPublicacionInput) {
        zonaPublicacionInput.value =
          getItem("hm_barrio", "") || "";
      }

      actualizarCampoOtraCategoria();

      notificar(
        "¡Publicación compartida con éxito en la comunidad!",
        "success"
      );

      if (estadoPublicacion) {
        estadoPublicacion.textContent =
          "¡Publicado y visible en la red!";
      }
    } catch (error) {
      console.error(
        "Error inesperado al publicar:",
        error
      );

      const publicacionLocal = {
        ...registro,
        id: generarIdLocal(),
        creado_en: ahora,
        actualizado_en: ahora,
        origen: "local"
      };

      const locales = obtenerLocales();
      locales.unshift(publicacionLocal);

      if (guardarLocales(locales)) {
        publicaciones = combinarPublicaciones(
          locales,
          publicaciones.filter(
            (p) => p.origen === "remoto"
          )
        );

        renderizarPublicaciones();

        notificar(
          "No se pudo conectar con la red. La publicación quedó guardada en este dispositivo para intentar compartirla más tarde.",
          "warning"
        );

        if (estadoPublicacion) {
          const detalleError = error?.message
            ? ` Motivo informado por Supabase: ${error.message}`
            : "";
          estadoPublicacion.textContent =
            "Guardado localmente. Pendiente de conexión." + detalleError;
        }
      } else {
        notificar(
          "No se pudo publicar ni guardar localmente. Revisá el espacio disponible en el dispositivo.",
          "error"
        );
      }
    } finally {
      if (botonSubmitForm) {
        botonSubmitForm.disabled = false;
        botonSubmitForm.textContent = "PUBLICAR";
      }
    }
  }

  function limpiarFiltros() {
    if (busquedaInput) busquedaInput.value = "";
    if (filtroZonaGondola) filtroZonaGondola.value = "";
    if (filtroTipoInput) filtroTipoInput.value = "todos";
    if (filtroOfflineActivoInput) {
      filtroOfflineActivoInput.checked = false;
    }

    perfilFiltroActivo = null;
    perfilFiltroNombre = "";

    if (filtroVecinoActivo) {
      filtroVecinoActivo.hidden = true;
    }

    if (form) form.style.display = "block";

    cargarPublicacionesRemotas();
  }

  function actualizarTextosFormulario(esNecesidad) {
    if (labelNecesitaInput) {
      labelNecesitaInput.textContent = esNecesidad
        ? "¿Qué ofrecés a cambio?"
        : "¿Qué querés a cambio?";
    }
    if (necesitaInput) {
      necesitaInput.placeholder = esNecesidad
        ? "Ej: Ofrezco clases de apoyo, alimentos, o servicio técnico..."
        : "Ej: Busco materiales, ayuda con mudanza, o trueque abierto...";
    }
  }

  function actualizarSelectorFicha() {
    if (!tipoInput) return;

    const tipoVal = String(tipoInput.value || "").toLowerCase();
    const esOferta = tipoVal === "oferta" || tipoVal === "ofrezco";
    const esNecesidad = tipoVal === "necesidad" || tipoVal === "necesito";

    if (botonFichaOfrezco) {
      botonFichaOfrezco.classList.toggle("activa", esOferta);
      botonFichaOfrezco.setAttribute("aria-pressed", String(esOferta));
    }

    if (botonFichaNecesito) {
      botonFichaNecesito.classList.toggle("activa", esNecesidad);
      botonFichaNecesito.setAttribute("aria-pressed", String(esNecesidad));
    }

    actualizarTextosFormulario(esNecesidad);
  }

  function seleccionarTipoFicha(tipo) {
    if (!tipoInput) return;
    tipoInput.value = tipo;
    actualizarSelectorFicha();
  }

  function manejarBuscarPublicaciones() {
    cargarPublicacionesRemotas();
  }

  function manejarActualizarRed() {
    cargarPublicacionesRemotas();
  }

  function manejarActualizarVecinos() {
    cargarDirectorioComunidad();
  }

  function quitarFiltroVecino() {
    perfilFiltroActivo = null;
    perfilFiltroNombre = "";

    if (filtroVecinoActivo) {
      filtroVecinoActivo.hidden = true;
    }

    if (form) form.style.display = "block";

    window.dispatchEvent(new CustomEvent("mostrarDirectorioComunidad"));

    cargarPublicacionesRemotas();
  }

  function manejarFiltroCambio() {
    renderizarPublicaciones();
  }

  function actualizarAvisoMedicamentos() {
    if (!avisoMedicamentos) return;

    const categoria = normalizarTexto(categoriaInput?.value).toLowerCase();
    const texto = [tituloInput?.value, detalleInput?.value]
      .map((valor) => normalizarTexto(valor).toLowerCase())
      .join(" ");
    const mencionaMedicamentos = /\b(medicamento|medicamentos|f[aá]rmaco|f[aá]rmacos|pastillas|antibi[oó]tico|antibi[oó]ticos)\b/i.test(texto);
    const seleccionMedicamentos = categoria === "medicamentos";
    const esDirectorioOficial = categoria === "bancos_salud_oficial";

    avisoMedicamentos.hidden = esDirectorioOficial || !(seleccionMedicamentos || mencionaMedicamentos);
  }

  function manejarCategoriaCambio() {
    actualizarCampoOtraCategoria();
    actualizarAvisoMedicamentos();
  }

  function manejarTipoPublicacionCambio() {
    actualizarSelectorFicha();
  }

  function manejarModoRadar(evento) {
    const detalle = evento?.detail || {};
    const destinoDetalle = detalle.destino;
    let destino = "";

    if (typeof destinoDetalle === "string") {
      destino = destinoDetalle;
    } else if (destinoDetalle && typeof destinoDetalle === "object") {
      destino = [
        destinoDetalle.localidad,
        destinoDetalle.provincia,
        destinoDetalle.pais
      ].filter(Boolean).join(", ");
    } else {
      const localidad = document.getElementById("zona-explorar")?.value || "";
      const provincia = document.getElementById("radar-provincia")?.value || "";
      const pais = document.getElementById("radar-pais")?.value || "";
      destino = [localidad, provincia, pais].filter(Boolean).join(", ");
    }

    destinoRadarComunitario = destino.trim();
    modoListadoPerfiles = "radar";

    try {
      setItem("hm_radar_destino", destinoRadarComunitario);
    } catch (error) {
      console.warn("No se pudo guardar el destino del Radar:", error);
    }
  }

  function manejarMostrarDirectorio(evento) {
    const detalle = evento?.detail || {};
    if (detalle.modo === "radar") {
      cargarRadarComunitario(detalle.destino ?? destinoRadarComunitario);
    } else {
      cargarDirectorioComunidad();
    }
  }

  async function manejarOnline() {
    await sincronizarPublicacionesPendientes();
    cargarPublicacionesRemotas();
    if (modoListadoPerfiles === "directorio") {
      cargarDirectorioComunidad();
    } else {
      cargarRadarComunitario(destinoRadarComunitario);
    }
  }

  function manejarOffline() {
    if (estadoPublicacion) {
      estadoPublicacion.textContent =
        "Sin conexión. Las publicaciones disponibles en caché siguen visibles.";
    }
  }

  function manejarCambioAuth() {
    perfilFiltroActivo = null;
    perfilFiltroNombre = "";
    cargarPublicacionesRemotas();
    if (modoListadoPerfiles === "radar") {
      cargarRadarComunitario(destinoRadarComunitario);
    } else {
      cargarDirectorioComunidad();
    }
  }

  form?.addEventListener("submit", publicar);

  function manejarClickOfrezco() {
    seleccionarTipoFicha("oferta");
  }

  function manejarClickNecesito() {
    seleccionarTipoFicha("necesidad");
  }

  botonFichaOfrezco?.addEventListener("click", manejarClickOfrezco);
  botonFichaNecesito?.addEventListener("click", manejarClickNecesito);
  tipoInput?.addEventListener("change", manejarTipoPublicacionCambio);

  categoriaInput?.addEventListener(
    "change",
    manejarCategoriaCambio
  );
  tituloInput?.addEventListener("input", actualizarAvisoMedicamentos);
  detalleInput?.addEventListener("input", actualizarAvisoMedicamentos);

  buscarPublicacionesBtn?.addEventListener(
    "click",
    manejarBuscarPublicaciones
  );

  actualizarRedBtn?.addEventListener(
    "click",
    manejarActualizarRed
  );

  limpiarFiltrosBtn?.addEventListener(
    "click",
    limpiarFiltros
  );

  botonUbicacionPublicacion?.addEventListener(
    "click",
    usarUbicacionEnPublicacion
  );

  busquedaInput?.addEventListener(
    "keydown",
    (evento) => {
      if (evento.key === "Enter") {
        evento.preventDefault();
        cargarPublicacionesRemotas();
      }
    }
  );

  filtroTipoInput?.addEventListener(
    "change",
    manejarFiltroCambio
  );

  filtroOfflineActivoInput?.addEventListener(
    "change",
    manejarFiltroCambio
  );

  botonActualizarVecinos?.addEventListener(
    "click",
    manejarActualizarVecinos
  );

  botonQuitarFiltroVecino?.addEventListener(
    "click",
    quitarFiltroVecino
  );

  window.addEventListener(
    "buscarRadarComunitario",
    manejarModoRadar
  );

  window.addEventListener(
    "mostrarDirectorioComunidad",
    manejarMostrarDirectorio
  );

  window.addEventListener("online", manejarOnline);
  window.addEventListener("offline", manejarOffline);

  function manejarPublicacionActualizada() {
    if (destruido) return;
    cargarPublicacionesRemotas();
    if (modoListadoPerfiles === "directorio") {
      cargarDirectorioComunidad();
    } else {
      cargarRadarComunitario(destinoRadarComunitario);
    }
  }

  window.addEventListener("publicacionComunidadActualizada", manejarPublicacionActualizada);
  window.addEventListener("perfilComunidadActualizado", manejarPublicacionActualizada);

  try {
    const destinoGuardadoRadar = getItem("hm_radar_destino", "");
    destinoRadarComunitario =
      destinoGuardadoRadar && typeof destinoGuardadoRadar === "object"
        ? [
            destinoGuardadoRadar.localidad,
            destinoGuardadoRadar.provincia,
            destinoGuardadoRadar.pais
          ].filter(Boolean).join(", ")
        : String(destinoGuardadoRadar || "");
  } catch (error) {
    console.warn("No se pudo recuperar el destino del Radar:", error);
  }

  try {
    const resultadoAuth = supabase.auth.onAuthStateChange(
      () => {
        if (!destruido) {
          manejarCambioAuth();
        }
      }
    );

    suscripcionAuth =
      resultadoAuth?.data?.subscription || null;
  } catch (error) {
    console.warn(
      "No se pudo activar la actualización por autenticación:",
      error
    );
  }

  actualizarCampoOtraCategoria();
  actualizarSelectorFicha();
  actualizarAvisoMedicamentos();

  sincronizarPublicacionesPendientes().finally(() => {
    if (!destruido) cargarPublicacionesRemotas();
  });
  cargarDirectorioComunidad();

  return {
    cargarPublicaciones: cargarPublicacionesRemotas,
    cargarVecinos: cargarDirectorioComunidad,
    cargarDirectorioComunidad,
    cargarRadarComunitario,

    destruir() {
      destruido = true;
      ultimaCarga++;

      form?.removeEventListener("submit", publicar);

      botonFichaOfrezco?.removeEventListener("click", manejarClickOfrezco);
      botonFichaNecesito?.removeEventListener("click", manejarClickNecesito);
      tipoInput?.removeEventListener("change", manejarTipoPublicacionCambio);

      categoriaInput?.removeEventListener(
        "change",
        manejarCategoriaCambio
      );
      tituloInput?.removeEventListener("input", actualizarAvisoMedicamentos);
      detalleInput?.removeEventListener("input", actualizarAvisoMedicamentos);

      buscarPublicacionesBtn?.removeEventListener(
        "click",
        manejarBuscarPublicaciones
      );

      actualizarRedBtn?.removeEventListener(
        "click",
        manejarActualizarRed
      );

      limpiarFiltrosBtn?.removeEventListener(
        "click",
        limpiarFiltros
      );

      botonUbicacionPublicacion?.removeEventListener(
        "click",
        usarUbicacionEnPublicacion
      );

      filtroTipoInput?.removeEventListener(
        "change",
        manejarFiltroCambio
      );

      filtroOfflineActivoInput?.removeEventListener(
        "change",
        manejarFiltroCambio
      );

      botonActualizarVecinos?.removeEventListener(
        "click",
        manejarActualizarVecinos
      );

      botonQuitarFiltroVecino?.removeEventListener(
        "click",
        quitarFiltroVecino
      );

      document.removeEventListener("click", manejarClickContacto);
      document.removeEventListener("click", manejarInicioIntercambioDesdeCard);
      document.removeEventListener("click", manejarRetiroPublicacion);

      btnConfirmarWsp?.removeEventListener(
        "click",
        confirmarContactoWsp
      );

      btnCancelarWsp?.removeEventListener(
        "click",
        cancelarContactoWsp
      );

      window.removeEventListener(
        "buscarRadarComunitario",
        manejarModoRadar
      );

      window.removeEventListener(
        "mostrarDirectorioComunidad",
        manejarMostrarDirectorio
      );

      window.removeEventListener("online", manejarOnline);
      window.removeEventListener("offline", manejarOffline);
      window.removeEventListener("publicacionComunidadActualizada", manejarPublicacionActualizada);
      window.removeEventListener("perfilComunidadActualizado", manejarPublicacionActualizada);

      if (suscripcionAuth) {
        suscripcionAuth.unsubscribe();
        suscripcionAuth = null;
      }

      if (dbMatrixInstance) {
        dbMatrixInstance.close();
        dbMatrixInstance = null;
      }
    }
  };
}
