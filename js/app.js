import { initCommunity } from "./community.js";
import { initConnectivity } from "./connectivity.js";
import { initMessages } from "./messages.js";
import { iniciarAutenticacion } from "./auth.js";
import { getItem, setItem } from "./storage.js";

const $ = (id) => document.getElementById(id);

let navegacionConfigurada = false;
let barrioConfigurado = false;
let ayudaConfigurada = false;
let evaluacionesConfiguradas = false;
let perfilConfigurado = false;
let conectividadSolidariaConfigurada = false;
let intercambiosConfigurados = false;

/* =========================
   NOTIFICACIONES
========================= */

function mostrarNotificacion(mensaje) {
  const elemento = $("notificacion");
  if (!elemento) return;

  elemento.textContent = mensaje;
  elemento.hidden = false;

  clearTimeout(mostrarNotificacion.timer);

  mostrarNotificacion.timer = setTimeout(() => {
    elemento.hidden = true;
  }, 3500);
}

/* =========================
   NAVEGACIÓN POR SOLAPAS Y VISTAS
========================= */

function mostrarSolapa(nombreSolapa) {
  const solapas = ["comunidad", "intercambios", "perfil"];
  
  solapas.forEach(s => {
    const vista = $(`vista-solapa-${s === 'comunidad' ? 'comunidad-principal' : s}`);
    const boton = $(`tab-${s}`);
    if (vista) vista.hidden = s !== nombreSolapa;
    if (boton) {
      if (s === nombreSolapa) boton.classList.add("activo");
      else boton.classList.remove("activo");
    }
  });

  // Ocultar vistas secundarias si estaban abiertas
  const vistasInternas = ["vista-comunicacion", "vista-ayuda"];
  vistasInternas.forEach(id => {
    const el = $(id);
    if (el) el.hidden = true;
  });

  window.scrollTo({ top: 0, behavior: "auto" });
}

function mostrarVistaSecundaria(idVista) {
  const vistasInternas = ["vista-comunicacion", "vista-ayuda"];
  vistasInternas.forEach(id => {
    const el = $(id);
    if (el) el.hidden = id !== idVista;
  });

  // Ocultar solapas principales
  ["vista-solapa-comunidad-principal", "vista-solapa-intercambios", "vista-solapa-perfil"].forEach(id => {
    const el = $(id);
    if (el) el.hidden = true;
  });

  window.scrollTo({ top: 0, behavior: "auto" });
}

function entrarALaComunidad() {
  const inicial = $("pantalla-inicial");
  const comunidad = $("pantalla-comunidad");

  if (inicial) inicial.hidden = true;
  if (comunidad) comunidad.hidden = false;

  mostrarSolapa("comunidad");
  verificarSoftLockVencidos();
}

function configurarNavegacion() {
  if (navegacionConfigurada) return;
  navegacionConfigurada = true;

  $("btn-entrar")?.addEventListener("click", entrarALaComunidad);

  // Botones de solapa
  document.querySelectorAll(".boton-solapa").forEach(boton => {
    boton.addEventListener("click", () => {
      const solapa = boton.getAttribute("data-solapa");
      if (solapa) mostrarSolapa(solapa);
    });
  });

  $("btn-perfil")?.addEventListener("click", () => {
    mostrarSolapa("perfil");
  });

  $("btn-comunicacion")?.addEventListener("click", () => {
    mostrarVistaSecundaria("vista-comunicacion");
  });

  $("btn-ayuda")?.addEventListener("click", () => {
    mostrarVistaSecundaria("vista-ayuda");
  });

  document.querySelectorAll("[data-volver-comunidad]").forEach((boton) => {
    boton.addEventListener("click", () => {
      mostrarSolapa("comunidad");
    });
  });
}

/* =========================
   GEOLOCALIZACIÓN INVERSA
========================= */

async function buscarBarrioPorCoordenadas(latitud, longitud) {
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
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    }
  );

  if (!respuesta.ok) throw new Error("No se pudo consultar el servicio geográfico.");

  const datos = await respuesta.json();
  const direccion = datos.address;
  if (!direccion) throw new Error("No se encontró una dirección reconocible.");

  const barrio =
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

  if (!barrio) throw new Error("El servicio no identificó el barrio.");
  return String(barrio).trim();
}

/* =========================
   BARRIO, LOCALIDAD Y RADAR DE VECINOS
========================= */

function configurarBarrio() {
  if (barrioConfigurado) return;
  barrioConfigurado = true;

  const input = $("barrio");
  const boton = $("btn-guardar-barrio");
  const estado = $("estado-barrio");
  const ubicacion = $("btn-ubicacion");
  
  const modoVisualizacion = $("modo-visualizacion");
  const contenedorExplorarZona = $("contenedor-explorar-zona");
  const inputZonaExplorar = $("zona-explorar");
  const btnExplorarZona = $("btn-explorar-zona");

  if (!input || !boton) return;

  input.value = getItem("hm_barrio", "");
  const modoGuardado = getItem("hm_modo_visualizacion", "barrio");
  if (modoVisualizacion) modoVisualizacion.value = modoGuardado;

  const zonaExplorarGuardada = getItem("hm_zona_explorar", "Mendoza");
  if (inputZonaExplorar) inputZonaExplorar.value = zonaExplorarGuardada;

  function actualizarVisibilidadExploracion() {
    const esExplorar = modoVisualizacion?.value === "explorar";
    if (contenedorExplorarZona) contenedorExplorarZona.hidden = !esExplorar;
  }

  actualizarVisibilidadExploracion();

  modoVisualizacion?.addEventListener("change", () => {
    const modo = modoVisualizacion.value;
    setItem("hm_modo_visualizacion", modo);
    actualizarVisibilidadExploracion();
    renderizarRadarVecinos();
    window.dispatchEvent(new CustomEvent("cambioZonaComunidad"));
  });

  btnExplorarZona?.addEventListener("click", () => {
    const zonaVal = inputZonaExplorar?.value.trim() || "";
    if (!zonaVal) {
      mostrarNotificacion("Escribí el nombre de la localidad que querés explorar.");
      return;
    }
    setItem("hm_zona_explorar", zonaVal);
    mostrarNotificacion(`Explorando zona: ${zonaVal}`);
    renderizarRadarVecinos();
    window.dispatchEvent(new CustomEvent("cambioZonaComunidad"));
  });

  if (input.value && estado) {
    estado.textContent = `Comunidad seleccionada: ${input.value}`;
  }

  boton.addEventListener("click", () => {
    const barrio = input.value.trim();
    if (!barrio) {
      mostrarNotificacion("Escribí el nombre de tu barrio.");
      input.focus();
      return;
    }
    setItem("hm_barrio", barrio);
    if (estado) estado.textContent = `Comunidad seleccionada: ${barrio}`;
    mostrarNotificacion("Barrio guardado.");
    renderizarRadarVecinos();
    window.dispatchEvent(new CustomEvent("cambioZonaComunidad"));
  });

  ubicacion?.addEventListener("click", () => {
    if (!navigator.geolocation) {
      mostrarNotificacion("El navegador no ofrece geolocalización.");
      return;
    }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const barrio = await buscarBarrioPorCoordenadas(pos.coords.latitude, pos.coords.longitude);
        input.value = barrio;
        if (estado) estado.textContent = `Barrio sugerido: ${barrio}. Verificá y guardá.`;
        mostrarNotificacion("Ubicación identificada.");
      } catch (e) {
        mostrarNotificacion("No se pudo identificar el barrio automáticamente.");
      }
    }, () => {
      mostrarNotificacion("Error al obtener geolocalización.");
    });
  });

  renderizarRadarVecinos();
}

function renderizarRadarVecinos() {
  const contenedor = $("lista-radar-vecinos");
  if (!contenedor) return;

  contenedor.replaceChildren();

  // 1. Obtener datos del perfil actual
  const perfilActual = {
    nombre: getItem("hm_nombre_usuario", "Usuario Actual"),
    whatsapp: getItem("hm_whatsapp_usuario", "Sin WhatsApp"),
    barrio: getItem("hm_barrio", "Balvanera"),
    offline: getItem("hm_offline_activo", false)
  };

  // 2. Determinar el conteo de publicaciones activas (Sistema Dual: Manual vs Automático)
  let conteoFinalPublicaciones = 0;
  const pubManualConfigurada = getItem("hm_pub_activas_manual", "");

  if (pubManualConfigurada !== "") {
    conteoFinalPublicaciones = parseInt(pubManualConfigurada, 10) || 0;
  } else {
    const publicaciones = getItem("hm_publicaciones", []);
    conteoFinalPublicaciones = publicaciones.filter(p => p.estado !== "cerrado").length;
  }

  // 3. Renderizar la ficha del usuario actual (Vos) en el radar
  const tarjetaPropia = document.createElement("article");
  tarjetaPropia.className = "tarjeta-publicacion";
  tarjetaPropia.style.border = "1px solid #38bdf8";
  tarjetaPropia.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
      <h3>👤 ${perfilActual.nombre} (Vos)</h3>
      <span class="badge-publicaciones-activas">
        📦 ${conteoFinalPublicaciones} ${conteoFinalPublicaciones === 1 ? 'publicación activa' : 'publicaciones activas'}
      </span>
    </div>
    <p>📍 Zona: ${perfilActual.barrio}</p>
    <p>📡 Comunicación offline: ${perfilActual.offline ? 'Activa (Emergencia)' : 'Inactiva'}</p>
    <p>💬 WhatsApp: ${perfilActual.whatsapp}</p>
    <small style="color: #cbd5e1; display: block; margin-top: 6px;">
      ℹ️ Las publicaciones activas se reconocen automáticamente al publicar o se pueden ajustar de forma manual desde tu perfil.
    </small>
  `;
  contenedor.appendChild(tarjetaPropia);

  // 4. Renderizar vecinos en el radar con su respectivo contador activo
  const vecinosSimulados = [
    { nombre: "Javier M. (Esquel)", barrio: "Esquel / Centro", offline: true, whatsapp: "+5492945000000", pubActivas: 2 },
    { nombre: "Lucía G. (Mendoza)", barrio: "Mendoza / Capital", offline: false, whatsapp: "+5492610000000", pubActivas: 1 }
  ];

  vecinosSimulados.forEach(v => {
    const tarjeta = document.createElement("article");
    tarjeta.className = "tarjeta-publicacion";
    tarjeta.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <h3>👤 ${v.nombre}</h3>
        <span class="badge-publicaciones-activas">
          📦 ${v.pubActivas} ${v.pubActivas === 1 ? 'publicación activa' : 'publicaciones activas'}
        </span>
      </div>
      <p>📍 Zona: ${v.barrio}</p>
      <p>📡 Comunicación offline: ${v.offline ? 'Activa (Emergencia)' : 'Inactiva'}</p>
      <p>💬 WhatsApp: ${v.whatsapp}</p>
    `;
    contenedor.appendChild(tarjeta);
  });
}

/* =========================
   CIRCUITO DE INTERCAMBIOS, CIERRE Y EVALUACIÓN CRUZADA
========================= */

function configurarIntercambios() {
  if (intercambiosConfigurados) return;
  intercambiosConfigurados = true;

  const claveIntercambios = "hm_intercambios_activos";

  function obtenerIntercambios() {
    const regs = getItem(claveIntercambios, []);
    return Array.isArray(regs) ? regs : [];
  }

  let regs = obtenerIntercambios();
  if (regs.length === 0) {
    const fechaLimite = new Date();
    fechaLimite.setHours(fechaLimite.getHours() + 72); // 72 horas iniciales

    regs.push({
      id: "intercambio-demo-1",
      contraparte: "Vecino Test (Esquel / Mendoza)",
      referencia: "Trueque de herramientas manuales",
      estado: "activo", 
      confirmado_a: false,
      confirmado_b: false,
      fecha_limite: fechaLimite.toISOString(),
      prorroga_usada: false,
      motivo_prorroga: null
    });
    setItem(claveIntercambios, regs);
  }

  renderizarIntercambiosActivos();
}

function renderizarIntercambiosActivos() {
  const contenedor = $("lista-intercambios-activos");
  if (!contenedor) return;

  contenedor.replaceChildren();
  const regs = getItem("hm_intercambios_activos", []);

  if (!regs.length) {
    contenedor.innerHTML = `<p class="texto-ayuda">No hay intercambios activos registrados.</p>`;
    return;
  }

  regs.forEach(item => {
    const tarjeta = document.createElement("article");
    tarjeta.className = "tarjeta-publicacion";

    const vencido = new Date() > new Date(item.fecha_limite) && item.estado === "activo";

    tarjeta.innerHTML = `
      <h3>Trueque con: ${item.contraparte}</h3>
      <p>📝 Referencia: ${item.referencia}</p>
      <p>⏳ Estado: <strong>${item.estado.toUpperCase()}</strong></p>
      <p>⏰ Límite de cierre: ${new Date(item.fecha_limite).toLocaleString("es-AR")}</p>
      ${vencido ? '<p style="color: #f87171;">⚠️ Plazo de 72hs vencido sin completar.</p>' : ''}
      
      <div style="display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap;">
        ${item.estado === 'activo' ? `
          <button class="boton-accion" type="button" onclick="window.confirmarConcretarIntercambio('${item.id}')" style="flex: 1; min-width: 140px;">
            🤝 Concretar Intercambio
          </button>
          ${!item.prorroga_usada ? `
            <button class="boton-secundario" type="button" onclick="window.solicitarProrrogaIntercambio('${item.id}')" style="background: #0284c7; color: #fff;">
              ⏱️ Prórroga +48h
            </button>
          ` : ''}
        ` : ''}
      </div>
    `;
    contenedor.appendChild(tarjeta);
  });
}

window.confirmarConcretarIntercambio = function(id) {
  let regs = getItem("hm_intercambios_activos", []);
  let item = regs.find(x => x.id === id);
  if (!item) return;

  item.confirmado_a = true;
  item.confirmado_b = true; 

  if (item.confirmado_a && item.confirmado_b) {
    item.estado = "finalizado";
    
    let publicaciones = getItem("hm_publicaciones", []);
    publicaciones = publicaciones.map(p => {
      if (p.estado !== "cerrado") { p.estado = "cerrado"; }
      return p;
    });
    setItem("hm_publicaciones", publicaciones);

    mostrarNotificacion("¡Intercambio concretado y publicación actualizada!");
    setItem("hm_intercambios_activos", regs);
    renderizarIntercambiosActivos();
    renderizarRadarVecinos();
    abrirModalEvaluacionCruzada(item);
  } else {
    setItem("hm_intercambios_activos", regs);
    renderizarIntercambiosActivos();
    mostrarNotificacion("Confirmación registrada. Esperando a la contraparte.");
  }
};

window.solicitarProrrogaIntercambio = function(id) {
  let regs = getItem("hm_intercambios_activos", []);
  let item = regs.find(x => x.id === id);
  if (!item || item.prorroga_usada) return;

  const nuevaFecha = new Date(item.fecha_limite);
  nuevaFecha.setHours(nuevaFecha.getHours() + 48);

  item.fecha_limite = nuevaFecha.toISOString();
  item.prorroga_usada = true;
  item.motivo_prorroga = "Fuerza mayor / contingencia humanitaria (falta de luz/internet)";

  setItem("hm_intercambios_activos", regs);
  renderizarIntercambiosActivos();
  mostrarNotificacion("Prórroga de 48 horas aplicada con éxito.");
  verificarSoftLockVencidos();
};

function abrirModalEvaluacionCruzada(item) {
  const modal = $("modal-evaluacion-cruzada");
  if (!modal) return;
  $("eval-contraparte-nombre").textContent = item.contraparte;
  $("eval-intercambio-id").value = item.id;
  modal.hidden = false;
}

document.getElementById("form-evaluacion-cruzada-modal")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const resultado = $("eval-resultado").value;
  const detalle = $("eval-detalle").value.trim();

  const evaluaciones = getItem("hm_evaluaciones", []);
  evaluaciones.push({
    id: crypto.randomUUID(),
    resultado,
    detalle,
    fecha: new Date().toISOString()
  });

  setItem("hm_evaluaciones", evaluaciones);
  $("modal-evaluacion-cruzada").hidden = true;
  mostrarNotificacion("Evaluación guardada. Porcentaje de humanidad actualizado.");
  renderizarEstadoHumanidad();
});

function verificarSoftLockVencidos() {
  const regs = getItem("hm_intercambios_activos", []);
  const ahora = new Date();
  const vencidos = regs.filter(x => x.estado === "activo" && ahora > new Date(x.fecha_limite) && x.prorroga_usada);

  const modalSoftLock = $("modal-soft-lock");
  const contenedorSoftLock = $("contenido-soft-lock-intercambios");

  if (vencidos.length > 0 && modalSoftLock && contenedorSoftLock) {
    modalSoftLock.hidden = false;
    contenedorSoftLock.replaceChildren();
    vencidos.forEach(v => {
      const div = document.createElement("div");
      div.innerHTML = `
        <p style="color: #fca5a5;">Trueque con ${v.contraparte} vencido.</p>
        <button class="boton-accion" type="button" onclick="window.confirmarConcretarIntercambio('${v.id}'); document.getElementById('modal-soft-lock').hidden = true;">
          Cerrar y Evaluar Ahora
        </button>
      `;
      contenedorSoftLock.appendChild(div);
    });
  } else if (modalSoftLock) {
    modalSoftLock.hidden = true;
  }
}

/* =========================
   PERFIL Y CÁLCULO DE HUMANIDAD
========================= */

function configurarPerfil() {
  if (perfilConfigurado) return;
  perfilConfigurado = true;

  const formulario = $("form-perfil");
  const inputNombre = $("nombre-usuario");
  const inputWhatsapp = $("whatsapp-usuario");
  const inputOffline = $("offline-activo");
  const inputPubManual = $("pub-activas-manual");
  const estadoPerfil = $("estado-perfil");

  if (inputNombre) inputNombre.value = getItem("hm_nombre_usuario", "");
  if (inputWhatsapp) inputWhatsapp.value = getItem("hm_whatsapp_usuario", "");
  if (inputOffline) inputOffline.checked = Boolean(getItem("hm_offline_activo", false));
  if (inputPubManual) inputPubManual.value = getItem("hm_pub_activas_manual", "");

  formulario?.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const nombre = inputNombre?.value.trim() || "";
    const whatsapp = inputWhatsapp?.value.trim() || "";
    const offlineActivo = Boolean(inputOffline?.checked);
    const pubManualVal = inputPubManual?.value.trim() || "";

    if (!whatsapp || !nombre) {
      mostrarNotificacion("El nombre y el WhatsApp son obligatorios.");
      return;
    }

    setItem("hm_nombre_usuario", nombre);
    setItem("hm_whatsapp_usuario", whatsapp);
    setItem("hm_offline_activo", offlineActivo);
    setItem("hm_pub_activas_manual", pubManualVal);

    if (estadoPerfil) estadoPerfil.textContent = "¡Perfil guardado correctamente!";
    mostrarNotificacion("Perfil guardado con éxito.");
    renderizarRadarVecinos();
  });

  renderizarEstadoHumanidad();
}

function renderizarEstadoHumanidad() {
  const contenedor = $("contenedor-estado-humanidad");
  if (!contenedor) return;

  const evaluaciones = getItem("hm_evaluaciones", []);
  let puntajeAcumulado = 0;
  evaluaciones.forEach(reg => {
    if (reg.resultado === "buena") puntajeAcumulado += 100;
    else if (reg.resultado === "intermedia") puntajeAcumulado += 50;
    else if (reg.resultado === "cancelacion-mutua") puntajeAcumulado += 75;
    else if (reg.resultado === "sin-acuerdo") puntajeAcumulado += 40;
  });

  const promedio = evaluaciones.length > 0 ? Math.round(puntajeAcumulado / evaluaciones.length) : 0;

  contenedor.innerHTML = `
    <p style="font-size: 2.2rem; font-weight: bold; color: #38bdf8; margin: 5px 0;">${promedio}%</p>
    <p style="font-size: 0.9rem; color: #cbd5e1;">Basado en <strong>${evaluaciones.length}</strong> evaluaciones de intercambios comunitarios.</p>
  `;
}

/* =========================
   PUBLICACIONES (GÓNDOLA) CON RECONOCIMIENTO AUTOMÁTICO
========================= */

function configurarPublicaciones() {
  const formPub = $("form-publicacion");
  if (!formPub) return;

  formPub.addEventListener("submit", (e) => {
    e.preventDefault();

    const tipo = $("tipo-publicacion").value;
    const categoria = $("categoria-publicacion").value;
    const titulo = $("titulo-publicacion").value.trim();
    const detalle = $("detalle-publicacion").value.trim();
    const barrio = getItem("hm_barrio", "Balvanera");

    if (!titulo || !detalle) {
      mostrarNotificacion("Completá el título y la descripción de la publicación.");
      return;
    }

    let publicaciones = getItem("hm_publicaciones", []);
    const nuevaPub = {
      id: crypto.randomUUID(),
      tipo,
      categoria,
      titulo,
      detalle,
      barrio,
      estado: "activo", // Nace activa, incrementando automáticamente el contador
      fecha: new Date().toISOString()
    };

    publicaciones.push(nuevaPub);
    setItem("hm_publicaciones", publicaciones);

    mostrarNotificacion("¡Publicación guardada! El radar se ha actualizado.");
    formPub.reset();

    // Actualizar inmediatamente el radar para que el contador refleje la nueva publicación
    renderizarRadarVecinos();
  });
}

/* =========================
   INICIO DE APLICACIÓN
========================= */

async function iniciarAplicacion() {
  configurarNavegacion();
  configurarBarrio();
  configurarPerfil();
  configurarIntercambios();
  configurarPublicaciones();

  initCommunity({ getItem, setItem, mostrarNotificacion });
  initConnectivity({
    onChange: (conectado) => {
      const estado = $("estado-conexion");
      if (estado) {
        estado.textContent = conectado ? "Conexión a internet disponible." : "Sin conexión. Operando en modo local.";
      }
    }
  });
  initMessages({ getItem, setItem, mostrarNotificacion });

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    try {
      await navigator.serviceWorker.register("./service-worker.js");
    } catch (e) { console.error(e); }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", iniciarAplicacion, { once: true });
} else {
  iniciarAplicacion();
}
