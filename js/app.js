import { initCommunity } from "./community.js";
import { initConnectivity } from "./connectivity.js";
import { initMessages } from "./messages.js";
import {
  iniciarAutenticacion,
  obtenerUsuarioActual,
  obtenerPerfilActual,
  perfilEstaCompleto,
  calcularPorcentajeHumanidad
} from "./auth.js";
import { getItem, setItem } from "./storage.js";
import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);

// Solo las solicitudes que esperan respuesta de la persona dueña de la publicación
// se cuentan como propuestas entrantes pendientes.
const estadosPendientes = new Set(["pendiente_respuesta"]);
let secuenciaCargaPanelIntercambios = 0;

let navegacionConfigurada = false;
let barrioConfigurado = false;
let ayudaConfigurada = false;
let evaluacionesConfiguradas = false;
let conectividadSolidariaConfigurada = false;
let radarComunitarioConfigurado = false;
let intercambiosConfigurados = false;
let accesoComunidadBloqueado = false;
let vistaAnteriorResultados = null;
let indicadorScrollPerfil = null;
let indicadorScrollConfigurado = false;

function actualizarIndicadorScrollPerfil() {
  if (!indicadorScrollPerfil) return;
  const vistaPerfil = $("vista-perfil");
  const visible = Boolean(vistaPerfil && !vistaPerfil.hidden);
  const documento = document.documentElement;
  const hayMasContenido = documento.scrollHeight > window.innerHeight + 80;
  const llegoAlFinal = window.scrollY + window.innerHeight >= documento.scrollHeight - 60;
  indicadorScrollPerfil.hidden = !visible || !hayMasContenido || llegoAlFinal;
}

function configurarIndicadorScrollPerfil() {
  if (indicadorScrollConfigurado) return;
  indicadorScrollConfigurado = true;
  indicadorScrollPerfil = document.createElement("div");
  indicadorScrollPerfil.id = "hmc-indicador-scroll-perfil";
  indicadorScrollPerfil.className = "hmc-indicador-scroll-perfil";
  indicadorScrollPerfil.setAttribute("aria-hidden", "true");
  const flechaScroll = document.createElement("span");
  flechaScroll.className = "hmc-indicador-scroll-flecha";
  flechaScroll.textContent = "↑";
  const textoScroll = document.createElement("span");
  textoScroll.textContent = "DESLIZÁ";
  indicadorScrollPerfil.append(flechaScroll, textoScroll);
  document.body.appendChild(indicadorScrollPerfil);
  window.addEventListener("scroll", actualizarIndicadorScrollPerfil, { passive: true });
  window.addEventListener("resize", actualizarIndicadorScrollPerfil);
  actualizarIndicadorScrollPerfil();
}

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
  }, 7000);
}

/* =========================
   NAVEGACIÓN ENTRE VISTAS
========================= */

function actualizarSolapaActiva(solapa) {
  document.querySelectorAll("[data-tab]").forEach((boton) => {
    const activa = boton.dataset.tab === solapa;
    boton.classList.toggle("activa", activa);
    boton.setAttribute("aria-selected", String(activa));
  });
}

function usuarioPuedeEntrar() {
  return Boolean(!accesoComunidadBloqueado && obtenerUsuarioActual() && perfilEstaCompleto());
}

function mostrarVista(nombre = null, opciones = {}) {
  const vistas = [
    "vista-gondola",
    "vista-ayuda",
    "vista-perfil",
    "vista-humanometro",
    "vista-radar",
    "vista-sos-offline",
    "vista-intercambios",
    "vista-publicaciones-perfil"
  ];

  const requierePerfil = nombre !== "vista-perfil";

  if (requierePerfil && !opciones.forzar && !usuarioPuedeEntrar()) {
    nombre = "vista-perfil";

    mostrarNotificacion(
      accesoComunidadBloqueado
        ? "Tu perfil está temporalmente inhabilitado por procesos comunitarios incumplidos. Ingresá a Mi perfil para consultar y regularizar tu situación."
        : "Ingresá a tu cuenta y completá tu perfil para acceder a la comunidad."
    );
  }

  vistas.forEach((id) => {
    const elemento = $(id);
    if (elemento) elemento.hidden = id !== nombre;
  });

  const panelComunidad = $("panel-comunidad");

  if (panelComunidad) {
    panelComunidad.hidden = nombre !== null;
  }

  if (nombre === "vista-perfil") {
    actualizarSolapaActiva("perfil");
    cargarPanelIntercambios();
  } else if (nombre === "vista-gondola") {
    actualizarSolapaActiva("gondola");
  } else if (nombre === "vista-radar") {
    actualizarSolapaActiva("radar");
  } else if (nombre === "vista-sos-offline") {
    actualizarSolapaActiva("sos-offline");
  } else if (nombre === "vista-intercambios") {
    actualizarSolapaActiva("intercambios");
    cargarPanelIntercambios();
  } else if (nombre === "vista-publicaciones-perfil") {
    actualizarSolapaActiva(vistaAnteriorResultados === "vista-radar" ? "radar" : "comunidad");
  } else if (nombre === "vista-humanometro") {
    actualizarSolapaActiva("humanometro");
    configurarEvaluaciones();
  } else {
    actualizarSolapaActiva("comunidad");
  }

  window.scrollTo({ top: 0, behavior: "auto" });
  window.setTimeout(actualizarIndicadorScrollPerfil, 80);
}

function entrarALaComunidad() {
  const inicial = $("pantalla-inicial");
  const comunidad = $("pantalla-comunidad");

  if (inicial) inicial.hidden = true;
  if (comunidad) comunidad.hidden = false;

  mostrarVista("vista-perfil", { forzar: true });
}

function abrirDirectorioComunidad() {
  mostrarVista(null);

  if (!usuarioPuedeEntrar()) return;

  window.dispatchEvent(
    new CustomEvent("mostrarDirectorioComunidad", {
      detail: {
        modo: "comunidad",
        destino: getItem("hm_radar_destino", null),
        ordenarPor: "ultimo_ingreso_desc",
        incluirPerfilesAntiguos: true
      }
    })
  );
}

function configurarNavegacion() {
  if (navegacionConfigurada) return;
  navegacionConfigurada = true;

  $("btn-entrar")?.addEventListener("click", entrarALaComunidad);

  $("tab-perfil")?.addEventListener("click", () => {
    mostrarVista("vista-perfil", { forzar: true });
    cargarPanelIntercambios();
  });

  $("tab-gondola")?.addEventListener("click", () => {
    mostrarVista("vista-gondola");
  });

  $("tab-comunidad")?.addEventListener("click", () => {
    abrirDirectorioComunidad();
  });

  $("tab-radar")?.addEventListener("click", () => {
    mostrarVista("vista-radar");
  });

  $("tab-intercambios")?.addEventListener("click", () => {
    mostrarVista("vista-intercambios");
  });

  $("tab-sos-offline")?.addEventListener("click", () => {
    mostrarVista("vista-sos-offline");

    window.dispatchEvent(
      new CustomEvent("abrirVistaSOSOffline")
    );
  });

  $("btn-gondola")?.addEventListener("click", () => {
    mostrarVista("vista-gondola");
  });

  $("btn-ayuda")?.addEventListener("click", () => {
    mostrarVista("vista-ayuda");
  });

  $("btn-humanometro")?.addEventListener("click", () => {
    mostrarVista("vista-humanometro");
  });

  $("btn-perfil")?.addEventListener("click", () => {
    mostrarVista("vista-perfil", { forzar: true });
    cargarPanelIntercambios();
  });

  document.querySelectorAll("[data-volver]").forEach((boton) => {
    boton.addEventListener("click", () => mostrarVista(null));
  });

  window.addEventListener("abrirPanelPrincipal", () => {
    abrirDirectorioComunidad();
  });

  window.addEventListener("abrirVistaGondola", () => {
    mostrarVista("vista-gondola");
  });

  window.addEventListener("abrirVistaComunidadResultados", () => {
    vistaAnteriorResultados = $("vista-radar")?.hidden === false ? "vista-radar" : null;
    mostrarVista("vista-publicaciones-perfil");
  });

  window.addEventListener("volverDePublicacionesPerfil", (evento) => {
    const vistaDestino = vistaAnteriorResultados || null;
    mostrarVista(vistaDestino);
    window.dispatchEvent(new CustomEvent("restaurarDirectorioComunidad", {
      detail: { modo: evento.detail?.modo || "directorio" }
    }));
    vistaAnteriorResultados = null;
  });

  window.addEventListener("abrirVistaRadar", () => {
    mostrarVista("vista-radar");
  });

  window.addEventListener("abrirVistaSOSOffline", () => {
    mostrarVista("vista-sos-offline");
  });

  window.addEventListener("volverAComunidad", () => {
    abrirDirectorioComunidad();
  });
}

/* =========================
   PANEL DE INTERCAMBIOS Y EVALUACIONES BILATERALES
========================= */

async function cargarPanelIntercambios() {
  const secuenciaCarga = ++secuenciaCargaPanelIntercambios;
  const contenedor = $("lista-intercambios-activos");
  const botonEntrar = $("btn-entrar-seguimiento");
  if (!contenedor) return;
  if (botonEntrar && !botonEntrar.dataset.configurado) {
    botonEntrar.dataset.configurado = "true";
    botonEntrar.addEventListener("click", () => {
      contenedor.hidden = !contenedor.hidden;
      botonEntrar.setAttribute("aria-expanded", String(!contenedor.hidden));
      botonEntrar.textContent = contenedor.hidden ? "ENTRAR" : "OCULTAR SEGUIMIENTO";
    });
  }
  if (botonEntrar) { botonEntrar.hidden = true; botonEntrar.textContent = "ENTRAR"; botonEntrar.setAttribute("aria-expanded", "false"); }
  contenedor.hidden = false;
  const usuario = await obtenerUsuarioActual();
  if (!usuario) {
    contenedor.hidden = false;
    contenedor.textContent = "Iniciá sesión para ver tus procesos comunitarios.";
    const tabPerfil = $("tab-perfil");
    tabPerfil?.querySelector(".contador-propuestas")?.remove();
    tabPerfil?.setAttribute("aria-label", "Mi perfil");
    return;
  }
  const { data: intercambiosTodos, error } = await supabase
    .from("intercambios").select("*, publicacion:publicacion_id(id, perfil_id, usuario_id, titulo)")
    .or(`usuario_a.eq.${usuario.id},usuario_b.eq.${usuario.id}`)
    .order("created_at", { ascending: false });
  if (secuenciaCarga !== secuenciaCargaPanelIntercambios) return;
  if (error) {
    console.error("Error al cargar procesos:", error);
    contenedor.textContent = "No se pudieron cargar tus procesos.";
    return;
  }
  // Las ofertas pendientes se muestran al dueño. Los rechazos quedan
  // visibles solo para quien las envió hasta que archive cada propuesta.
  const estadosActivos = new Set([
    "pendiente_respuesta","respuesta_recibida","conversacion_pendiente",
    "acuerdo_pendiente_confirmacion","en_proceso","incumplido","regularizacion_pendiente"
  ]);
  const intercambios = (intercambiosTodos || []).filter((item) => {
    if (estadosActivos.has(item.estado)) return true;
    return item.estado === "rechazado" &&
      String(item.usuario_b) === String(usuario.id) &&
      !Boolean(item.respuesta_b?.archivada_por_iniciador);
  });
  const propuestasEntrantes = (intercambios || []).filter((item) =>
    (item.estado === "pendiente_respuesta" && String(item.usuario_a) === String(usuario.id)) ||
    (item.estado === "rechazado" && String(item.usuario_b) === String(usuario.id))
  ).length;
  const tabIntercambios = $("tab-perfil");
  if (tabIntercambios) {
    let contador = tabIntercambios.querySelector(".contador-propuestas");
    if (propuestasEntrantes > 0) {
      if (!contador) {
        contador = document.createElement("span");
        contador.className = "contador-propuestas";
        contador.setAttribute("aria-live", "polite");
        tabIntercambios.appendChild(contador);
      }
      contador.textContent = String(propuestasEntrantes);
      tabIntercambios.setAttribute("aria-label", "Mi perfil. " + propuestasEntrantes + " procesos pendientes");
    } else {
      contador?.remove();
      tabIntercambios.setAttribute("aria-label", "Mi perfil");
    }
  }
  const idsPerfiles = [...new Set((intercambios || []).flatMap((item) => [item.usuario_a, item.usuario_b]).filter(Boolean))];
  let nombresPerfiles = new Map();
  if (idsPerfiles.length) {
    const { data: perfilesNombres, error: errorNombres } = await supabase
      .from("perfiles").select("id, nombre_visible").in("id", idsPerfiles);
    if (!errorNombres) (perfilesNombres || []).forEach((perfil) => nombresPerfiles.set(String(perfil.id), perfil.nombre_visible || "Integrante"));
  }
  if (secuenciaCarga !== secuenciaCargaPanelIntercambios) return;
  contenedor.replaceChildren();

  // Las cancelaciones válidas no penalizan la reputación, pero sí quedan
  // contabilizadas para que el integrante pueda corregir una conducta reiterada.
  const { data: miHistorialCancelaciones, error: errorHistorialCancelaciones } = await supabase
    .rpc("hmc_conteo_cancelaciones_intercambios", { p_perfil_ids: [usuario.id] });
  if (errorHistorialCancelaciones) {
    console.warn("No se pudo consultar el historial de cancelaciones:", errorHistorialCancelaciones);
  } else {
    const historial = miHistorialCancelaciones?.[0];
    if (historial?.riesgo_membresia) {
      const aviso = document.createElement("aside");
      aviso.className = "aviso-riesgo-cancelaciones";
      aviso.setAttribute("role", "status");
      aviso.textContent = `⚠️ Tu perfil registra ${Number(historial.cancelaciones_90_dias || 0)} cancelaciones en los últimos 90 días. Las cancelaciones no generan penalización reputacional, pero la reiteración puede poner en revisión tu continuidad como miembro de la comunidad. Revisá tus próximas operaciones antes de iniciarlas.`;
      contenedor.appendChild(aviso);
    }
  }

  if (!intercambios?.length) {
    contenedor.hidden = false;
    contenedor.textContent = "No tenés intercambios activos.";
    return;
  }
  if (botonEntrar) botonEntrar.hidden = false;
  contenedor.hidden = true;
  const wrapper = document.createElement("div");
  wrapper.className = "lista-fichas-seguimiento";
  intercambios.forEach((inter) => {
    const soyAutorB = String(inter.usuario_a) === String(usuario.id);
    const soyIniciadorA = String(inter.usuario_b) === String(usuario.id);
    const miConfirmacion = soyAutorB ? inter.confirmado_a : inter.confirmado_b;
    const otraConfirmacion = soyAutorB ? inter.confirmado_b : inter.confirmado_a;
    const card = document.createElement("article");
    card.className = "tarjeta-publicacion ficha-seguimiento-intercambio";
    const titulo = document.createElement("h3");
    titulo.className = "seguimiento-titulo";
    titulo.textContent = inter.publicacion?.titulo || inter.referencia || "Acuerdo comunitario";
    card.appendChild(titulo);
    const contraparteId = soyAutorB ? inter.usuario_b : inter.usuario_a;
    const contraparte = nombresPerfiles.get(String(contraparteId)) || "Integrante de la comunidad";
    const quien = document.createElement("p");
    quien.className = "texto-ayuda";
    quien.textContent = (inter.estado === "pendiente_respuesta" && soyAutorB ? "Nueva propuesta de: " : "Contraparte: ") + contraparte;
    card.appendChild(quien);
    if (inter.estado === "pendiente_respuesta" && soyAutorB) {
      const avisoPendiente = document.createElement("p");
      avisoPendiente.className = "aviso-propuesta-entrante";
      avisoPendiente.textContent = "Recibiste una oferta por tu publicación. Revisá qué te ofrecen y decidí si querés aceptarla.";
      card.appendChild(avisoPendiente);
    }
    if (inter.estado === "pendiente_respuesta" && soyIniciadorA) {
      const avisoEnviada = document.createElement("p");
      avisoEnviada.className = "aviso-propuesta-entrante";
      avisoEnviada.textContent = "Tu oferta está pendiente de respuesta.";
      card.appendChild(avisoEnviada);
    }
    const estado = document.createElement("span");
    estado.className = "seguimiento-estado";
    estado.textContent = inter.estado === "rechazado" ? "✓ SOLICITUD RECHAZADA" : inter.estado.replaceAll("_"," ").toUpperCase();
    card.appendChild(estado);
    if (inter.estado === "rechazado" && soyIniciadorA) {
      const accionesRechazo = document.createElement("div");
      accionesRechazo.className = "seguimiento-acciones";
      const borrar = document.createElement("button");
      borrar.type = "button";
      borrar.className = "boton-secundario btn-borrar-propuesta-rechazada";
      borrar.dataset.id = inter.id;
      borrar.textContent = "BORRAR PROPUESTA";
      accionesRechazo.appendChild(borrar);
      card.appendChild(accionesRechazo);
      wrapper.appendChild(card);
      return;
    }
    const ayuda = document.createElement("p");
    ayuda.className = "texto-ayuda seguimiento-ayuda";
    ayuda.textContent = "Las propuestas y confirmaciones quedan registradas en la comunidad; pueden conversar por WhatsApp.";
    card.appendChild(ayuda);
    const agregarDetalle = (etiqueta, valor) => {
      if (!valor) return;
      const p=document.createElement("p");
      p.className = "seguimiento-detalle";
      p.textContent=etiqueta+": "+String(valor);
      card.appendChild(p);
    };
    if (inter.propuesta_a) {
      agregarDetalle("Propuesta inicial", inter.propuesta_a.oferta);
      agregarDetalle("Necesita a cambio", inter.propuesta_a.necesita);
      agregarDetalle("Plazo propuesto por quien inicia", inter.propuesta_a.horas_a ? inter.propuesta_a.horas_a+" horas" : "");
    }
    if (inter.respuesta_b) {
      agregarDetalle("Respuesta del autor", inter.respuesta_b.opcion);
      agregarDetalle("Alternativa ofrecida", inter.respuesta_b.oferta?.detalle || "");
    }
    if (inter.propuesta_final) {
      agregarDetalle("Acuerdo: oferta del iniciador", inter.propuesta_final.oferta_a);
      agregarDetalle("Acuerdo: oferta del autor", inter.propuesta_final.oferta_b);
      agregarDetalle("Plazo iniciador", inter.propuesta_final.horas_a+" horas");
      agregarDetalle("Plazo autor", inter.propuesta_final.horas_b+" horas");
    }
    const acciones = document.createElement("div");
    acciones.className = "seguimiento-acciones";
    const verPublicacion = document.createElement("button");
    verPublicacion.type = "button";
    verPublicacion.className = "boton-secundario btn-ver-publicacion-intercambio";
    verPublicacion.textContent = "VER";
    verPublicacion.disabled = !inter.publicacion_id;
    verPublicacion.addEventListener("click", () => {
      const propietarioId = inter.publicacion?.perfil_id || inter.publicacion?.usuario_id || inter.usuario_a;
      window.dispatchEvent(new CustomEvent("abrirPublicacionDeIntercambio", {
        detail: {
          publicacionId: inter.publicacion?.id || inter.publicacion_id,
          perfilId: propietarioId,
          perfilNombre: nombresPerfiles.get(String(propietarioId)) || contraparte,
          intercambioId: inter.id
        }
      }));
    });
    acciones.appendChild(verPublicacion);
    const agregar = (label, cls, accion) => {
      const btn=document.createElement("button"); btn.type="button"; btn.className="boton-secundario "+cls; btn.dataset.id=inter.id; btn.textContent=label; acciones.appendChild(btn);
    };
    if (inter.estado === "pendiente_respuesta" && soyAutorB) {
      const aceptar = document.createElement("button");
      aceptar.type = "button"; aceptar.className = "boton-secundario btn-responder-propuesta";
      aceptar.dataset.id = inter.id; aceptar.dataset.opcion = "aceptar_condiciones";
      aceptar.textContent = "ACEPTAR OFERTA"; acciones.appendChild(aceptar);
      const conversar = document.createElement("button");
      conversar.type = "button"; conversar.className = "boton-secundario btn-responder-propuesta";
      conversar.dataset.id = inter.id; conversar.dataset.opcion = "conversar";
      conversar.textContent = "CONVERSAR"; acciones.appendChild(conversar);
      const rechazar = document.createElement("button");
      rechazar.type = "button"; rechazar.className = "boton-secundario btn-responder-propuesta";
      rechazar.dataset.id = inter.id; rechazar.dataset.opcion = "rechazar_propuesta";
      rechazar.textContent = "RECHAZAR OFERTA"; acciones.appendChild(rechazar);
    }
    if (["respuesta_recibida","conversacion_pendiente"].includes(inter.estado) && soyIniciadorA) agregar("Registrar acuerdo conversado","btn-registrar-acuerdo");
    if (inter.estado === "acuerdo_pendiente_confirmacion") {
      const status=document.createElement("p");
      status.textContent="Confirmación del acuerdo: " + (inter.acuerdo_confirmado_a ? "autor ✓" : "autor pendiente") + " · " + (inter.acuerdo_confirmado_b ? "iniciador ✓" : "iniciador pendiente");
      card.appendChild(status);
      const yoConfirmado=soyAutorB ? inter.acuerdo_confirmado_a : inter.acuerdo_confirmado_b;
      if (!yoConfirmado) agregar("Confirmar acuerdo","btn-confirmar-acuerdo");
    }
    if (inter.estado === "en_proceso") {
      const plazo=document.createElement("p"); plazo.textContent="Tu vencimiento: " + new Date((soyAutorB ? inter.fecha_limite_b : inter.fecha_limite_a) || inter.fecha_limite).toLocaleString("es-AR"); card.appendChild(plazo);
      const miConf=soyAutorB ? inter.confirmado_a : inter.confirmado_b, otraConf=soyAutorB ? inter.confirmado_b : inter.confirmado_a;
      if (!miConf) agregar("Confirmar mi cumplimiento","btn-confirmar-cumplimiento");
      const estadoConf=document.createElement("p"); estadoConf.textContent="Tu cumplimiento: "+(miConf?"confirmado":"pendiente")+" · Contraparte: "+(otraConf?"confirmado":"pendiente"); card.appendChild(estadoConf);
      if (miConf && otraConf) agregar("Evaluar contraparte","btn-evaluar-intercambio");
    }
    if (inter.estado === "pendiente_respuesta" && soyIniciadorA) agregar("Retirar oferta","btn-cancelar-intercambio");
    if (["respuesta_recibida","conversacion_pendiente","acuerdo_pendiente_confirmacion","en_proceso"].includes(inter.estado)) agregar("Cancelar intercambio","btn-cancelar-intercambio");
    if (inter.estado === "incumplido" || inter.estado === "regularizacion_pendiente") {
      const estadoReg=document.createElement("p"); estadoReg.textContent=inter.regularizacion_solicitada_por ? "Regularización solicitada. La otra parte debe confirmarla." : "Proceso incumplido. Podés solicitar una regularización bilateral."; card.appendChild(estadoReg);
      agregar("Solicitar / confirmar regularización","btn-regularizar-proceso");
    }
    card.appendChild(acciones);
    wrapper.appendChild(card);
  });
  contenedor.appendChild(wrapper);
}
function configurarIntercambiosGlobales() {
  if (intercambiosConfigurados) return;
  intercambiosConfigurados = true;

  document.addEventListener("click", async (e) => {
    const btnResponder = e.target.closest(".btn-responder-propuesta");
    if (btnResponder) {
      let opcion = btnResponder.dataset.opcion || "";
      if (!opcion) {
        const respuesta = prompt("Respondé con una opción:\n1 = Acepto la oferta\n2 = Quiero conversar antes de formalizar\n3 = Rechazo la oferta", "1");
        if (respuesta === null) return;
        opcion = {"1":"aceptar_condiciones","2":"conversar","3":"rechazar_propuesta"}[respuesta] || "";
      }
      if (!["aceptar_condiciones","conversar","rechazar_propuesta"].includes(opcion)) {
        mostrarNotificacion("Opción inválida.","error"); return;
      }
      btnResponder.disabled = true;
      const {error}=await supabase.rpc("hmc_responder_intercambio",{p_intercambio_id:btnResponder.dataset.id,p_opcion:opcion,p_oferta:{}});
      if(error) {
        btnResponder.disabled = false;
        mostrarNotificacion("No se pudo registrar la respuesta: "+error.message,"error");
      } else {
        mostrarNotificacion(opcion === "rechazar_propuesta" ? "Oferta rechazada. La publicación sigue activa." : opcion === "conversar" ? "Conversación pendiente. Pueden negociar por WhatsApp o redes y luego registrar el acuerdo acá." : "Oferta aceptada. Ahora pueden formalizar el acuerdo en el seguimiento.","success");
        cargarPanelIntercambios();
        window.dispatchEvent(new CustomEvent("intercambioComunidadActualizado"));
      }
      return;
    }

    const btnBorrarRechazo = e.target.closest(".btn-borrar-propuesta-rechazada");
    if (btnBorrarRechazo) {
      btnBorrarRechazo.disabled = true;
      const {error}=await supabase.rpc("hmc_archivar_propuesta_rechazada",{p_intercambio_id:btnBorrarRechazo.dataset.id});
      if(error) {
        btnBorrarRechazo.disabled = false;
        mostrarNotificacion("No se pudo borrar la propuesta rechazada: "+error.message,"error");
      } else {
        mostrarNotificacion("Propuesta rechazada borrada de tu seguimiento.","success");
        cargarPanelIntercambios();
      }
      return;
    }

    const btnAcuerdo = e.target.closest(".btn-registrar-acuerdo");
    if (btnAcuerdo) {
      const ofertaA=prompt("¿Qué ofrece quien inició la propuesta?");
      if(!ofertaA?.trim()) return;
      const ofertaB=prompt("¿Qué ofrece el autor de la publicación?");
      if(!ofertaB?.trim()) return;
      const horasA=Number.parseInt(prompt("Horas para cumplir la parte del iniciador:", "24"),10);
      const horasB=Number.parseInt(prompt("Horas para cumplir la parte del autor:", "24"),10);
      if(!Number.isInteger(horasA)||!Number.isInteger(horasB)||horasA<1||horasB<1||horasA>720||horasB>720){mostrarNotificacion("Los dos plazos deben estar entre 1 y 720 horas.","error");return;}
      const {error}=await supabase.rpc("hmc_registrar_propuesta_final",{p_intercambio_id:btnAcuerdo.dataset.id,p_acuerdo:{oferta_a:ofertaA.trim(),oferta_b:ofertaB.trim(),horas_a:horasA,horas_b:horasB,origen:"acuerdo_registrado_en_comunidad"}});
      if(error) mostrarNotificacion("No se pudo registrar el acuerdo: "+error.message,"error");
      else {mostrarNotificacion("Acuerdo registrado. Ambas partes deben confirmarlo.","success");cargarPanelIntercambios();}
      return;
    }

    const btnConfirmarAcuerdo = e.target.closest(".btn-confirmar-acuerdo");
    if(btnConfirmarAcuerdo){
      const {error}=await supabase.rpc("hmc_confirmar_acuerdo",{p_intercambio_id:btnConfirmarAcuerdo.dataset.id});
      if(error) mostrarNotificacion("No se pudo confirmar: "+error.message,"error");
      else {mostrarNotificacion("Tu confirmación quedó registrada.","success");cargarPanelIntercambios();}
      return;
    }

    const btnRegularizar = e.target.closest(".btn-regularizar-proceso");
    if(btnRegularizar){
      const {data,error}=await supabase.rpc("hmc_regularizar_proceso",{p_intercambio_id:btnRegularizar.dataset.id});
      if(error) mostrarNotificacion("No se pudo regularizar: "+error.message,"error");
      else {
        mostrarNotificacion(data?.mensaje || "Regularización actualizada.","success");
        const {data:acceso}=await supabase.rpc("hmc_verificar_estado_comunidad");
        accesoComunidadBloqueado=acceso?.estado==="restringido";
        cargarPanelIntercambios();
      }
      return;
    }

    const btnCancelar = e.target.closest(".btn-cancelar-intercambio");
    if(btnCancelar){
      const motivo = prompt("Cancelar solicitud (opcional):\n1 = Sin motivo\n2 = Me arrepentí\n3 = Motivos personales\n4 = No estoy conforme\n5 = No estoy seguro", "3"); if (motivo === null) return;
      const motivos = {"1":"sin_motivo","2":"me_arrepenti","3":"motivos_personales","4":"no_estoy_conforme","5":"no_estoy_seguro"}; if (!motivos[motivo]) { mostrarNotificacion("Elegí un motivo válido.", "warning"); return; }
      const {error}=await supabase.rpc("hmc_cancelar_intercambio",{p_intercambio_id:btnCancelar.dataset.id,p_motivo:motivos[motivo]});
      if(error) mostrarNotificacion("No se pudo cancelar: "+error.message,"error"); else {mostrarNotificacion("Solicitud cancelada. No genera penalización reputacional.","success");cargarPanelIntercambios();}
      return;
    }

    const btnCumplimiento = e.target.closest(".btn-confirmar-cumplimiento");
    if(btnCumplimiento){
      const usuario=await obtenerUsuarioActual();
      const {data:inter,error:fetchError}=await supabase.from("intercambios").select("*").eq("id",btnCumplimiento.dataset.id).single();
      if(fetchError||!inter||!usuario) return;
      const {error}=await supabase.rpc("hmc_confirmar_cumplimiento",{p_intercambio_id:inter.id});
      if(error) mostrarNotificacion("No se pudo confirmar el cumplimiento: "+error.message,"error");
      else {mostrarNotificacion("Cumplimiento confirmado. Esta acción no se puede retirar.","success");cargarPanelIntercambios();}
      return;
    }

    const btnEval = e.target.closest(".btn-evaluar-intercambio");
    if (btnEval) {
      const id = btnEval.getAttribute("data-id");
      const usuario = await obtenerUsuarioActual();
      if (!usuario) return;

      const { data: inter, error: errFetch } = await supabase.from("intercambios").select("*").eq("id", id).single();
      if (errFetch || !inter) return;

      const esParticipanteA = String(inter.usuario_a) === String(usuario.id);
      const esParticipanteB = String(inter.usuario_b) === String(usuario.id);
      if (!esParticipanteA && !esParticipanteB) {
        mostrarNotificacion("No tenés autorización para evaluar este intercambio.", "error");
        return;
      }
      if (inter.estado !== "en_proceso" || !inter.confirmado_a || !inter.confirmado_b) {
        mostrarNotificacion("La evaluación requiere que ambas partes hayan confirmado el cumplimiento.", "warning");
        return;
      }
      const evaluadoId = esParticipanteA ? inter.usuario_b : inter.usuario_a;
      const { data: evaluacionExistente, error: errorEvaluacionExistente } = await supabase
        .from("evaluaciones")
        .select("id")
        .eq("intercambio_id", inter.id)
        .eq("evaluador_id", usuario.id)
        .maybeSingle();
      if (errorEvaluacionExistente) {
        mostrarNotificacion("No se pudo comprobar si ya evaluaste este intercambio.", "error");
        return;
      }
      if (evaluacionExistente) {
        mostrarNotificacion("Ya registraste tu evaluación para este intercambio.", "warning");
        return;
      }

      const respuestas = [];
      const preguntas = [
        "¿Respetó las condiciones pactadas?",
        "¿Hubo cordialidad y respeto?",
        "¿Cumplió con los plazos acordados?",
        "¿Mantuvo una comunicación clara?"
      ];
      for (const pregunta of preguntas) {
        const respuesta = prompt(pregunta + "\nRespondé S para Sí o N para No. Cancelar anula toda la evaluación.", "S");
        if (respuesta === null) {
          mostrarNotificacion("Evaluación cancelada. No se guardó ningún resultado.", "warning");
          return;
        }
        const valor = respuesta.trim().toLowerCase();
        if (valor !== "s" && valor !== "si" && valor !== "sí" && valor !== "n" && valor !== "no") {
          mostrarNotificacion("Respuesta no válida. Usá S para Sí o N para No. No se guardó la evaluación.", "error");
          return;
        }
        respuestas.push(valor === "s" || valor === "si" || valor === "sí");
      }
      const [respeta, cordialidad, puntualidad, comunicacion] = respuestas;

      if (String(evaluadoId) === String(usuario.id)) {
        mostrarNotificacion("No podés evaluarte a vos mismo.", "error");
        return;
      }

      const { error: errEval } = await supabase.from("evaluaciones").insert([{
        intercambio_id: inter.id,
        evaluador_id: usuario.id,
        evaluado_id: evaluadoId,
        respeta_condiciones: respeta,
        cordialidad: cordialidad,
        puntualidad: puntualidad,
        comunicacion_clara: comunicacion
      }]);

      if (errEval) {
        mostrarNotificacion("Error al registrar evaluación: " + errEval.message, "error");
        return;
      }

      const { data: evals, error: errorConteo } = await supabase
        .from("evaluaciones")
        .select("evaluador_id")
        .eq("intercambio_id", inter.id);
      if (errorConteo) {
        mostrarNotificacion("Tu evaluación quedó registrada, pero no se pudo verificar el cierre bilateral.", "warning");
        await configurarEvaluaciones();
        cargarPanelIntercambios();
        return;
      }

      const evaluadores = new Set((evals || []).map((ev) => String(ev.evaluador_id)));
      const participaronAmbos = evaluadores.has(String(inter.usuario_a)) && evaluadores.has(String(inter.usuario_b));
      if (participaronAmbos) {
        const { error: errorCierre } = await supabase
          .rpc("hmc_finalizar_intercambio_evaluado", { p_intercambio_id: inter.id });
        if (errorCierre) {
          mostrarNotificacion("Las dos evaluaciones están registradas, pero no se pudo cerrar el intercambio: " + errorCierre.message, "warning");
          await configurarEvaluaciones();
          cargarPanelIntercambios();
          return;
        }
        mostrarNotificacion("Intercambio completado: ambas partes evaluaron la experiencia.", "success");
      } else {
        mostrarNotificacion("Evaluación registrada. Falta la evaluación de la otra parte para completar el intercambio.", "success");
      }
      await configurarEvaluaciones();
      cargarPanelIntercambios();
    }
  });
}

function escapeHTML(str) {
  return String(str || "").replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
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
      headers: {
        Accept: "application/json"
      },
      cache: "no-store"
    }
  );

  if (!respuesta.ok) {
    throw new Error("No se pudo consultar el servicio geográfico.");
  }

  const datos = await respuesta.json();
  const direccion = datos.address;

  if (!direccion) {
    throw new Error("No se encontró una dirección reconocible.");
  }

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

  if (!barrio) {
    throw new Error("El servicio no identificó el barrio.");
  }

  return String(barrio).trim();
}

/* =========================
   BARRIO Y LOCALIDAD ACTUAL
========================= */

function configurarBarrio() {
  if (barrioConfigurado) return;
  barrioConfigurado = true;

  const input = $("barrio");
  const boton = $("btn-guardar-barrio");
  const estado = $("estado-barrio");
  const ubicacion = $("btn-ubicacion");

  const modoVisualizacion = $("modo-visualizacion");
  const contenedorExplorar = $("contenedor-explorar-zona");
  const inputZonaExplorar = $("zona-explorar-compatibilidad");

  if (!input || !boton) return;

  input.value = getItem("hm_barrio", "");

  const modoGuardado = getItem("hm_modo_visualizacion", "barrio");

  if (modoVisualizacion) {
    modoVisualizacion.value = modoGuardado;
  }

  const zonaExplorarGuardada = getItem("hm_zona_explorar", "");

  if (inputZonaExplorar) {
    inputZonaExplorar.value = zonaExplorarGuardada;
  }

  function actualizarVisibilidadExploracion() {
    const esExplorar = modoVisualizacion?.value === "explorar";

    if (contenedorExplorar) {
      contenedorExplorar.hidden = !esExplorar;
    }
  }

  actualizarVisibilidadExploracion();

  modoVisualizacion?.addEventListener("change", () => {
    const modo = modoVisualizacion.value;

    setItem("hm_modo_visualizacion", modo);
    actualizarVisibilidadExploracion();

    if (modo === "barrio") {
      mostrarNotificacion("Modo de emergencia y barrio estricto activado.");
    } else {
      mostrarNotificacion("Modo exploración de otra localidad activado.");
    }

    window.dispatchEvent(new CustomEvent("cambioZonaComunidad"));
  });

  inputZonaExplorar?.addEventListener("input", () => {
    const zonaVal = inputZonaExplorar.value.trim();

    setItem("hm_zona_explorar", zonaVal);

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

    if (!setItem("hm_barrio", barrio)) {
      mostrarNotificacion(
        "No se pudo guardar el barrio en este dispositivo."
      );
      return;
    }

    if (estado) {
      estado.textContent = `Comunidad seleccionada: ${barrio}`;
    }

    mostrarNotificacion("Barrio guardado en este dispositivo.");

    window.dispatchEvent(new CustomEvent("cambioZonaComunidad"));
  });

  ubicacion?.addEventListener("click", () => {
    if (!navigator.geolocation) {
      mostrarNotificacion("Este navegador no ofrece geolocalización.");
      return;
    }

    if (!navigator.onLine) {
      mostrarNotificacion(
        "Necesitás internet para identificar el barrio automáticamente."
      );
      return;
    }

    ubicacion.disabled = true;
    ubicacion.textContent = "BUSCANDO TU BARRIO...";

    navigator.geolocation.getCurrentPosition(
      async (posicion) => {
        try {
          const { latitude, longitude } = posicion.coords;

          const barrio = await buscarBarrioPorCoordenadas(
            latitude,
            longitude
          );

          input.value = barrio;

          if (estado) {
            estado.textContent =
              `Barrio sugerido: ${barrio}. ` +
              "Verificá el nombre y pulsá GUARDAR.";
          }

          input.focus();

          mostrarNotificacion(
            "Ubicación aproximada identificada. Revisá el nombre y guardalo."
          );
        } catch (error) {
          console.error("Error al identificar el barrio:", error);

          if (estado) {
            estado.textContent =
              "No pudimos identificar el barrio automáticamente. " +
              "Podés escribirlo manualmente.";
          }

          mostrarNotificacion(
            "No se pudo identificar el barrio. Podés escribirlo manualmente."
          );
        } finally {
          ubicacion.disabled = false;
          ubicacion.textContent = "USAR MI UBICACIÓN APROXIMADA";
        }
      },
      (error) => {
        ubicacion.disabled = false;
        ubicacion.textContent = "USAR MI UBICACIÓN APROXIMADA";

        let mensaje =
          "No se obtuvo la ubicación. Podés escribir el barrio manualmente.";

        if (error.code === 1) {
          mensaje =
            "No autorizaste la ubicación. Podés escribir el barrio manualmente.";
        } else if (error.code === 2) {
          mensaje =
            "El teléfono no pudo determinar la ubicación. Escribí el barrio manualmente.";
        } else if (error.code === 3) {
          mensaje =
            "La ubicación tardó demasiado. Probá de nuevo o escribí el barrio.";
        }

        if (estado) estado.textContent = mensaje;

        mostrarNotificacion(mensaje);
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 300000
      }
    );
  });
}

/* =========================
   RADAR COMUNITARIO
========================= */

function configurarRadarComunitario() {
  if (radarComunitarioConfigurado) return;
  radarComunitarioConfigurado = true;

  const pais = $("radar-pais");
  const provincia = $("radar-provincia");
  const localidad = $("zona-explorar");
  const boton = $("btn-buscar-radar");
  const botonUbicacion = $("btn-ubicacion-radar");
  const estado = $("estado-radar");

  if (!boton) return;

  botonUbicacion?.addEventListener("click", () => {
    if (!navigator.geolocation) {
      if (estado) estado.textContent = "Este dispositivo no permite obtener la ubicación.";
      return;
    }
    if (estado) estado.textContent = "Esperando autorización de ubicación…";
    botonUbicacion.disabled = true;
    navigator.geolocation.getCurrentPosition(async (posicion) => {
      try {
        const params = new URLSearchParams({
          format: "jsonv2",
          lat: String(posicion.coords.latitude),
          lon: String(posicion.coords.longitude),
          addressdetails: "1",
          "accept-language": "es"
        });
        const respuesta = await fetch("https://nominatim.openstreetmap.org/reverse?" + params.toString(), {
          headers: { Accept: "application/json" },
          cache: "no-store"
        });
        if (!respuesta.ok) throw new Error("No se pudo identificar la zona.");
        const datos = await respuesta.json();
        const direccion = datos.address || {};
        const localidadDetectada = direccion.city || direccion.town || direccion.village ||
          direccion.municipality || direccion.suburb || direccion.county || "";
        if (pais) pais.value = direccion.country || "";
        if (provincia) provincia.value = direccion.state || direccion.region || "";
        if (localidad) localidad.value = localidadDetectada;
        if (estado) estado.textContent = localidadDetectada
          ? "Ubicación completada. Revisá los datos y presioná BUSCAR COMUNIDAD."
          : "Se autorizó la ubicación, pero no se pudo identificar una localidad. Completá los campos manualmente.";
      } catch (error) {
        console.error("Error al identificar ubicación del Radar:", error);
        if (estado) estado.textContent = "No se pudo identificar la ubicación. Podés completar país, provincia y localidad manualmente.";
      } finally {
        botonUbicacion.disabled = false;
      }
    }, (error) => {
      if (estado) estado.textContent = error.code === 1
        ? "No autorizaste la ubicación. Podés completar los datos manualmente."
        : "No se pudo obtener la ubicación. Completá los datos manualmente.";
      botonUbicacion.disabled = false;
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
  });

  const destinoGuardado = getItem("hm_radar_destino", null);

  if (destinoGuardado && typeof destinoGuardado === "object") {
    if (pais) pais.value = destinoGuardado.pais || "";
    if (provincia) provincia.value = destinoGuardado.provincia || "";
    if (localidad) localidad.value = destinoGuardado.localidad || "";
  }

  boton.addEventListener("click", () => {
    const destino = {
      pais: pais?.value.trim() || "",
      provincia: provincia?.value.trim() || "",
      localidad: localidad?.value.trim() || ""
    };

    if (!destino.pais && !destino.provincia && !destino.localidad) {
      mostrarNotificacion(
        "Indicá al menos un país, provincia o localidad para buscar."
      );

      if (pais) pais.focus();
      else localidad?.focus();

      return;
    }

    if (!setItem("hm_radar_destino", destino)) {
      mostrarNotificacion(
        "No se pudo guardar el destino de búsqueda."
      );
      return;
    }

    if (estado) {
      const partes = [
        destino.localidad,
        destino.provincia,
        destino.pais
      ].filter(Boolean);

      estado.textContent =
        `Buscando integrantes de la comunidad en: ${partes.join(", ")}.`;
    }

    window.dispatchEvent(
      new CustomEvent("buscarRadarComunitario", {
        detail: {
          destino,
          ordenarPor: "ultimo_ingreso_desc",
          incluirPerfilesAntiguos: true
        }
      })
    );

    mostrarVista(null);

    window.dispatchEvent(
      new CustomEvent("mostrarDirectorioComunidad", {
        detail: {
          modo: "radar",
          destino,
          ordenarPor: "ultimo_ingreso_desc",
          incluirPerfilesAntiguos: true
        }
      })
    );

    mostrarNotificacion(
      "Destino enviado al directorio de Comunidad."
    );
  });
}

/* =========================
   TARJETAS INFORMATIVAS
========================= */

function crearTarjeta(titulo, lineas = []) {
  const tarjeta = document.createElement("article");
  tarjeta.className = "tarjeta-publicacion";

  const encabezado = document.createElement("h3");
  encabezado.textContent = titulo;
  tarjeta.appendChild(encabezado);

  lineas.forEach((texto) => {
    if (!texto) return;

    const parrafo = document.createElement("p");
    parrafo.textContent = texto;
    tarjeta.appendChild(parrafo);
  });

  return tarjeta;
}

/* =========================
   SOLICITUDES Y OFRECIMIENTOS
========================= */

function validarPublicacionSegura(texto) {
  const terminosProhibidos = [
    "medicamento",
    "medicamentos",
    "remedio",
    "remedios",
    "farmaco",
    "fármaco",
    "farmacos",
    "fármacos",
    "pastilla",
    "pastillas",
    "droga",
    "drogas",
    "ampolla",
    "ampollas",
    "comprimido",
    "comprimidos",
    "jarabe",
    "jarabes",
    "vacuna",
    "vacunas"
  ];

  const textoNormalizado = texto.toLowerCase();

  return !terminosProhibidos.some((termino) =>
    textoNormalizado.includes(termino)
  );
}

function configurarAyuda() {
  if (ayudaConfigurada) return;
  ayudaConfigurada = true;

  const formulario = $("form-ayuda");
  const lista = $("lista-ayuda");
  const estado = $("estado-ayuda");
  const clave = "hm_solicitudes_ayuda";

  function obtenerRegistros() {
    const registros = getItem(clave, []);
    return Array.isArray(registros) ? registros : [];
  }

  function renderizar() {
    if (!lista) return;

    lista.replaceChildren();

    const registros = obtenerRegistros();

    if (!registros.length) {
      lista.appendChild(
        crearTarjeta(
          "Todavía no hay solicitudes ni ofrecimientos guardados."
        )
      );
      return;
    }

    registros.slice().reverse().forEach((registro) => {
      const tarjeta = crearTarjeta(
        registro.tipoTexto || "REGISTRO DE AYUDA",
        [
          `Categoría: ${registro.categoriaTexto || "Sin especificar"}`,
          registro.detalle || "",
          registro.disponibilidad
            ? `Disponibilidad: ${registro.disponibilidad}`
            : "",
          registro.barrio
            ? `Barrio indicado: ${registro.barrio}`
            : "",
          registro.fecha
            ? `Fecha: ${new Date(registro.fecha).toLocaleString("es-AR")}`
            : "",
          "Registro guardado solamente en este dispositivo."
        ]
      );

      lista.appendChild(tarjeta);
    });
  }

  formulario?.addEventListener("submit", (evento) => {
    evento.preventDefault();

    const tipo = $("tipo-ayuda")?.value || "";
    const categoria = $("categoria-ayuda")?.value || "";
    const detalle = $("detalle-ayuda")?.value.trim() || "";
    const disponibilidad =
      $("disponibilidad-ayuda")?.value.trim() || "";

    if (!detalle) {
      mostrarNotificacion("Contanos qué necesitás u ofrecés.");
      return;
    }

    if (!validarPublicacionSegura(detalle)) {
      mostrarNotificacion(
        "Por políticas de seguridad sanitaria no se permite publicar o solicitar medicamentos entre particulares. Consultá los Bancos de Medicamentos oficiales."
      );

      if (estado) {
        estado.textContent =
          "Prohibida la publicación de fármacos particulares. Acudí a los Bancos de Medicamentos oficiales.";
      }

      return;
    }

    const tipos = {
      solicitud: "SOLICITUD DE AYUDA",
      oferta: "OFRECIMIENTO DE AYUDA",
      carga: "PUNTO DE CARGA DE CELULARES"
    };

    const categorias = {
      alimentos: "Alimentos",
      ropa: "Ropa y calzado",
      transporte: "Traslado",
      energia: "Electricidad o carga de celular",
      herramientas: "Herramientas o materiales",
      acompanamiento: "Acompañamiento o colaboración",
      otra: "Otra necesidad u oferta"
    };

    const registros = obtenerRegistros();

    registros.push({
      id: crearId(),
      tipo,
      tipoTexto: tipos[tipo] || "REGISTRO DE AYUDA",
      categoria,
      categoriaTexto: categorias[categoria] || categoria,
      detalle,
      disponibilidad,
      barrio: getItem("hm_barrio", ""),
      fecha: new Date().toISOString()
    });

    if (!setItem(clave, registros)) {
      mostrarNotificacion(
        "No se pudo guardar el registro de ayuda."
      );
      return;
    }

    formulario.reset();

    if (estado) {
      estado.textContent =
        "Registro guardado localmente. Todavía no fue enviado a otros usuarios.";
    }

    renderizar();
    mostrarNotificacion("Registro guardado en este dispositivo.");
  });

  renderizar();
}

/* =========================
   HUMANÓMETRO Y EVALUACIONES (DINÁMICO DESDE SUPABASE)
========================= */

async function configurarEvaluaciones() {
  const contenedor = $("lista-evaluaciones") || $("vista-humanometro");
  if (!contenedor) return;

  const usuario = await obtenerUsuarioActual();
  if (!usuario) {
    contenedor.innerHTML = "<p class='texto-ayuda' style='text-align: center; padding: 20px;'>Iniciá sesión para ver tu medidor de humanidad.</p>";
    return;
  }

  contenedor.innerHTML = "<p class='texto-ayuda' style='text-align: center; padding: 20px; color: #38bdf8;'>Calculando medidor de humanidad desde la red...</p>";

  // Consultar evaluaciones donde el usuario actual es el evaluado
  const { data: evaluaciones, error } = await supabase
    .from("evaluaciones")
    .select("*")
    .eq("evaluado_id", usuario.id);

  if (error) {
    console.error("Error al cargar evaluaciones:", error);
    contenedor.innerHTML = "<p class='texto-ayuda' style='text-align: center; color: #f87171;'>No se pudo cargar el medidor de humanidad.</p>";
    return;
  }

  const indiceHumanidad = await calcularPorcentajeHumanidad(usuario.id);
  const totalIntercambios = indiceHumanidad.total;
  const porcentajeActual = indiceHumanidad.porcentaje;

  const umbralMinimoIntercambiosParaRiesgo = 3;
  const estaEnRiesgo = totalIntercambios >= umbralMinimoIntercambiosParaRiesgo && porcentajeActual < 70;

  contenedor.replaceChildren();
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "display: flex; flex-direction: column; gap: 15px; padding: 10px;";

  const tarjetaProgreso = document.createElement("article");
  tarjetaProgreso.className = "tarjeta";

  let htmlAlertaRiesgo = "";
  if (estaEnRiesgo) {
    htmlAlertaRiesgo = `
      <div style="background: #7f1d1d; border: 1px solid #991b1b; padding: 12px; border-radius: 8px; margin: 10px 0; color: #fca5a5;">
        <strong>⚠️ ATENCIÓN: Perfil en zona de riesgo comunitario</strong>
        <p style="font-size: 0.85rem; margin: 5px 0 0 0;">
          Tu medidor se encuentra por debajo del 70% requerido tras ${totalIntercambios} evaluaciones. Para mantener la pertenencia y confianza en la red, debés mejorar el cumplimiento en tus próximas experiencias.
        </p>
      </div>
    `;
  }

  tarjetaProgreso.innerHTML = `
    <h3>Progreso del Humanómetro</h3>
    <p style="font-size: 2rem; font-weight: bold; color: ${estaEnRiesgo ? "#f87171" : "#38bdf8"}; margin: 5px 0;">${porcentajeActual}%</p>
    <p style="font-size: 0.9rem; color: #cbd5e1; margin-bottom: 8px;">
      Medición basada en <strong>${totalIntercambios}</strong> ${totalIntercambios === 1 ? "evaluación recibida" : "evaluaciones recibidas"}.
    </p>
    ${htmlAlertaRiesgo}
    <p class="texto-ayuda">El contador inicia por defecto en 0% y evoluciona de forma progresiva según la valoración real de las contrapartes al finalizar los intercambios.</p>
  `;

  wrapper.appendChild(tarjetaProgreso);

  if (totalIntercambios === 0) {
    const tarjetaVacia = document.createElement("article");
    tarjetaVacia.className = "tarjeta";
    tarjetaVacia.innerHTML = `<p class="texto-ayuda" style="text-align: center;">Todavía no hay evaluaciones registradas en la red. Tu medidor se encuentra en 0% (período inicial de adaptación) hasta completar tu primer intercambio.</p>`;
    wrapper.appendChild(tarjetaVacia);
  } else {
    evaluaciones.slice().reverse().forEach((reg) => {
      const tarjetaEval = document.createElement("article");
      tarjetaEval.className = "tarjeta-publicacion";
      tarjetaEval.style.cssText = "background: #17212b; border: 1px solid #2b3b4f; padding: 12px; border-radius: 8px; color: #fff;";
      
      tarjetaEval.innerHTML = `
        <h4 style="color: #38bdf8; margin-bottom: 6px;">Evaluación de Contraparte</h4>
        <p style="font-size: 0.85rem; margin-bottom: 4px;"><strong>Respetó condiciones:</strong> ${reg.respeta_condiciones ? "✓ Sí" : "✕ No"}</p>
        <p style="font-size: 0.85rem; margin-bottom: 4px;"><strong>Cordialidad:</strong> ${reg.cordialidad ? "✓ Sí" : "✕ No"}</p>
        <p style="font-size: 0.85rem; margin-bottom: 4px;"><strong>Puntualidad:</strong> ${reg.puntualidad ? "✓ Sí" : "✕ No"}</p>
        <p style="font-size: 0.85rem; margin-bottom: 4px;"><strong>Comunicación clara:</strong> ${reg.comunicacion_clara ? "✓ Sí" : "✕ No"}</p>
        <p style="font-size: 0.75rem; color: #94a3b8; margin-top: 6px;">Fecha: ${new Date(reg.creado_en || Date.now()).toLocaleString("es-AR")}</p>
      `;
      wrapper.appendChild(tarjetaEval);
    });
  }

  contenedor.appendChild(wrapper);
}

/* =========================
   GESTIÓN DE PERFIL (SIN AUTOEVALUACIÓN)
========================= */

function configurarPerfil() {
  const formulario = $("form-perfil");
  const inputNombre = $("nombre-usuario");
  const inputWhatsapp = $("whatsapp-usuario");
  const estadoPerfil = $("estado-perfil");

  if (!formulario) return;

  if (inputNombre) {
    inputNombre.value = getItem("hm_nombre_usuario", "");
  }

  if (inputWhatsapp) {
    inputWhatsapp.value = getItem("hm_whatsapp_usuario", "");
  }

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const nombre = inputNombre?.value.trim() || "";
    const whatsapp = inputWhatsapp?.value.trim() || "";

    if (!whatsapp) {
      mostrarNotificacion(
        "El número de WhatsApp es obligatorio para crear o actualizar el perfil."
      );

      if (estadoPerfil) {
        estadoPerfil.textContent =
          "Error: El número de WhatsApp es obligatorio como filtro de seguridad.";
      }

      inputWhatsapp?.focus();
      return;
    }

    if (!nombre) {
      mostrarNotificacion("Ingresá tu nombre visible.");
      inputNombre?.focus();
      return;
    }

    try {
      const usuario = await obtenerUsuarioActual();

      if (!usuario) {
        mostrarNotificacion("Debes iniciar sesión para guardar tu perfil.");
        return;
      }

      if (estadoPerfil) {
        estadoPerfil.textContent = "Guardando perfil en la red...";
      }

      const { error: errorSupabase } = await supabase
        .from("perfiles")
        .upsert({
          id: usuario.id,
          nombre_visible: nombre,
          whatsapp: whatsapp,
          actualizado_en: new Date().toISOString()
        });

      if (errorSupabase) {
        throw errorSupabase;
      }

      setItem("hm_nombre_usuario", nombre);
      setItem("hm_whatsapp_usuario", whatsapp);

      if (estadoPerfil) {
        estadoPerfil.textContent =
          "¡Perfil guardado correctamente en la red y validado!";
      }

      mostrarNotificacion("Perfil guardado con éxito.");

    } catch (error) {
      console.error("Error al guardar el perfil en Supabase:", error);

      if (estadoPerfil) {
        estadoPerfil.textContent = "Error al guardar en el servidor. Verificá los datos.";
      }

      mostrarNotificacion("No se pudo guardar el perfil en la red: " + error.message);
    }
  });
}

/* =========================
   CONECTIVIDAD SOLIDARIA
========================= */

function configurarConectividadSolidaria() {
  if (conectividadSolidariaConfigurada) return;
  conectividadSolidariaConfigurada = true;

  const formulario = $("form-conectividad");
  const ofrece = $("conectividad-ofrece");
  const opciones = $("opciones-conectividad");
  const modalidad = $("conectividad-modalidad");
  const emergencias = $("conectividad-emergencias");
  const mensajeEstado = $("estado-perfil-conectividad");
  const clave = "hm_conectividad_solidaria";
  let sincronizando = false;

  function obtenerPerfilLocal() {
    const perfil = getItem(clave, null);
    if (!perfil || typeof perfil !== "object" || Array.isArray(perfil)) {
      return { ofrece: false, modalidad: "gratuita", emergencias: false, pendiente: false };
    }
    return {
      ofrece: Boolean(perfil.ofrece),
      modalidad: ["gratuita", "intercambio", "ambas"].includes(perfil.modalidad) ? perfil.modalidad : "gratuita",
      emergencias: Boolean(perfil.emergencias),
      pendiente: Boolean(perfil.pendiente)
    };
  }

  function actualizarVisibilidadOpciones() {
    if (!opciones || !ofrece) return;
    opciones.hidden = !ofrece.checked;
    opciones.querySelectorAll("input, select, textarea").forEach((campo) => {
      campo.disabled = !ofrece.checked;
    });
  }

  function mostrarEstado(texto) {
    if (mensajeEstado) mensajeEstado.textContent = texto;
  }

  function cargarFormulario(perfil) {
    if (ofrece) ofrece.checked = Boolean(perfil.ofrece);
    if (modalidad) modalidad.value = perfil.modalidad || "gratuita";
    if (emergencias) emergencias.checked = Boolean(perfil.emergencias);
    actualizarVisibilidadOpciones();
  }

  async function sincronizarConectividad() {
    if (sincronizando || !navigator.onLine) return;
    const local = obtenerPerfilLocal();
    if (!local.pendiente) return;
    const usuario = await obtenerUsuarioActual();
    if (!usuario?.id) return;
    sincronizando = true;
    try {
      const { error } = await supabase.from("perfiles").update({
        conectividad_disponible: local.ofrece ? "true" : "false",
        conectividad_modalidad: local.ofrece ? local.modalidad : null,
        conectividad_emergencias: local.ofrece && local.emergencias,
        actualizado_en: new Date().toISOString()
      }).eq("id", usuario.id);
      if (error) throw error;
      setItem(clave, { ...local, pendiente: false, fechaActualizacion: new Date().toISOString() });
      mostrarEstado(local.ofrece
        ? "Tu ofrecimiento está publicado en tu perfil comunitario."
        : "Tu ofrecimiento fue retirado de tu perfil comunitario.");
      window.dispatchEvent(new CustomEvent("perfilComunidadActualizado"));
    } catch (error) {
      console.warn("No se pudo sincronizar Conectividad Solidaria:", error);
      mostrarEstado("El cambio quedó guardado en este dispositivo y espera conexión para sincronizarse.");
    } finally {
      sincronizando = false;
    }
  }

  async function cargarDesdeRed() {
    const local = obtenerPerfilLocal();
    cargarFormulario(local);
    mostrarEstado(local.pendiente
      ? "Hay un cambio guardado en este dispositivo pendiente de sincronización."
      : local.ofrece
        ? "Tu ofrecimiento está configurado."
        : "Todavía no ofrecés conectividad solidaria.");
    const usuario = await obtenerUsuarioActual();
    if (!usuario?.id || !navigator.onLine) return;
    const { data, error } = await supabase.from("perfiles")
      .select("conectividad_disponible, conectividad_modalidad, conectividad_emergencias")
      .eq("id", usuario.id).maybeSingle();
    if (error) {
      console.warn("No se pudo recuperar Conectividad Solidaria desde el perfil:", error);
      return;
    }
    if (!data) return;
    const remoto = {
      ofrece: String(data.conectividad_disponible).toLowerCase() === "true",
      modalidad: ["gratuita", "intercambio", "ambas"].includes(data.conectividad_modalidad) ? data.conectividad_modalidad : "gratuita",
      emergencias: Boolean(data.conectividad_emergencias),
      pendiente: false,
      fechaActualizacion: new Date().toISOString()
    };
    if (!local.pendiente) {
      setItem(clave, remoto);
      cargarFormulario(remoto);
      mostrarEstado(remoto.ofrece
        ? "Tu ofrecimiento está activo en tu perfil comunitario."
        : "Todavía no ofrecés conectividad solidaria.");
    }
  }

  ofrece?.addEventListener("change", actualizarVisibilidadOpciones);

  formulario?.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const nuevoPerfil = {
      ofrece: Boolean(ofrece?.checked),
      modalidad: modalidad?.value || "gratuita",
      emergencias: Boolean(emergencias?.checked),
      pendiente: true,
      fechaActualizacion: new Date().toISOString()
    };
    if (!setItem(clave, nuevoPerfil)) {
      mostrarNotificacion("No se pudo guardar la configuración de Conectividad Solidaria.");
      return;
    }
    actualizarVisibilidadOpciones();
    mostrarEstado(nuevoPerfil.ofrece
      ? "Guardado localmente. Sincronizando tu ofrecimiento con el perfil comunitario…"
      : "Retiro guardado localmente. Sincronizando con el perfil comunitario…");
    await sincronizarConectividad();
    if (obtenerPerfilLocal().pendiente) {
      mostrarNotificacion("Se guardó en este dispositivo y se sincronizará al recuperar la conexión.");
    } else {
      mostrarNotificacion("Conectividad Solidaria actualizada en tu perfil comunitario.");
    }
  });

  window.addEventListener("online", sincronizarConectividad);
  cargarDesdeRed();
}

/* =========================
   IDENTIFICADOR
========================= */

function crearId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/* =========================
   INICIO DE LA APLICACIÓN
========================= */

async function iniciarAplicacion() {
  configurarIndicadorScrollPerfil();
  configurarNavegacion();
  configurarBarrio();
  configurarRadarComunitario();
  configurarAyuda();
  configurarEvaluaciones();
  configurarPerfil();

  try {
    await iniciarAutenticacion();
  } catch (error) {
    console.error("Error al iniciar la autenticación:", error);

    mostrarNotificacion(
      "No se pudo inicializar el acceso a la cuenta. Revisá tu conexión."
    );
  }

  // La autenticación debe estar resuelta antes de consultar el seguimiento
  // y abrir el canal Realtime de intercambios.
  configurarIntercambiosGlobales();

  const usuarioVerificado = await obtenerUsuarioActual();
  if (usuarioVerificado?.id) {
    const { data: estadoAcceso, error: errorEstadoAcceso } = await supabase
      .rpc("hmc_verificar_estado_comunidad");
    if (errorEstadoAcceso) {
      console.error("No se pudo verificar el estado comunitario:", errorEstadoAcceso);
    } else {
      accesoComunidadBloqueado = estadoAcceso?.estado === "restringido";
      if (accesoComunidadBloqueado) {
        mostrarNotificacion("Tu perfil está temporalmente inhabilitado por dos o más procesos incumplidos. Podés ingresar a Mi perfil para regularizarlos.");
        mostrarVista("vista-perfil", { forzar: true });
      } else if (Number(estadoAcceso?.procesos_incumplidos || 0) === 1) {
        mostrarNotificacion("Tenés un proceso comunitario incumplido. Regularizalo para evitar la restricción de acceso.");
      }
    }
  }

  window.addEventListener("intercambioComunidadActualizado", cargarPanelIntercambios);
  window.addEventListener("hmc:perfil-cargado", (evento) => {
    if (evento.detail?.event !== "SIGNED_IN") return;
    mostrarVista("vista-perfil", { forzar: true });
    window.scrollTo({ top: 0, behavior: "auto" });
    window.setTimeout(actualizarIndicadorScrollPerfil, 120);
    cargarPanelIntercambios();
  });
  window.addEventListener("hmc:session-changed", (evento) => {
    if (!evento.detail?.userId) {
      const tab = $("tab-intercambios") || $("tab-gondola");
      tab?.querySelector(".contador-propuestas")?.remove();
      tab?.setAttribute("aria-label", "Intercambios y góndola");
      const panel = $("lista-intercambios-activos");
      if (panel) panel.textContent = "Iniciá sesión para ver tus procesos comunitarios.";
      // Al cerrar sesión, volver a la portada pública y cerrar las vistas internas.
      mostrarVista(null, { forzar: true });
      const pantallaComunidad = $("pantalla-comunidad");
      const pantallaInicial = $("pantalla-inicial");
      if (pantallaComunidad) pantallaComunidad.hidden = true;
      if (pantallaInicial) pantallaInicial.hidden = false;
    } else {
      cargarPanelIntercambios();
    }
  });
  try {
    supabase.channel("hmc-intercambios-panel")
      .on("postgres_changes", { event: "*", schema: "public", table: "intercambios" }, async (payload) => {
        const usuarioActual = await obtenerUsuarioActual();
        const uid = usuarioActual?.id;
        const registro = payload.new || payload.old || {};
        if (uid && (String(registro.usuario_a) === String(uid) || String(registro.usuario_b) === String(uid))) {
          await cargarPanelIntercambios();
          if (payload.eventType === "INSERT" && String(registro.usuario_a) === String(uid)) {
            mostrarNotificacion("Recibiste una oferta por una de tus publicaciones. Revisá Mi perfil → Seguimiento de mis intercambios.");
          } else if (payload.old?.estado !== payload.new?.estado && payload.new?.estado === "rechazado" && String(registro.usuario_b) === String(uid)) {
            mostrarNotificacion("No aceptaron tu oferta. Revisá el seguimiento para borrar la propuesta rechazada.");
          } else if (payload.old?.estado !== payload.new?.estado && payload.new?.estado !== "rechazado") {
            mostrarNotificacion("Tenés una actualización en uno de tus intercambios aceptados. Revisá Mi perfil → Seguimiento de mis intercambios.");
          }
        }
      })
      .subscribe();
  } catch (error) {
    console.warn("No se pudo activar la notificación en vivo de intercambios:", error);
  }

  // Cargar los procesos al iniciar la aplicación para que la insignia
  // exista aunque el usuario todavía no haya abierto la solapa.
  cargarPanelIntercambios();

  configurarConectividadSolidaria();

  initCommunity({
    getItem,
    setItem,
    mostrarNotificacion
  });

  initMessages({
    getItem,
    setItem,
    mostrarNotificacion
  });

  initConnectivity({
    onChange: (conectado) => {
      const estado = $("estado-conexion");

      if (estado) {
        estado.textContent = conectado
          ? "Conexión a internet disponible. Sincronización Matrix activa."
          : "Sin conexión. Red de relevo local e IndexedDB operando en segundo plano.";
      }
    }
  });

  if (
    "serviceWorker" in navigator &&
    location.protocol.startsWith("http")
  ) {
    try {
      await navigator.serviceWorker.register("./service-worker.js");
    } catch (error) {
      console.error(
        "No se pudo registrar el service worker:",
        error
      );
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    iniciarAplicacion,
    { once: true }
  );
} else {
  iniciarAplicacion();
}
