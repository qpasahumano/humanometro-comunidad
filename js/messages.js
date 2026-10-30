import { supabase } from "./supabase.js";
import { obtenerUsuarioActual, obtenerPerfilActual } from "./auth.js";

const STORAGE_KEY = "hm_mensajes_pendientes";
const MATRIX_CONFIG = {
  DB_NAME: 'HumanometroComunidadDB',
  DB_VERSION: 1,
  STORE_MENSAJES: 'mensajes_pendientes'
};

export function initMessages({ getItem, setItem, mostrarNotificacion }) {
  const formulario = document.getElementById("form-mensaje");
  const lista = document.getElementById("lista-mensajes");
  const estado = document.getElementById("estado-mensaje");
  const destinatarioInput = document.getElementById("destinatario-mensaje");
  const textoInput = document.getElementById("texto-mensaje");
  const botonEnviar = formulario?.querySelector('button[type="submit"]');

  let dbMatrixInstance = null;

  // --- NÚCLEO MATRIX: INDEXEDDB LOCAL PARA MENSAJES ---
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
        if (!db.objectStoreNames.contains(MATRIX_CONFIG.STORE_MENSAJES)) {
          db.createObjectStore(MATRIX_CONFIG.STORE_MENSAJES, { keyPath: 'id', autoIncrement: true });
        }
      };
    });
  }

  async function guardarMensajeMatrixLocal(mensajeObj) {
    try {
      const db = await abrirMatrixDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction([MATRIX_CONFIG.STORE_MENSAJES], 'readwrite');
        const store = tx.objectStore(MATRIX_CONFIG.STORE_MENSAJES);
        const req = store.add(mensajeObj);
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e.target.error);
      });
    } catch (err) {
      console.warn("Matrix: Falló IndexedDB, usando localStorage fallback", err);
      const mensajes = obtenerMensajesLocales();
      mensajes.push(mensajeObj);
      setItem(STORAGE_KEY, mensajes);
    }
  }

  async function obtenerMensajesMatrixLocales() {
    try {
      const db = await abrirMatrixDB();
      return new Promise((resolve) => {
        const tx = db.transaction([MATRIX_CONFIG.STORE_MENSAJES], 'readonly');
        const store = tx.objectStore(MATRIX_CONFIG.STORE_MENSAJES);
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
      const tx = db.transaction([MATRIX_CONFIG.STORE_MENSAJES], 'readwrite');
      const store = tx.objectStore(MATRIX_CONFIG.STORE_MENSAJES);
      store.delete(id);
    } catch (err) {
      console.warn("Matrix: No se pudo limpiar de IndexedDB", err);
    }
  }

  function obtenerMensajesLocales() {
    const mensajes = getItem(STORAGE_KEY, []);
    return Array.isArray(mensajes) ? mensajes : [];
  }

  function tarjetaMensaje(mensaje, titulo, estadoTexto = "") {
    const tarjeta = document.createElement("article");
    tarjeta.className = "tarjeta-publicacion";
    const encabezado = document.createElement("h4");
    encabezado.textContent = titulo;
    const texto = document.createElement("p");
    texto.textContent = mensaje.contenido || mensaje.texto || "";
    const fecha = document.createElement("small");
    const valorFecha = mensaje.creado_en || mensaje.fecha;
    fecha.textContent = valorFecha
      ? new Date(valorFecha).toLocaleString("es-AR")
      : "";
    tarjeta.append(encabezado, texto, fecha);
    if (estadoTexto) {
      const estadoItem = document.createElement("small");
      estadoItem.textContent = estadoTexto;
      tarjeta.appendChild(estadoItem);
    }
    return tarjeta;
  }

  async function renderizarLocales() {
    if (!lista) return;
    lista.replaceChildren();
    const mensajes = await obtenerMensajesMatrixLocales();
    if (!mensajes.length) {
      const aviso = document.createElement("p");
      aviso.textContent = "No hay mensajes pendientes guardados en este dispositivo.";
      lista.appendChild(aviso);
      return;
    }
    mensajes.slice().reverse().forEach((mensaje) => {
      lista.appendChild(tarjetaMensaje(
        mensaje,
        `Pendiente para: ${mensaje.destinatario || "destinatario sin indicar"}`,
        "Guardado localmente; se enviará automáticamente al recuperar conexión."
      ));
    });
  }

  async function sincronizarColaMensajes() {
    if (!navigator.onLine) return;
    const usuario = await obtenerUsuarioActual();
    if (!usuario) return;

    const mensajes = await obtenerMensajesMatrixLocales();
    if (!mensajes.length) return;

    for (const msg of mensajes) {
      try {
        let destinatarioId = msg.destinatario_id;
        if (!destinatarioId && msg.destinatario) {
          const { data: candidatos } = await supabase
            .from("perfiles")
            .select("id")
            .ilike("nombre_visible", msg.destinatario);
          const coincidencias = (candidatos || []).filter((p) => p.id !== usuario.id);
          if (coincidencias.length === 1) {
            destinatarioId = coincidencias[0].id;
          }
        }

        if (destinatarioId) {
          const { error } = await supabase.from("mensajes").insert({
            remitente_id: usuario.id,
            destinatario_id: destinatarioId,
            contenido: msg.contenido || msg.texto
          });

          if (!error) {
            await limpiarMensajeMatrixLocal(msg.id);
          }
        }
      } catch (err) {
        console.warn("Matrix: Sincronización diferida pospuesta por intermitencia", err);
      }
    }
    await cargarMensajesRemotos();
  }

  async function cargarMensajesRemotos() {
    if (!lista) return;
    const usuario = await obtenerUsuarioActual();
    if (!usuario) {
      await renderizarLocales();
      return;
    }
    try {
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from("mensajes")
          .select("id, remitente_id, destinatario_id, contenido, creado_en")
          .or(`remitente_id.eq.${usuario.id},destinatario_id.eq.${usuario.id}`)
          .order("creado_en", { ascending: false })
          .limit(100);
        if (error) throw error;
        
        lista.replaceChildren();
        if (!data?.length) {
          const aviso = document.createElement("p");
          aviso.textContent = "Todavía no hay conversaciones. Podés escribirle a alguien indicando su nombre visible exacto.";
          lista.appendChild(aviso);
        } else {
          data.forEach((mensaje) => {
            const esEnviado = mensaje.remitente_id === usuario.id;
            lista.appendChild(tarjetaMensaje(
              mensaje,
              esEnviado ? "Mensaje enviado" : "Mensaje recibido",
              esEnviado ? "Enviado desde tu cuenta comunitaria." : "Recibido en tu cuenta comunitaria."
            ));
          });
        }
      } else {
        lista.replaceChildren();
        const aviso = document.createElement("p");
        aviso.textContent = "Sin conexión a internet. Mostrando mensajes en modo red de relevo local.";
        lista.appendChild(aviso);
      }

      const locales = await obtenerMensajesMatrixLocales();
      if (locales.length) {
        const separador = document.createElement("h3");
        separador.textContent = "Mensajes pendientes guardados en este dispositivo";
        lista.appendChild(separador);
        locales.slice().reverse().forEach((mensaje) => {
          lista.appendChild(tarjetaMensaje(mensaje, `Pendiente para: ${mensaje.destinatario || "destinatario sin indicar"}`, "Pendiente de sincronización."));
        });
      }
    } catch (error) {
      console.error("Error cargando mensajes:", error);
      await renderizarLocales();
      if (estado) estado.textContent = "Modo offline activo: mostrando caché y cola local.";
    }
  }

  if (destinatarioInput) {
    destinatarioInput.placeholder = "Nombre visible exacto de la persona";
    destinatarioInput.required = true;
  }
  if (botonEnviar) botonEnviar.textContent = "ENVIAR MENSAJE";

  formulario?.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const texto = textoInput?.value.trim() || "";
    const destinatario = destinatarioInput?.value.trim() || "";
    if (!texto || !destinatario) {
      mostrarNotificacion("Indicá el nombre visible del destinatario y escribí el mensaje.");
      return;
    }

    const usuario = await obtenerUsuarioActual();
    const perfil = await obtenerPerfilActual();
    
    if (!usuario || !perfil || !navigator.onLine) {
      await guardarMensajeMatrixLocal({
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `local-${Date.now()}`,
        destinatario,
        texto,
        contenido: texto,
        fecha: new Date().toISOString(),
        creado_en: new Date().toISOString(),
        estado: "pendiente"
      });
      if (estado) estado.textContent = "Guardado localmente en la red de relevo. Se enviará al restablecer conexión.";
      formulario.reset();
      await renderizarLocales();
      mostrarNotificacion("Mensaje retenido localmente para sincronización diferida.");
      return;
    }

    if (botonEnviar) {
      botonEnviar.disabled = true;
      botonEnviar.textContent = "ENVIANDO…";
    }
    try {
      const { data: candidatos, error: errorPerfil } = await supabase
        .from("perfiles")
        .select("id, nombre_visible")
        .ilike("nombre_visible", destinatario);
      if (errorPerfil) throw errorPerfil;
      const coincidencias = (candidatos || []).filter((p) => p.id !== usuario.id);
      if (coincidencias.length === 0) {
        throw new Error("No encontramos otro perfil con ese nombre visible. Revisá cómo aparece escrito.");
      }
      if (coincidencias.length > 1) {
        throw new Error("Hay más de una persona con ese nombre. Por ahora necesitás pedirle que use un nombre visible único.");
      }
      
      const destinatarioId = coincidencias[0].id;
      const { error } = await supabase.from("mensajes").insert({
        remitente_id: usuario.id,
        destinatario_id: destinatarioId,
        contenido: texto
      });
      if (error) throw error;
      
      formulario.reset();
      if (estado) estado.textContent = `Mensaje enviado a ${coincidencias[0].nombre_visible}.`;
      mostrarNotificacion("Mensaje enviado a la cuenta comunitaria.");
      await cargarMensajesRemotos();
    } catch (error) {
      console.error("Error enviando mensaje, guardando en cola offline...", error);
      await guardarMensajeMatrixLocal({
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `local-${Date.now()}`,
        destinatario,
        texto,
        contenido: texto,
        fecha: new Date().toISOString(),
        creado_en: new Date().toISOString(),
        estado: "pendiente"
      });
      if (estado) estado.textContent = "Red intermitente: guardado localmente en cola Matrix para reintento.";
      mostrarNotificacion("Mensaje retenido localmente por fallo de red.");
      await renderizarLocales();
    } finally {
      if (botonEnviar) {
        botonEnviar.disabled = false;
        botonEnviar.textContent = "ENVIAR MENSAJE";
      }
    }
  });

  window.addEventListener('online', () => {
    sincronizarColaMensajes();
  });

  abrirMatrixDB().then(async () => {
    await renderizarLocales();
    await cargarMensajesRemotos();
    await sincronizarColaMensajes();
  }).catch(async () => {
    await renderizarLocales();
    await cargarMensajesRemotos();
  });

  return { cargarMensajes: cargarMensajesRemotos };
}
