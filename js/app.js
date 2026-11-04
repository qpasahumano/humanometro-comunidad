import { initCommunity } from "./community.js";
import { initConnectivity } from "./connectivity.js";
import { initMessages } from "./messages.js";
import {
  iniciarAutenticacion,
  obtenerUsuarioActual,
  obtenerPerfilActual,
  perfilEstaCompleto
} from "./auth.js";
import { getItem, setItem } from "./storage.js";
import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);

let navegacionConfigurada = false;
let barrioConfigurado = false;
let ayudaConfigurada = false;
let evaluacionesConfiguradas = false;
let conectividadSolidariaConfigurada = false;
let radarComunitarioConfigurado = false;
let intercambiosConfigurados = false;
let accesoComunidadBloqueado = false;

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
    "vista-intercambios"
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
  } else if (nombre === "vista-gondola") {
    actualizarSolapaActiva("gondola");
  } else if (nombre === "vista-radar") {
    actualizarSolapaActiva("radar");
  } else if (nombre === "vista-sos-offline") {
    actualizarSolapaActiva("sos-offline");
  } else if (nombre === "vista-intercambios") {
    actualizarSolapaActiva("intercambios");
    cargarPanelIntercambios();
  } else if (nombre === "vista-humanometro") {
    actualizarSolapaActiva("humanometro");
    configurarEvaluaciones();
  } else {
    actualizarSolapaActiva("comunidad");
  }

  window.scrollTo({ top: 0, behavior: "auto" });
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
    mostrarVista(null);
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
  const contenedor = $("lista-intercambios-activos") || $("vista-intercambios");
  if (!contenedor) return;
  const usuario = await obtenerUsuarioActual();
  if (!usuario) {
    contenedor.textContent = "Iniciá sesión para ver tus procesos comunitarios.";
    return;
  }
  const { data: intercambios, error } = await supabase
    .from("intercambios").select("*, publicacion:publicacion_id(titulo)")
    .or(`usuario_a.eq.${usuario.id},usuario_b.eq.${usuario.id}`)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Error al cargar procesos:", error);
    contenedor.textContent = "No se pudieron cargar tus procesos.";
    return;
  }
  const estadosPendientes = new Set([
    "pendiente_respuesta",
    "respuesta_recibida",
    "conversacion_pendiente",
    "acuerdo_pendiente_confirmacion",
    "en_proceso",
    "incumplido",
    "regularizacion_pendiente"
  ]);
  const propuestasEntrantes = (intercambios || []).filter((item) =>
    estadosPendientes.has(item.estado)
  ).length;
  const tabIntercambios = $("tab-intercambios");
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
      tabIntercambios.setAttribute("aria-label", "Intercambios y góndola. " + propuestasEntrantes + " procesos pendientes");
    } else {
      contador?.remove();
      tabIntercambios.setAttribute("aria-label", "Intercambios y góndola");
    }
  }
  const idsProcesos = (intercambios || []).map((item) => item.id);
  let eventosPorProceso = new Map();
  if (idsProcesos.length) {
    const { data: eventos } = await supabase
      .from("intercambio_eventos")
      .select("intercambio_id, evento, estado_anterior, estado_nuevo, creado_en")
      .in("intercambio_id", idsProcesos)
      .order("creado_en", { ascending: true });
    (eventos || []).forEach((evento) => {
      if (!eventosPorProceso.has(evento.intercambio_id)) eventosPorProceso.set(evento.intercambio_id, []);
      eventosPorProceso.get(evento.intercambio_id).push(evento);
    });
  }
  const idsPerfiles = [...new Set((intercambios || []).flatMap((item) => [item.usuario_a, item.usuario_b]).filter(Boolean))];
  let nombresPerfiles = new Map();
  if (idsPerfiles.length) {
    const { data: perfilesNombres, error: errorNombres } = await supabase
      .from("perfiles").select("id, nombre_visible").in("id", idsPerfiles);
    if (!errorNombres) (perfilesNombres || []).forEach((perfil) => nombresPerfiles.set(String(perfil.id), perfil.nombre_visible || "Integrante"));
  }
  contenedor.replaceChildren();
  if (!intercambios?.length) {
    contenedor.textContent = "No tenés procesos abiertos. Las propuestas y acuerdos que converses por WhatsApp también deben registrarse acá.";
    return;
  }
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "display:flex;flex-direction:column;gap:14px;padding:10px";
  intercambios.forEach((inter) => {
    const soyAutorB = String(inter.usuario_a) === String(usuario.id);
    const soyIniciadorA = String(inter.usuario_b) === String(usuario.id);
    const miConfirmacion = soyAutorB ? inter.confirmado_a : inter.confirmado_b;
    const otraConfirmacion = soyAutorB ? inter.confirmado_b : inter.confirmado_a;
    const card = document.createElement("article");
    card.className = "tarjeta-publicacion";
    card.style.cssText = "background:#17212b;border:1px solid #2b3b4f;padding:15px;border-radius:8px;color:#fff";
    const titulo = document.createElement("h3");
    titulo.textContent = "Proceso: " + (inter.publicacion?.titulo || inter.referencia || "Acuerdo comunitario");
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
      avisoPendiente.textContent = "Esta persona quiere intercambiar por tu publicación. Revisá qué ofrece y respondé acá para continuar.";
      card.appendChild(avisoPendiente);
    }
    const estado = document.createElement("p");
    estado.textContent = "Estado: " + inter.estado.replaceAll("_"," ").toUpperCase();
    card.appendChild(estado);
    const ayuda = document.createElement("p");
    ayuda.className = "texto-ayuda";
    ayuda.textContent = "La conversación puede continuar por WhatsApp, pero las propuestas y confirmaciones deben quedar registradas en la comunidad.";
    card.appendChild(ayuda);
    const agregarDetalle = (etiqueta, valor) => {
      if (!valor) return;
      const p=document.createElement("p");
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
    const historial = eventosPorProceso.get(inter.id) || [];
    const detallesHistorial = document.createElement("details");
    detallesHistorial.className = "historial-intercambio";
    const resumenHistorial = document.createElement("summary");
    resumenHistorial.textContent = "Historial de pasos (" + historial.length + ")";
    detallesHistorial.appendChild(resumenHistorial);
    const listaHistorial = document.createElement("ol");
    historial.forEach((evento) => {
      const item = document.createElement("li");
      const fecha = new Date(evento.creado_en).toLocaleString("es-AR");
      item.textContent = fecha + " · " + String(evento.evento || "actualización").replaceAll("_"," ") +
        (evento.estado_nuevo ? " · " + evento.estado_nuevo.replaceAll("_"," ") : "");
      listaHistorial.appendChild(item);
    });
    detallesHistorial.appendChild(listaHistorial);
    card.appendChild(detallesHistorial);
    const acciones = document.createElement("div");
    acciones.style.cssText = "display:flex;flex-wrap:wrap;gap:8px";
    const agregar = (label, cls, accion) => {
      const btn=document.createElement("button"); btn.type="button"; btn.className="boton-secundario "+cls; btn.dataset.id=inter.id; btn.textContent=label; acciones.appendChild(btn);
    };
    if (inter.estado === "pendiente_respuesta" && soyAutorB) agregar("Responder propuesta","btn-responder-propuesta");
    if (["respuesta_recibida","conversacion_pendiente"].includes(inter.estado) && soyIniciadorA) agregar("Registrar acuerdo conversado","btn-registrar-acuerdo");
    if (inter.estado === "acuerdo_pendiente_confirmacion") {
      const status=document.createElement("p");
      status.textContent="Confirmación del acuerdo: " + (inter.acuerdo_confirmado_a ? "autor ✓" : "autor pendiente") + " · " + (inter.acuerdo_confirmado_b ? "iniciador ✓" : "iniciador pendiente");
      card.appendChild(status);
      const yoConfirmado=soyAutorB ? inter.acuerdo_confirmado_a : inter.acuerdo_confirmado_b;
      if (!yoConfirmado) agregar("Confirmar acuerdo","btn-confirmar-acuerdo");
    }
    if (inter.estado === "en_proceso") {
      const plazo=document.createElement("p");
      plazo.textContent="Tu vencimiento: " + new Date((soyAutorB ? inter.fecha_limite_b : inter.fecha_limite_a) || inter.fecha_limite).toLocaleString("es-AR");
      card.appendChild(plazo);
      const miConf=soyAutorB ? inter.confirmado_a : inter.confirmado_b;
      const otraConf=soyAutorB ? inter.confirmado_b : inter.confirmado_a;
      if (!miConf) agregar("Confirmar mi cumplimiento","btn-confirmar-cumplimiento");
      const estadoConf=document.createElement("p");
      estadoConf.textContent="Tu cumplimiento: "+(miConf?"confirmado":"pendiente")+" · Contraparte: "+(otraConf?"confirmado":"pendiente");
      card.appendChild(estadoConf);
      if (miConf && otraConf && inter.estado==="en_proceso") agregar("Evaluar contraparte","btn-evaluar-intercambio");
      agregar("Cancelar proceso","btn-cancelar-intercambio");
    }
    if (inter.estado === "pendiente_respuesta" || inter.estado === "respuesta_recibida" || inter.estado === "conversacion_pendiente" || inter.estado === "acuerdo_pendiente_confirmacion") {
      agregar("Cerrar solicitud sin acuerdo","btn-cancelar-intercambio");
    }
    if (inter.estado === "incumplido" || inter.estado === "regularizacion_pendiente") {
      const estadoReg=document.createElement("p");
      estadoReg.textContent=inter.regularizacion_solicitada_por
        ? "Regularización solicitada. La otra parte debe confirmarla."
        : "Proceso incumplido. Podés solicitar una regularización bilateral.";
      card.appendChild(estadoReg);
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
      const opcion = prompt("Respondé con una opción:\n1 = Acepto las condiciones publicadas\n2 = Propongo una alternativa\n3 = Quiero conversar antes de formalizar", "1");
      if (opcion === null) return;
      const mapa = {"1":"aceptar_condiciones","2":"propuesta_alternativa","3":"conversar"};
      if (!mapa[opcion]) { mostrarNotificacion("Opción inválida.","error"); return; }
      let oferta = {};
      if (opcion === "2") {
        const detalle = prompt("Describí qué ofrecés como alternativa:");
        if (!detalle?.trim()) return;
        oferta = {detalle:detalle.trim()};
      }
      const {error}=await supabase.rpc("hmc_responder_intercambio",{p_intercambio_id:btnResponder.dataset.id,p_opcion:mapa[opcion],p_oferta:oferta});
      if(error) mostrarNotificacion("No se pudo registrar la respuesta: "+error.message,"error");
      else { mostrarNotificacion(opcion==="3"?"Conversación pendiente. Cuando acuerden por WhatsApp, registren el acuerdo acá.":"Respuesta registrada. Falta formalizar el acuerdo.","success"); cargarPanelIntercambios(); }
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
      if(!confirm("¿Querés cancelar este proceso? La cancelación válida no genera evaluación ni penalización reputacional.")) return;
      const {error}=await supabase.rpc("hmc_cancelar_intercambio",{p_intercambio_id:btnCancelar.dataset.id});
      if(error) mostrarNotificacion("No se pudo cancelar: "+error.message,"error");
      else {mostrarNotificacion("Proceso cancelado y registrado.","success");cargarPanelIntercambios();}
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
  const estado = $("estado-radar");

  if (!boton) return;

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

  const totalIntercambios = evaluaciones ? evaluaciones.length : 0;
  let porcentajeActual = 0;

  if (totalIntercambios > 0) {
    let puntosTotales = 0;
    evaluaciones.forEach((ev) => {
      let criteriosAprobados = 0;
      if (ev.respeta_condiciones) criteriosAprobados++;
      if (ev.cordialidad) criteriosAprobados++;
      if (ev.puntualidad) criteriosAprobados++;
      if (ev.comunicacion_clara) criteriosAprobados++;
      puntosTotales += (criteriosAprobados / 4) * 100;
    });
    porcentajeActual = Math.round(puntosTotales / totalIntercambios);
  }

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
  configurarNavegacion();
  configurarBarrio();
  configurarRadarComunitario();
  configurarAyuda();
  configurarEvaluaciones();
  configurarPerfil();
  configurarIntercambiosGlobales();

  try {
    await iniciarAutenticacion();
  } catch (error) {
    console.error("Error al iniciar la autenticación:", error);

    mostrarNotificacion(
      "No se pudo inicializar el acceso a la cuenta. Revisá tu conexión."
    );
  }

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
  try {
    supabase.channel("hmc-intercambios-panel")
      .on("postgres_changes", { event: "*", schema: "public", table: "intercambios" }, async (payload) => {
        const usuarioActual = await obtenerUsuarioActual();
        const uid = usuarioActual?.id;
        const registro = payload.new || payload.old || {};
        if (uid && (String(registro.usuario_a) === String(uid) || String(registro.usuario_b) === String(uid))) {
          await cargarPanelIntercambios();
          if (payload.eventType === "INSERT" || payload.old?.estado !== payload.new?.estado) {
            mostrarNotificacion("Tenés una actualización en uno de tus procesos comunitarios. Revisá Intercambios / Góndola.");
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
