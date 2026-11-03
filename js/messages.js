import { supabase } from "./supabase.js";
import { obtenerUsuarioActual } from "./auth.js";

const MATRIX_CONFIG = {
  DB_NAME: "HumanometroComunidadDB",
  DB_VERSION: 3,
  STORE_PUBLICACIONES: "publicaciones_cache",
  STORE_MEDICIONES: "mediciones_pendientes"
};

let dbMatrixInstance = null;
let initMessagesActivo = false;
let opcionesMessages = null;

function avisar(mensaje) {
  if (typeof opcionesMessages?.mostrarNotificacion === "function") {
    opcionesMessages.mostrarNotificacion(mensaje);
  }
}

async function obtenerUsuario() {
  return obtenerUsuarioActual();
}

// --------------------------------------------------
// BASE LOCAL MATRIX: SOLO MEDICIONES DE HUMANIDAD
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
      dbMatrixInstance.onversionchange = () => {
        dbMatrixInstance.close();
        dbMatrixInstance = null;
      };
      resolve(dbMatrixInstance);
    };

    request.onupgradeneeded = (evento) => {
      const db = evento.target.result;

      // Esquema compartido con community.js.
      // Solo se crean almacenes faltantes: no se elimina ni se vacía
      // ningún dato local existente.
      if (!db.objectStoreNames.contains(
        MATRIX_CONFIG.STORE_PUBLICACIONES
      )) {
        db.createObjectStore(
          MATRIX_CONFIG.STORE_PUBLICACIONES,
          { keyPath: "id" }
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
    throw error;
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

export async function procesarMedicionHumanidad(
  evaluadoId,
  resultado
) {
  if (!evaluadoId || !resultado) {
    avisar("No se pudo identificar la medición.");
    return;
  }

  const usuario = await obtenerUsuario();

  const medicionData = {
    evaluador_id: usuario?.id || "anon",
    evaluado_id: evaluadoId,
    resultado,
    creado_en: new Date().toISOString()
  };

  if (!navigator.onLine || !usuario) {
    try {
      await guardarMedicionLocal(medicionData);
      avisar(
        "Medición registrada localmente. Se sincronizará al recuperar la conexión."
      );
    } catch {
      avisar(
        "No se pudo guardar la medición en este dispositivo."
      );
    }
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

    try {
      await guardarMedicionLocal(medicionData);
      avisar(
        "Medición retenida localmente por falta de conexión."
      );
    } catch {
      avisar(
        "No se pudo registrar ni guardar localmente la medición."
      );
    }
  }
}

export function desplegarModalHumanidad(
  otroUsuarioNombre,
  otroUsuarioId
) {
  if (!otroUsuarioId) {
    avisar("No se identificó el perfil para medir.");
    return;
  }

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
    `¿Cómo fue el trato, el respeto al tiempo y la fidelidad del trueque con ${otroUsuarioNombre || "este vecino"}?`;

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

// Punto de integración para fichas u otros módulos.
// No crea una conversación ni utiliza la tabla mensajes.
window.abrirMedicionHumanidad = function(
  nombreVisible,
  usuarioId
) {
  desplegarModalHumanidad(nombreVisible, usuarioId);
};

// --------------------------------------------------
// SINCRONIZACIÓN DE MEDICIONES PENDIENTES
// --------------------------------------------------

export async function sincronizarMedicionesHumanidad() {
  if (!navigator.onLine) return;

  const usuario = await obtenerUsuario();
  if (!usuario) return;

  const mediciones = await obtenerMedicionesLocales();

  for (const medicion of mediciones) {
    try {
      const { error } = await supabase
        .from("mediciones_humanidad")
        .insert({
          evaluador_id:
            medicion.evaluador_id && medicion.evaluador_id !== "anon"
              ? medicion.evaluador_id
              : usuario.id,
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
}

// --------------------------------------------------
// COMPATIBILIDAD CON app.js
// --------------------------------------------------

export function initMessages(opciones = {}) {
  opcionesMessages = opciones;

  if (initMessagesActivo) {
    return {
      sincronizarMediciones: sincronizarMedicionesHumanidad,
      destruir() {}
    };
  }

  initMessagesActivo = true;

  async function manejarConexionRestablecida() {
    await sincronizarMedicionesHumanidad();
  }

  window.addEventListener(
    "online",
    manejarConexionRestablecida
  );

  abrirMatrixDB()
    .then(() => sincronizarMedicionesHumanidad())
    .catch((error) => {
      console.warn(
        "No se pudo iniciar el almacenamiento local de mediciones.",
        error
      );
    });

  return {
    sincronizarMediciones: sincronizarMedicionesHumanidad,

    destruir() {
      window.removeEventListener(
        "online",
        manejarConexionRestablecida
      );

      if (dbMatrixInstance) {
        dbMatrixInstance.close();
        dbMatrixInstance = null;
      }

      initMessagesActivo = false;
      opcionesMessages = null;
    }
  };
}
