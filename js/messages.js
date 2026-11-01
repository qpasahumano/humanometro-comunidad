import { supabase } from "./supabase.js";
import {
  obtenerUsuarioActual,
  obtenerPerfilActual
} from "./auth.js";

const STORAGE_KEY = "hm_mensajes_pendientes";

const MATRIX_CONFIG = {
  DB_NAME: "HumanometroComunidadDB",
  DB_VERSION: 2,
  STORE_MENSAJES: "mensajes_pendientes",
  STORE_MEDICIONES: "mediciones_pendientes"
};

export function initMessages({
  getItem,
  setItem,
  mostrarNotificacion
}) {
  const formulario = document.getElementById("form-mensaje");
  const lista = document.getElementById("lista-mensajes");
  const estado = document.getElementById("estado-mensaje");
  const destinatarioInput = document.getElementById("destinatario-mensaje");
  const textoInput = document.getElementById("texto-mensaje");
  const botonEnviar = formulario?.querySelector('button[type="submit"]');

  let dbMatrixInstance = null;
  let suscripcionMensajesRealtime = null;
  let destruido = false;
  let chatActivo = null;
  let formularioFichaActivo = null;

  function avisar(mensaje) {
    if (typeof mostrarNotificacion === "function") {
      mostrarNotificacion(mensaje);
    }
  }

  function obtenerUsuario() {
    return obtenerUsuarioActual();
  }

  function escaparHTML(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, (caracter) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[caracter]);
  }

  // --------------------------------------------------
  // BASE LOCAL MATRIX
  // --------------------------------------------------

  function abrirMatrixDB() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB no disponible"));
        return;
      }

      if (dbMatrixInstance) {
        resolve(dbMatrixInstance);
        return;
      }

      const request = indexedDB.open(
        MATRIX_CONFIG.DB_NAME,
        MATRIX_CONFIG.DB_VERSION
      );

      request.onerror = (evento) => {
        reject(evento.target.error);
      };

      request.onsuccess = (evento) => {
        dbMatrixInstance = evento.target.result;
        resolve(dbMatrixInstance);
      };

      request.onupgradeneeded = (evento) => {
        const db = evento.target.result;

        if (!db.objectStoreNames.contains(
          MATRIX_CONFIG.STORE_MENSAJES
        )) {
          db.createObjectStore(
            MATRIX_CONFIG.STORE_MENSAJES,
            { keyPath: "id", autoIncrement: true }
          );
        }

        if (!db.objectStoreNames.contains(
          MATRIX_CONFIG.STORE_MEDICIONES
        )) {
          db.createObjectStore(
            MATRIX_CONFIG.STORE_MEDICIONES,
            { keyPath: "id", autoIncrement: true }
          );
        }
      };
    });
  }

  function obtenerMensajesLocales() {
    const mensajes = getItem(STORAGE_KEY, []);
    return Array.isArray(mensajes) ? mensajes : [];
  }

  async function guardarMensajeMatrixLocal(mensajeObj) {
    try {
      const db = await abrirMatrixDB();

      return await new Promise((resolve, reject) => {
        const tx = db.transaction(
          [MATRIX_CONFIG.STORE_MENSAJES],
          "readwrite"
        );

        const store = tx.objectStore(
          MATRIX_CONFIG.STORE_MENSAJES
        );

        const req = store.add(mensajeObj);

        req.onsuccess = () => resolve(req.result);
        req.onerror = (evento) => reject(evento.target.error);
      });

    } catch (error) {
      console.warn(
        "Matrix: IndexedDB no disponible. Usando almacenamiento local.",
        error
      );

      const mensajes = obtenerMensajesLocales();
      mensajes.push(mensajeObj);
      setItem(STORAGE_KEY, mensajes);
    }
  }

  async function obtenerMensajesMatrixLocales() {
    try {
      const db = await abrirMatrixDB();

      return await new Promise((resolve) => {
        const tx = db.transaction(
          [MATRIX_CONFIG.STORE_MENSAJES],
          "readonly"
        );

        const store = tx.objectStore(
          MATRIX_CONFIG.STORE_MENSAJES
        );

        const req = store.getAll();

        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve(obtenerMensajesLocales());
      });

    } catch {
      return obtenerMensajesLocales();
    }
  }

  async function limpiarMensajeMatrixLocal(id) {
    try {
      const db = await abrirMatrixDB();

      const tx = db.transaction(
        [MATRIX_CONFIG.STORE_MENSAJES],
        "readwrite"
      );

      tx.objectStore(MATRIX_CONFIG.STORE_MENSAJES).delete(id);

    } catch (error) {
      console.warn(
        "Matrix: No se pudo limpiar el mensaje local.",
        error
      );
    }
  }

  async function guardarMedicionLocal(medicionObj) {
    try {
      const db = await abrirMatrixDB();

      return await new Promise((resolve, reject) => {
        const tx = db.transaction(
          [MATRIX_CONFIG.STORE_MEDICIONES],
          "readwrite"
        );

        const store = tx.objectStore(
          MATRIX_CONFIG.STORE_MEDICIONES
        );

        const req = store.add(medicionObj);

        req.onsuccess = () => resolve(req.result);
        req.onerror = (evento) => reject(evento.target.error);
      });

    } catch (error) {
      console.warn(
        "Matrix: No se pudo guardar la medición localmente.",
        error
      );
    }
  }

  async function obtenerMedicionesLocales() {
    try {
      const db = await abrirMatrixDB();

      return await new Promise((resolve) => {
        const tx = db.transaction(
          [MATRIX_CONFIG.STORE_MEDICIONES],
          "readonly"
        );

        const store = tx.objectStore(
          MATRIX_CONFIG.STORE_MEDICIONES
        );

        const req = store.getAll();

        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });

    } catch {
      return [];
    }
  }

  async function limpiarMedicionLocal(id) {
    try {
      const db = await abrirMatrixDB();

      const tx = db.transaction(
        [MATRIX_CONFIG.STORE_MEDICIONES],
        "readwrite"
      );

      tx.objectStore(MATRIX_CONFIG.STORE_MEDICIONES).delete(id);

    } catch (error) {
      console.warn(
        "Matrix: No se pudo limpiar la medición local.",
        error
      );
    }
  }

  // --------------------------------------------------
  // MEDICIÓN DE HUMANIDAD
  // --------------------------------------------------

  async function procesarMedicionHumanidad(
    evaluadoId,
    resultado
  ) {
    const usuario = await obtenerUsuario();

    const medicionData = {
      evaluador_id: usuario?.id || "anon",
      evaluado_id: evaluadoId,
      resultado,
      creado_en: new Date().toISOString()
    };

    if (!navigator.onLine || !usuario) {
      await guardarMedicionLocal(medicionData);

      avisar(
        "Medición registrada localmente. Se sincronizará al recuperar la conexión."
      );

      return;
    }

    try {
      const { error } = await supabase
        .from("mediciones_humanidad")
        .insert({
          evaluador_id: usuario.id,
          evaluado_id: evaluadoId,
          resultado
        });

      if (error) throw error;

      avisar(
        "¡Medición de Humanidad registrada en la comunidad!"
      );

    } catch (error) {
      console.warn(
        "Error enviando medición. Se conserva localmente.",
        error
      );

      await guardarMedicionLocal(medicionData);

      avisar(
        "Medición retenida localmente por falta de conexión."
      );
    }
  }

  function desplegarModalHumanidad(
    otroUsuarioNombre,
    otroUsuarioId
  ) {
    document.getElementById("hm-modal-humanidad")?.remove();

    const modal = document.createElement("div");
    modal.id = "hm-modal-humanidad";

    modal.style.cssText = `
      position:fixed;
      inset:0;
      width:100%;
      height:100%;
      background:rgba(0,0,0,.85);
      display:flex;
      align-items:center;
      justify-content:center;
      z-index:10000;
      padding:16px;
      box-sizing:border-box;
    `;

    const contenido = document.createElement("div");
    contenido.style.cssText = `
      background:#1a1a1a;
      padding:20px;
      border-radius:12px;
      max-width:400px;
      width:100%;
      border:1px solid #333;
      color:#fff;
      text-align:center;
    `;

    const titulo = document.createElement("h3");
    titulo.textContent = "Medición de Humanidad";

    const descripcion = document.createElement("p");
    descripcion.style.cssText = "font-size:.9rem;color:#aaa;";
    descripcion.textContent =
      `¿Cómo fue el trato, el respeto al tiempo y la fidelidad del trueque con ${otroUsuarioNombre}?`;

    const botones = document.createElement("div");
    botones.style.cssText =
      "display:flex;flex-direction:column;gap:10px;margin:20px 0;";

    const opciones = [
      {
        id: "btn-hm-si",
        texto: "SÍ (Respeto, cordialidad y acuerdo cumplido)",
        resultado: "excelente",
        color: "#10b981"
      },
      {
        id: "btn-hm-intermedio",
        texto: "INTERMEDIO (Hubo detalles pero aceptable)",
        resultado: "neutral",
        color: "#f59e0b"
      },
      {
        id: "btn-hm-no",
        texto: "NO (Falta de respeto o incumplimiento)",
        resultado: "deficiente",
        color: "#ef4444"
      },
      {
        id: "btn-hm-extincion",
        texto: "Extinción por mutuo acuerdo (Sin concretar)",
        resultado: "extincion_mutua",
        color: "#333"
      }
    ];

    opciones.forEach((opcion) => {
      const boton = document.createElement("button");

      boton.id = opcion.id;
      boton.type = "button";
      boton.textContent = opcion.texto;

      boton.style.cssText = `
        background:${opcion.color};
        border:1px solid #555;
        padding:12px;
        border-radius:6px;
        color:#fff;
        font-weight:bold;
        cursor:pointer;
      `;

      boton.addEventListener("click", async () => {
        modal.remove();
        await procesarMedicionHumanidad(
          otroUsuarioId,
          opcion.resultado
        );
      });

      botones.appendChild(boton);
    });

    const cerrar = document.createElement("button");
    cerrar.type = "button";
    cerrar.textContent = "Cancelar";
    cerrar.style.cssText =
      "background:transparent;border:0;color:#777;cursor:pointer;";

    cerrar.addEventListener("click", () => modal.remove());

    contenido.append(titulo, descripcion, botones, cerrar);
    modal.appendChild(contenido);
    document.body.appendChild(modal);
  }

  // --------------------------------------------------
  // CHAT PRIVADO DENTRO DE LA FICHA DEL VECINO
  // --------------------------------------------------

  function obtenerFichaVecino(usuarioId) {
    if (!usuarioId) return null;

    const selectores = [
      `[data-perfil-id="${CSS.escape(usuarioId)}"]`,
      `[data-vecino-id="${CSS.escape(usuarioId)}"]`,
      `[data-usuario-id="${CSS.escape(usuarioId)}"]`
    ];

    for (const selector of selectores) {
      const ficha = document.querySelector(selector);
      if (ficha) return ficha;
    }

    return null;
  }

  function crearContenedorChatFicha(ficha, nombre, usuarioId) {
    if (!ficha) return null;

    let contenedor = ficha.querySelector(
      ".hm-chat-privado-ficha"
    );

    if (!contenedor) {
      contenedor = document.createElement("section");
      contenedor.className = "hm-chat-privado-ficha";
      contenedor.setAttribute("aria-label", "Mensajería privada");

      contenedor.style.cssText = `
        margin-top:12px;
        padding:12px;
        border:1px solid rgba(139,217,238,.35);
        border-radius:12px;
        background:rgba(15,23,42,.96);
      `;

      ficha.appendChild(contenedor);
    }

    contenedor.replaceChildren();

    const titulo = document.createElement("h4");
    titulo.textContent = `Conversación privada con ${nombre}`;
    titulo.style.cssText = "margin:0 0 10px;color:#8bd9ee;";

    const estadoChat = document.createElement("p");
    estadoChat.className = "hm-chat-ficha-estado";
    estadoChat.setAttribute("role", "status");
    estadoChat.style.cssText =
      "font-size:.82rem;color:#94a3b8;";

    const mensajes = document.createElement("div");
    mensajes.className = "hm-chat-ficha-mensajes";
    mensajes.style.cssText = `
      display:flex;
      flex-direction:column;
      gap:8px;
      max-height:300px;
      overflow-y:auto;
      padding:6px 0;
    `;

    const form = document.createElement("form");
    form.className = "hm-chat-ficha-form";

    const textarea = document.createElement("textarea");
    textarea.rows = 3;
    textarea.maxLength = 4000;
    textarea.required = true;
    textarea.placeholder = "Escribí tu mensaje privado…";
    textarea.style.cssText = `
      width:100%;
      box-sizing:border-box;
      resize:vertical;
      padding:10px;
      border-radius:8px;
      margin:6px 0;
    `;

    const enviar = document.createElement("button");
    enviar.type = "submit";
    enviar.className = "boton-accion";
    enviar.textContent = "ENVIAR MENSAJE";
    enviar.style.width = "100%";

    const volver = document.createElement("button");
    volver.type = "button";
    volver.className = "boton-secundario";
    volver.textContent = "← VOLVER A LA COMUNIDAD";
    volver.style.cssText =
      "width:100%;margin-top:8px;";

    volver.addEventListener("click", () => {
      contenedor.remove();
      chatActivo = null;
      formularioFichaActivo = null;

      window.dispatchEvent(
        new CustomEvent("volverAComunidad")
      );

      ficha.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    });

    form.append(textarea, enviar, volver);

    contenedor.append(
      titulo,
      estadoChat,
      mensajes,
      form
    );

    chatActivo = {
      ficha,
      contenedor,
      mensajes,
      estado: estadoChat,
      textarea,
      enviar,
      usuarioId,
      nombre
    };

    formularioFichaActivo = form;

    form.addEventListener("submit", async (evento) => {
      evento.preventDefault();

      const texto = textarea.value.trim();
      if (!texto) return;

      const usuario = await obtenerUsuario();

      if (!usuario) {
        estadoChat.textContent =
          "Iniciá sesión para enviar mensajes privados.";
        return;
      }

      if (usuario.id === usuarioId) {
        estadoChat.textContent =
          "No podés enviarte mensajes a tu propia cuenta.";
        return;
      }

      enviar.disabled = true;
      enviar.textContent = "ENVIANDO…";

      try {
        if (!navigator.onLine) {
          await guardarMensajeMatrixLocal({
            id: generarIdLocal(),
            destinatario_id: usuarioId,
            destinatario: nombre,
            texto,
            contenido: texto,
            creado_en: new Date().toISOString(),
            estado: "pendiente"
          });

          textarea.value = "";
          estadoChat.textContent =
            "Mensaje guardado en este dispositivo. Se sincronizará al recuperar conexión.";

          await cargarChatFicha(usuarioId, nombre, mensajes);
          return;
        }

        const { error } = await supabase
          .from("mensajes")
          .insert({
            emisor_id: usuario.id,
            receptor_id: usuarioId,
            contenido: texto
          });

        if (error) throw error;

        textarea.value = "";
        estadoChat.textContent = "Mensaje enviado correctamente.";

        await cargarChatFicha(usuarioId, nombre, mensajes);

      } catch (error) {
        console.error("Error enviando mensaje privado:", error);

        await guardarMensajeMatrixLocal({
          id: generarIdLocal(),
          destinatario_id: usuarioId,
          destinatario: nombre,
          texto,
          contenido: texto,
          creado_en: new Date().toISOString(),
          estado: "pendiente"
        });

        textarea.value = "";
        estadoChat.textContent =
          "No se pudo enviar ahora. El mensaje quedó guardado localmente.";
      } finally {
        enviar.disabled = false;
        enviar.textContent = "ENVIAR MENSAJE";
      }
    });

    return contenedor;
  }

  function generarIdLocal() {
    return typeof crypto !== "undefined" &&
      crypto.randomUUID
      ? crypto.randomUUID()
      : `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function cargarChatFicha(
    usuarioId,
    nombre,
    contenedorMensajes
  ) {
    const usuario = await obtenerUsuario();

    if (!usuario || !contenedorMensajes) return;

    contenedorMensajes.replaceChildren();

    if (!navigator.onLine) {
      const aviso = document.createElement("p");
      aviso.textContent =
        "Sin conexión. Los mensajes pendientes se conservan en este dispositivo.";
      contenedorMensajes.appendChild(aviso);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("mensajes")
        .select("id, emisor_id, receptor_id, contenido, creado_en")
        .or(
          `and(emisor_id.eq.${usuario.id},receptor_id.eq.${usuarioId}),and(emisor_id.eq.${usuarioId},receptor_id.eq.${usuario.id})`
        )
        .order("creado_en", { ascending: true })
        .limit(100);

      if (error) throw error;

      if (!data?.length) {
        const aviso = document.createElement("p");
        aviso.textContent =
          "Todavía no hay mensajes. Podés iniciar la conversación.";
        contenedorMensajes.appendChild(aviso);
        return;
      }

      data.forEach((mensaje) => {
        const propio = mensaje.emisor_id === usuario.id;

        const burbuja = document.createElement("div");
        burbuja.style.cssText = `
          align-self:${propio ? "flex-end" : "flex-start"};
          max-width:88%;
          padding:9px 11px;
          border-radius:10px;
          background:${propio ? "#164e63" : "#263449"};
          color:#fff;
          overflow-wrap:anywhere;
        `;

        const texto = document.createElement("p");
        texto.textContent = mensaje.contenido || "";
        texto.style.margin = "0";

        const fecha = document.createElement("small");
        fecha.style.cssText =
          "display:block;margin-top:5px;color:#cbd5e1;font-size:.7rem;";

        fecha.textContent = mensaje.creado_en
          ? new Date(mensaje.creado_en).toLocaleString("es-AR")
          : "";

        burbuja.append(texto, fecha);
        contenedorMensajes.appendChild(burbuja);
      });

      contenedorMensajes.scrollTop =
        contenedorMensajes.scrollHeight;

    } catch (error) {
      console.error("No se pudo cargar el chat de la ficha:", error);

      const aviso = document.createElement("p");
      aviso.textContent =
        "No se pudo actualizar la conversación. Intentá nuevamente.";
      contenedorMensajes.appendChild(aviso);
    }
  }

  async function abrirChatEnFicha(nombreVisible, usuarioId, ficha) {
    if (!usuarioId) {
      avisar("No se identificó la cuenta del vecino.");
      return;
    }

    const usuario = await obtenerUsuario();

    if (!usuario) {
      avisar("Iniciá sesión para contactar a otros vecinos.");
      return;
    }

    if (usuario.id === usuarioId) {
      avisar("Esta es tu propia ficha.");
      return;
    }

    const fichaEncontrada =
      ficha || obtenerFichaVecino(usuarioId);

    if (!fichaEncontrada) {
      avisar(
        "No se encontró la ficha del vecino para abrir la conversación."
      );
      return;
    }

    const contenedor = crearContenedorChatFicha(
      fichaEncontrada,
      nombreVisible || "Vecino",
      usuarioId
    );

    if (!contenedor) return;

    await cargarChatFicha(
      usuarioId,
      nombreVisible || "Vecino",
      contenedor.querySelector(".hm-chat-ficha-mensajes")
    );

    contenedor.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    contenedor.querySelector("textarea")?.focus();
  }

  // Función global usada por las fichas de vecinos.
  window.abrirChatConVecino = function(
    nombreVisible,
    usuarioId,
    ficha
  ) {
    abrirChatEnFicha(
      nombreVisible,
      usuarioId,
      ficha
    );
  };

  // Evento para integración con las tarjetas del directorio.
  function manejarAperturaChatFicha(evento) {
    const detalle = evento.detail || {};

    abrirChatEnFicha(
      detalle.nombre || detalle.nombreVisible,
      detalle.usuarioId || detalle.perfilId || detalle.id,
      detalle.ficha || detalle.contenedor
    );
  }

  window.addEventListener(
    "abrirChatEnFicha",
    manejarAperturaChatFicha
  );

  // --------------------------------------------------
  // MENSAJES GENERALES Y COLA LOCAL
  // --------------------------------------------------

  function tarjetaMensaje(
    mensaje,
    titulo,
    estadoTexto = "",
    contraparteId = null,
    contraparteNombre = ""
  ) {
    const tarjeta = document.createElement("article");
    tarjeta.className = "tarjeta-publicacion";

    const encabezado = document.createElement("h4");
    encabezado.textContent = titulo;

    const texto = document.createElement("p");
    texto.textContent =
      mensaje.contenido || mensaje.texto || "";

    const fecha = document.createElement("small");
    const valorFecha = mensaje.creado_en || mensaje.fecha;

    fecha.textContent = valorFecha
      ? new Date(valorFecha).toLocaleString("es-AR")
      : "";

    tarjeta.append(encabezado, texto, fecha);

    if (estadoTexto) {
      const estadoItem = document.createElement("small");
      estadoItem.style.display = "block";
      estadoItem.textContent = estadoTexto;
      tarjeta.appendChild(estadoItem);
    }

    if (contraparteId && contraparteNombre) {
      const botonMedir = document.createElement("button");

      botonMedir.className = "boton-secundario";
      botonMedir.style.cssText =
        "margin-top:8px;width:100%;font-size:.85rem;cursor:pointer;";

      botonMedir.textContent =
        `Medir Humanidad de ${contraparteNombre}`;

      botonMedir.addEventListener("click", () => {
        desplegarModalHumanidad(
          contraparteNombre,
          contraparteId
        );
      });

      tarjeta.appendChild(botonMedir);
    }

    return tarjeta;
  }

  async function renderizarLocales() {
    if (!lista) return;

    lista.replaceChildren();

    const mensajes = await obtenerMensajesMatrixLocales();

    if (!mensajes.length) {
      const aviso = document.createElement("p");
      aviso.textContent =
        "No hay mensajes pendientes guardados en este dispositivo.";

      lista.appendChild(aviso);
      return;
    }

    mensajes.slice().reverse().forEach((mensaje) => {
      lista.appendChild(
        tarjetaMensaje(
          mensaje,
          `Pendiente para: ${mensaje.destinatario || "destinatario sin indicar"}`,
          "Guardado localmente; se enviará al recuperar conexión."
        )
      );
    });
  }

  async function sincronizarColaMensajes() {
    if (!navigator.onLine) return;

    const usuario = await obtenerUsuario();
    if (!usuario) return;

    const mensajes = await obtenerMensajesMatrixLocales();

    for (const mensaje of mensajes) {
      try {
        let destinatarioId = mensaje.destinatario_id;

        if (!destinatarioId && mensaje.destinatario) {
          const { data: candidatos, error } = await supabase
            .from("perfiles")
            .select("id")
            .ilike("nombre_visible", mensaje.destinatario);

          if (error) throw error;

          const coincidencias = (candidatos || []).filter(
            (perfil) => perfil.id !== usuario.id
          );

          if (coincidencias.length === 1) {
            destinatarioId = coincidencias[0].id;
          }
        }

        if (!destinatarioId) continue;

        const { error } = await supabase
          .from("mensajes")
          .insert({
            emisor_id: usuario.id,
            receptor_id: destinatarioId,
            contenido: mensaje.contenido || mensaje.texto
          });

        if (!error) {
          await limpiarMensajeMatrixLocal(mensaje.id);
        }

      } catch (error) {
        console.warn(
          "Matrix: Sincronización de mensaje pendiente pospuesta.",
          error
        );
      }
    }

    const mediciones = await obtenerMedicionesLocales();

    for (const medicion of mediciones) {
      try {
        const { error } = await supabase
          .from("mediciones_humanidad")
          .insert({
            evaluador_id: usuario.id,
            evaluado_id: medicion.evaluado_id,
            resultado: medicion.resultado
          });

        if (error) throw error;

        await limpiarMedicionLocal(medicion.id);

      } catch (error) {
        console.warn(
          "Matrix: No se pudo sincronizar la medición pendiente.",
          error
        );
      }
    }

    await cargarMensajesRemotos();
  }

  async function cargarMensajesRemotos() {
    if (!lista) return;

    const usuario = await obtenerUsuario();

    if (!usuario) {
      await renderizarLocales();
      return;
    }

    if (!navigator.onLine) {
      await renderizarLocales();
      return;
    }

    try {
      const { data, error } = await supabase
        .from("mensajes")
        .select(
          "id, emisor_id, receptor_id, contenido, creado_en"
        )
        .or(
          `emisor_id.eq.${usuario.id},receptor_id.eq.${usuario.id}`
        )
        .order("creado_en", { ascending: false })
        .limit(100);

      if (error) throw error;

      lista.replaceChildren();

      if (!data?.length) {
        const aviso = document.createElement("p");
        aviso.textContent =
          "Todavía no hay conversaciones. Podés contactar a alguien desde su ficha en Comunidad.";

        lista.appendChild(aviso);

      } else {
        const ids = [
          ...new Set(
            data.map((mensaje) =>
              mensaje.emisor_id === usuario.id
                ? mensaje.receptor_id
                : mensaje.emisor_id
            )
          )
        ];

        let perfilesPorId = {};

        if (ids.length) {
          const { data: perfiles, error: errorPerfiles } =
            await supabase
              .from("perfiles")
              .select("id, nombre_visible")
              .in("id", ids);

          if (errorPerfiles) throw errorPerfiles;

          (perfiles || []).forEach((perfil) => {
            perfilesPorId[perfil.id] = perfil.nombre_visible;
          });
        }

        data.forEach((mensaje) => {
          const esEnviado = mensaje.emisor_id === usuario.id;

          const contraparteId = esEnviado
            ? mensaje.receptor_id
            : mensaje.emisor_id;

          const contraparteNombre =
            perfilesPorId[contraparteId] || "Vecino";

          lista.appendChild(
            tarjetaMensaje(
              mensaje,
              esEnviado
                ? `Mensaje enviado a ${contraparteNombre}`
                : `Mensaje recibido de ${contraparteNombre}`,
              esEnviado
                ? "Enviado desde tu cuenta comunitaria."
                : "Recibido en tu cuenta comunitaria.",
              contraparteId,
              contraparteNombre
            )
          );
        });
      }

      const locales = await obtenerMensajesMatrixLocales();

      if (locales.length) {
        const separador = document.createElement("h3");
        separador.textContent =
          "Mensajes pendientes guardados en este dispositivo";

        lista.appendChild(separador);

        locales.slice().reverse().forEach((mensaje) => {
          lista.appendChild(
            tarjetaMensaje(
              mensaje,
              `Pendiente para: ${mensaje.destinatario || "destinatario sin indicar"}`,
              "Pendiente de sincronización."
            )
          );
        });
      }

    } catch (error) {
      console.error("Error cargando mensajes:", error);

      await renderizarLocales();

      if (estado) {
        estado.textContent =
          "Modo offline activo: mostrando caché y cola local.";
      }
    }
  }

  // --------------------------------------------------
  // SUPABASE REALTIME
  // --------------------------------------------------

  async function configurarSuscripcionRealtimeMensajes() {
    try {
      const usuario = await obtenerUsuario();

      if (!usuario || destruido) return;

      if (suscripcionMensajesRealtime) {
        await supabase.removeChannel(
          suscripcionMensajesRealtime
        );
      }

      suscripcionMensajesRealtime = supabase
        .channel("mensajes-privados-realtime")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "mensajes",
            filter: `receptor_id.eq.${usuario.id}`
          },
          async () => {
            if (destruido) return;

            await cargarMensajesRemotos();

            if (chatActivo) {
              await cargarChatFicha(
                chatActivo.usuarioId,
                chatActivo.nombre,
                chatActivo.mensajes
              );
            }
          }
        )
        .subscribe();

    } catch (error) {
      console.warn(
        "No se pudo activar la sincronización Realtime:",
        error
      );
    }
  }

  // --------------------------------------------------
  // FORMULARIO GENERAL EXISTENTE
  // --------------------------------------------------

  if (destinatarioInput) {
    destinatarioInput.placeholder =
      "Nombre visible exacto de la persona";

    destinatarioInput.required = true;
  }

  if (botonEnviar) {
    botonEnviar.textContent = "ENVIAR MENSAJE";
  }

  formulario?.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const texto = textoInput?.value.trim() || "";
    const destinatario =
      destinatarioInput?.value.trim() || "";

    if (!texto || !destinatario) {
      avisar(
        "Indicá el nombre visible del destinatario y escribí el mensaje."
      );
      return;
    }

    const usuario = await obtenerUsuario();
    const perfil = await obtenerPerfilActual();

    let destinatarioId =
      destinatarioInput.getAttribute(
        "data-destinatario-id"
      );

    if (!usuario || !perfil || !navigator.onLine) {
      await guardarMensajeMatrixLocal({
        id: generarIdLocal(),
        destinatario,
        destinatario_id: destinatarioId || null,
        texto,
        contenido: texto,
        fecha: new Date().toISOString(),
        creado_en: new Date().toISOString(),
        estado: "pendiente"
      });

      if (estado) {
        estado.textContent =
          "Guardado localmente. Se enviará al recuperar conexión.";
      }

      formulario.reset();
      destinatarioInput.removeAttribute(
        "data-destinatario-id"
      );

      await renderizarLocales();

      avisar(
        "Mensaje retenido localmente para sincronización diferida."
      );

      return;
    }

    if (botonEnviar) {
      botonEnviar.disabled = true;
      botonEnviar.textContent = "ENVIANDO…";
    }

    try {
      if (!destinatarioId) {
        const { data: candidatos, error } = await supabase
          .from("perfiles")
          .select("id, nombre_visible")
          .ilike("nombre_visible", destinatario);

        if (error) throw error;

        const coincidencias = (candidatos || []).filter(
          (perfilEncontrado) =>
            perfilEncontrado.id !== usuario.id
        );

        if (coincidencias.length === 0) {
          throw new Error(
            "No encontramos otro perfil con ese nombre visible. Revisá cómo aparece escrito."
          );
        }

        if (coincidencias.length > 1) {
          throw new Error(
            "Hay más de una persona con ese nombre. Necesitás identificar el perfil correcto desde Comunidad."
          );
        }

        destinatarioId = coincidencias[0].id;
      }

      const { error } = await supabase
        .from("mensajes")
        .insert({
          emisor_id: usuario.id,
          receptor_id: destinatarioId,
          contenido: texto
        });

      if (error) throw error;

      formulario.reset();

      destinatarioInput.removeAttribute(
        "data-destinatario-id"
      );

      if (estado) {
        estado.textContent = "Mensaje enviado correctamente.";
      }

      avisar("Mensaje enviado a la cuenta comunitaria.");

      await cargarMensajesRemotos();

    } catch (error) {
      console.error("Error enviando mensaje:", error);

      await guardarMensajeMatrixLocal({
        id: generarIdLocal(),
        destinatario,
        destinatario_id: destinatarioId || null,
        texto,
        contenido: texto,
        fecha: new Date().toISOString(),
        creado_en: new Date().toISOString(),
        estado: "pendiente"
      });

      if (estado) {
        estado.textContent =
          "Red intermitente: mensaje guardado localmente para reintento.";
      }

      avisar(
        "Mensaje retenido localmente por fallo de conexión."
      );

      await renderizarLocales();

    } finally {
      if (botonEnviar) {
        botonEnviar.disabled = false;
        botonEnviar.textContent = "ENVIAR MENSAJE";
      }
    }
  });

  // --------------------------------------------------
  // RECUPERACIÓN DE CONEXIÓN Y ARRANQUE
  // --------------------------------------------------

  async function manejarConexionRestablecida() {
    await sincronizarColaMensajes();
  }

  window.addEventListener(
    "online",
    manejarConexionRestablecida
  );

  abrirMatrixDB()
    .then(async () => {
      await renderizarLocales();
      await cargarMensajesRemotos();
      await sincronizarColaMensajes();
      await configurarSuscripcionRealtimeMensajes();
    })
    .catch(async (error) => {
      console.warn(
        "No se pudo iniciar IndexedDB. Se usará almacenamiento alternativo.",
        error
      );

      await renderizarLocales();
      await cargarMensajesRemotos();
    });

  return {
    cargarMensajes: cargarMensajesRemotos,

    abrirChatConVecino: abrirChatEnFicha,

    destruir() {
      destruido = true;

      window.removeEventListener(
        "online",
        manejarConexionRestablecida
      );

      window.removeEventListener(
        "abrirChatEnFicha",
        manejarAperturaChatFicha
      );

      if (suscripcionMensajesRealtime) {
        supabase.removeChannel(
          suscripcionMensajesRealtime
        );

        suscripcionMensajesRealtime = null;
      }

      if (dbMatrixInstance) {
        dbMatrixInstance.close();
        dbMatrixInstance = null;
      }

      chatActivo = null;
      formularioFichaActivo = null;
    }
  };
}
