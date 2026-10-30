import { supabase } from "./supabase.js";
import { obtenerUsuarioActual, obtenerPerfilActual } from "./auth.js";

const STORAGE_KEY = "hm_mensajes_pendientes";
const MATRIX_CONFIG = {
  DB_NAME: 'HumanometroComunidadDB',
  DB_VERSION: 2,
  STORE_MENSAJES: 'mensajes_pendientes',
  STORE_MEDICIONES: 'mediciones_pendientes'
};

export function initMessages({ getItem, setItem, mostrarNotificacion }) {
  const formulario = document.getElementById("form-mensaje");
  const lista = document.getElementById("lista-mensajes");
  const estado = document.getElementById("estado-mensaje");
  const destinatarioInput = document.getElementById("destinatario-mensaje");
  const textoInput = document.getElementById("texto-mensaje");
  const botonEnviar = formulario?.querySelector('button[type="submit"]');

  let dbMatrixInstance = null;

  // --- NÚCLEO MATRIX: INDEXEDDB LOCAL PARA MENSAJES Y MEDICIONES ---
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
        if (!db.objectStoreNames.contains(MATRIX_CONFIG.STORE_MEDICIONES)) {
          db.createObjectStore(MATRIX_CONFIG.STORE_MEDICIONES, { keyPath: 'id', autoIncrement: true });
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

  // --- SUB-MÓDULO DE MEDICIÓN DE HUMANIDAD (OFFLINE / ONLINE) ---
  async function guardarMedicionLocal(medicionObj) {
    try {
      const db = await abrirMatrixDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction([MATRIX_CONFIG.STORE_MEDICIONES], 'readwrite');
        const store = tx.objectStore(MATRIX_CONFIG.STORE_MEDICIONES);
        const req = store.add(medicionObj);
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e.target.error);
      });
    } catch (err) {
      console.warn("Matrix: No se pudo guardar la medición localmente", err);
    }
  }

  async function obtenerMedicionesLocales() {
    try {
      const db = await abrirMatrixDB();
      return new Promise((resolve) => {
        const tx = db.transaction([MATRIX_CONFIG.STORE_MEDICIONES], 'readonly');
        const store = tx.objectStore(MATRIX_CONFIG.STORE_MEDICIONES);
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
      const tx = db.transaction([MATRIX_CONFIG.STORE_MEDICIONES], 'readwrite');
      const store = tx.objectStore(MATRIX_CONFIG.STORE_MEDICIONES);
      store.delete(id);
    } catch (err) {
      console.warn("Matrix: No se pudo limpiar la medición de IndexedDB", err);
    }
  }

  async function procesarMedicionHumanidad(evaluadoId, resultado) {
    const usuario = await obtenerUsuarioActual();
    const medicionData = {
      evaluador_id: usuario?.id || "anon",
      evaluado_id: evaluadoId,
      resultado: resultado,
      creado_en: new Date().toISOString()
    };

    if (!navigator.onLine || !usuario) {
      await guardarMedicionLocal(medicionData);
      mostrarNotificacion("Medición de Humanidad registrada localmente. Se sincronizará al volver la red.");
      return;
    }

    try {
      const { data: perfil } = await supabase
        .from("perfiles")
        .select("nivel_humanidad")
        .eq("id", evaluadoId)
        .maybeSingle();

      let actual = perfil?.nivel_humanidad ?? 100;
      if (resultado === "excelente") actual = Math.min(100, actual + 3);
      if (resultado === "deficiente") actual = Math.max(0, actual - 8);

      await supabase.from("mediciones_humanidad").insert({
        evaluador_id: usuario.id,
        evaluado_id: evaluadoId,
        resultado: resultado
      });

      await supabase
        .from("perfiles")
        .update({ nivel_humanidad: actual })
        .eq("id", evaluadoId);

      mostrarNotificacion("¡Medición de Humanidad registrada en la comunidad!");
    } catch (err) {
      console.warn("Error enviando medición a Supabase, guardando localmente...", err);
      await guardarMedicionLocal(medicionData);
      mostrarNotificacion("Medición retenida localmente por falta de conexión.");
    }
  }

  function desplegarModalHumanidad(otroUsuarioNombre, otroUsuarioId) {
    let modalExistente = document.getElementById("hm-modal-humanidad");
    if (modalExistente) modalExistente.remove();

    const modal = document.createElement("div");
    modal.id = "hm-modal-humanidad";
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.85); display: flex; align-items: center;
      justify-content: center; z-index: 10000; padding: 16px; box-sizing: border-box;
    `;

    modal.innerHTML = `
      <div style="background: #1a1a1a; padding: 20px; border-radius: 12px; max-width: 400px; width: 100%; border: 1px solid #333; color: #fff; text-align: center;">
        <h3 style="margin-top: 0;">Medición de Humanidad</h3>
        <p style="font-size: 0.9rem; color: #aaa;">
          ¿Cómo fue el trato, el respeto al tiempo y la fidelidad del trueque con <strong>${otroUsuarioNombre}</strong>?
        </p>

        <div style="display: flex; flex-direction: column; gap: 10px; margin: 20px 0;">
          <button id="btn-hm-si" style="background: #10b981; border: none; padding: 12px; border-radius: 6px; color: #fff; font-weight: bold; cursor: pointer;">
            SÍ (Respeto, cordialidad y acuerdo cumplido)
          </button>
          <button id="btn-hm-intermedio" style="background: #f59e0b; border: none; padding: 12px; border-radius: 6px; color: #fff; font-weight: bold; cursor: pointer;">
            INTERMEDIO (Hubo detalles pero aceptable)
          </button>
          <button id="btn-hm-no" style="background: #ef4444; border: none; padding: 12px; border-radius: 6px; color: #fff; font-weight: bold; cursor: pointer;">
            NO (Falta de respeto o incumplimiento)
          </button>
          <hr style="border: 0; border-top: 1px solid #333; margin: 10px 0;">
          <button id="btn-hm-extincion" style="background: #333; border: 1px solid #555; padding: 10px; border-radius: 6px; color: #ccc; cursor: pointer;">
            Extinción por mutuo acuerdo (Sin concretar)
          </button>
        </div>

        <button id="btn-hm-cerrar" style="background: transparent; border: none; color: #777; cursor: pointer; font-size: 0.85rem;">
          Cancelar
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    const ejecutar = async (res) => {
      modal.remove();
      await procesarMedicionHumanidad(otroUsuarioId, res);
    };

    document.getElementById("btn-hm-si").onclick = () => ejecutar("excelente");
    document.getElementById("btn-hm-intermedio").onclick = () => ejecutar("neutral");
    document.getElementById("btn-hm-no").onclick = () => ejecutar("deficiente");
    document.getElementById("btn-hm-extincion").onclick = () => ejecutar("extincion_mutua");
    document.getElementById("btn-hm-cerrar").onclick = () => modal.remove();
  }

  // --- APERTURA AUTOMÁTICA DESDE LA GÓNDOLA ---
  window.abrirChatConVecino = function(nombreVisible, usuarioId) {
    if (destinatarioInput) {
      destinatarioInput.value = nombreVisible || "";
      if (usuarioId) {
        destinatarioInput.setAttribute("data-destinatario-id", usuarioId);
      }
    }
    const seccionForm = document.getElementById("form-mensaje") || document.getElementById("seccion-mensajes");
    if (seccionForm) {
      seccionForm.scrollIntoView({ behavior: "smooth" });
    }
    if (textoInput) {
      textoInput.focus();
    }
  };

  function obtenerMensajesLocales() {
    const mensajes = getItem(STORAGE_KEY, []);
    return Array.isArray(mensajes) ? mensajes : [];
  }

  function tarjetaMensaje(mensaje, titulo, estadoTexto = "", contraparteId = null, contraparteNombre = "") {
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
      estadoItem.style.display = "block";
      estadoItem.textContent = estadoTexto;
      tarjeta.appendChild(estadoItem);
    }

    if (contraparteId && contraparteNombre) {
      const btnMedir = document.createElement("button");
      btnMedir.className = "boton-secundario";
      btnMedir.style.cssText = "margin-top: 8px; width: 100%; font-size: 0.85rem; cursor: pointer;";
      btnMedir.textContent = `Medir Humanidad de ${contraparteNombre}`;
      btnMedir.onclick = () => desplegarModalHumanidad(contraparteNombre, contraparteId);
      tarjeta.appendChild(btnMedir);
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
    if (mensajes.length) {
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
    }

    const mediciones = await obtenerMedicionesLocales();
    if (mediciones.length) {
      for (const med of mediciones) {
        try {
          const { data: perfil } = await supabase
            .from("perfiles")
            .select("nivel_humanidad")
            .eq("id", med.evaluado_id)
            .maybeSingle();

          let actual = perfil?.nivel_humanidad ?? 100;
          if (med.resultado === "excelente") actual = Math.min(100, actual + 3);
          if (med.resultado === "deficiente") actual = Math.max(0, actual - 8);

          await supabase.from("mediciones_humanidad").insert({
            evaluador_id: usuario.id,
            evaluado_id: med.evaluado_id,
            resultado: med.resultado
          });

          await supabase
            .from("perfiles")
            .update({ nivel_humanidad: actual })
            .eq("id", med.evaluado_id);

          await limpiarMedicionLocal(med.id);
        } catch (err) {
          console.warn("Matrix: Error sincronizando medición pendiente", err);
        }
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
          .select("id, remitente_id, destinatario_id, contenido, creado_en, remitente:perfiles!remitente_id(nombre_visible), destinatario:perfiles!destinatario_id(nombre_visible)")
          .or(`remitente_id.eq.${usuario.id},destinatario_id.eq.${usuario.id}`)
          .order("creado_en", { ascending: false })
          .limit(100);
        if (error) throw error;
        
        lista.replaceChildren();
        if (!data?.length) {
          const aviso = document.createElement("p");
          aviso.textContent = "Todavía no hay conversaciones. Podés escribirle a alguien desde la góndola o indicando su nombre visible.";
          lista.appendChild(aviso);
        } else {
          data.forEach((mensaje) => {
            const esEnviado = mensaje.remitente_id === usuario.id;
            const contraparteId = esEnviado ? mensaje.destinatario_id : mensaje.remitente_id;
            const contraparteNombre = esEnviado 
              ? (mensaje.destinatario?.nombre_visible || "Vecino") 
              : (mensaje.remitente?.nombre_visible || "Vecino");

            lista.appendChild(tarjetaMensaje(
              mensaje,
              esEnviado ? `Mensaje enviado a ${contraparteNombre}` : `Mensaje recibido de ${contraparteNombre}`,
              esEnviado ? "Enviado desde tu cuenta comunitaria." : "Recibido en tu cuenta comunitaria.",
              contraparteId,
              contraparteNombre
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
    
    let destinatarioId = destinatarioInput.getAttribute("data-destinatario-id");

    if (!usuario || !perfil || !navigator.onLine) {
      await guardarMensajeMatrixLocal({
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `local-${Date.now()}`,
        destinatario,
        destinatario_id: destinatarioId || null,
        texto,
        contenido: texto,
        fecha: new Date().toISOString(),
        creado_en: new Date().toISOString(),
        estado: "pendiente"
      });
      if (estado) estado.textContent = "Guardado localmente en la red de relevo. Se enviará al restablecer conexión.";
      formulario.reset();
      destinatarioInput.removeAttribute("data-destinatario-id");
      await renderizarLocales();
      mostrarNotificacion("Mensaje retenido localmente para sincronización diferida.");
      return;
    }

    if (botonEnviar) {
      botonEnviar.disabled = true;
      botonEnviar.textContent = "ENVIANDO…";
    }
    try {
      if (!destinatarioId) {
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
        destinatarioId = coincidencias[0].id;
      }
      
      const { error } = await supabase.from("mensajes").insert({
        remitente_id: usuario.id,
        destinatario_id: destinatarioId,
        contenido: texto
      });
      if (error) throw error;
      
      formulario.reset();
      destinatarioInput.removeAttribute("data-destinatario-id");
      if (estado) estado.textContent = `Mensaje enviado correctamente.`;
      mostrarNotificacion("Mensaje enviado a la cuenta comunitaria.");
      await cargarMensajesRemotos();
    } catch (error) {
      console.error("Error enviando mensaje, guardando en cola offline...", error);
      await guardarMensajeMatrixLocal({
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `local-${Date.now()}`,
        destinatario,
        destinatario_id: destinatarioId || null,
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
