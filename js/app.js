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
let conectividadSolidariaConfigurada = false;

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

function mostrarVista(nombre = null) {
  const vistas = [
    "vista-gondola",
    "vista-comunicacion",
    "vista-ayuda",
    "vista-perfil",
    "vista-humanometro"
  ];

  vistas.forEach((id) => {
    const elemento = $(id);
    if (elemento) elemento.hidden = id !== nombre;
  });

  const elementosInicio = [
    document.querySelector(".bienvenida"),
    document.querySelector(".selector-barrio"),
    document.querySelector(".acciones-principales"),
    document.querySelector(".humanometro")
  ];

  elementosInicio.forEach((elemento) => {
    if (elemento) elemento.hidden = Boolean(nombre);
  });

  window.scrollTo({
    top: 0,
    behavior: "auto"
  });
}

function entrarALaComunidad() {
  const inicial = $("pantalla-inicial");
  const comunidad = $("pantalla-comunidad");

  if (inicial) inicial.hidden = true;
  if (comunidad) comunidad.hidden = false;

  mostrarVista(null);
}

function configurarNavegacion() {
  if (navegacionConfigurada) return;
  navegacionConfigurada = true;

  $("btn-entrar")?.addEventListener("click", entrarALaComunidad);

  $("btn-gondola")?.addEventListener("click", () => {
    mostrarVista("vista-gondola");
  });

  $("btn-comunicacion")?.addEventListener("click", () => {
    mostrarVista("vista-comunicacion");
  });

  $("btn-ayuda")?.addEventListener("click", () => {
    mostrarVista("vista-ayuda");
  });

  $("btn-humanometro")?.addEventListener("click", () => {
    mostrarVista("vista-humanometro");
  });

  $("btn-perfil")?.addEventListener("click", () => {
    mostrarVista("vista-perfil");
  });

  document.querySelectorAll("[data-volver]").forEach((boton) => {
    boton.addEventListener("click", () => {
      mostrarVista(null);
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
   BARRIO, LOCALIDAD Y EXPLORACIÓN
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

  if (!input || !boton) return;

  input.value = getItem("hm_barrio", "");
  
  const modoGuardado = getItem("hm_modo_visualizacion", "barrio");
  if (modoVisualizacion) {
    modoVisualizacion.value = modoGuardado;
  }

  const zonaExplorarGuardada = getItem("hm_zona_explorar", "Esquel");
  if (inputZonaExplorar) {
    inputZonaExplorar.value = zonaExplorarGuardada;
  }

  function actualizarVisibilidadExploracion() {
    const esExplorar = modoVisualizacion?.value === "explorar";
    if (contenedorExplorarZona) {
      contenedorExplorarZona.hidden = !esExplorar;
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
      mostrarNotificacion(
        "Este navegador no ofrece geolocalización."
      );
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
    'medicamento', 'medicamentos', 'remedio', 'remedios', 'farmaco', 'fármaco', 
    'farmacos', 'fármacos', 'pastilla', 'pastillas', 'droga', 'drogas', 'ampolla', 
    'ampollas', 'comprimido', 'comprimidos', 'jarabe', 'jarabes', 'vacuna', 'vacunas'
  ];
  
  const textoNormalizado = texto.toLowerCase();
  return !terminosProhibidos.some(termino => textoNormalizado.includes(termino));
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
        estado.textContent = "Prohibida la publicación de fármacos particulares. Acudí a los Bancos de Medicamentos oficiales.";
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
   EVALUACIONES DE INTERCAMBIOS
========================= */

function configurarEvaluaciones() {
  if (evaluacionesConfiguradas) return;
  evaluacionesConfiguradas = true;

  const formulario = $("form-evaluacion");
  const lista = $("lista-evaluaciones");
  const estado = $("estado-evaluacion");
  const clave = "hm_evaluaciones";

  function obtenerRegistros() {
    const registros = getItem(clave, []);
    return Array.isArray(registros) ? registros : [];
  }

  function calcularPorcentajeHumanidad(registros) {
    if (!Array.isArray(registros) || registros.length === 0) return 0;
    
    let puntajeAcumulado = 0;
    registros.forEach(reg => {
      if (reg.resultado === "buena") puntajeAcumulado += 100;
      else if (reg.resultado === "intermedia") puntajeAcumulado += 50;
      else if (reg.resultado === "cancelacion-mutua") puntajeAcumulado += 75;
      else if (reg.resultado === "sin-acuerdo") puntajeAcumulado += 40;
    });

    const promedio = Math.round(puntajeAcumulado / registros.length);
    return Math.min(Math.max(promedio, 0), 100);
  }

  function renderizar() {
    if (!lista) return;

    lista.replaceChildren();
    const registros = obtenerRegistros();
    const porcentajeActual = calcularPorcentajeHumanidad(registros);
    const totalIntercambios = registros.length;

    const umbralMinimoIntercambiosParaRiesgo = 3;
    const estaEnRiesgo = totalIntercambios >= umbralMinimoIntercambiosParaRiesgo && porcentajeActual < 70;

    const tarjetaProgreso = document.createElement("article");
    tarjetaProgreso.className = "tarjeta";
    
    let htmlAlertaRiesgo = "";
    if (estaEnRiesgo) {
      htmlAlertaRiesgo = `
        <div style="background: #7f1d1d; border: 1px solid #991b1b; padding: 12px; border-radius: 8px; margin: 10px 0; color: #fca5a5;">
          <strong>⚠️ ATENCIÓN: Perfil en zona de riesgo comunitario</strong>
          <p style="font-size: 0.85rem; margin: 5px 0 0 0;">
            Tu medidor se encuentra por debajo del 70% requerido tras ${totalIntercambios} intercambios. Para mantener la pertenencia y confianza en la red, debés mejorar el cumplimiento y respeto en tus próximas experiencias.
          </p>
        </div>
      `;
    }

    tarjetaProgreso.innerHTML = `
      <h3>Progreso del Humanómetro</h3>
      <p style="font-size: 2rem; font-weight: bold; color: ${estaEnRiesgo ? '#f87171' : '#38bdf8'}; margin: 5px 0;">${porcentajeActual}%</p>
      <p style="font-size: 0.9rem; color: #cbd5e1; margin-bottom: 8px;">
        Medición basada en <strong>${totalIntercambios}</strong> ${totalIntercambios === 1 ? 'intercambio registrado' : 'intercambios registrados'}.
      </p>
      ${htmlAlertaRiesgo}
      <p class="texto-ayuda">El contador inicia por defecto en 0% y evoluciona de forma progresiva según el desarrollo y la valoración de tus experiencias comunitarias (requiere un mínimo de 70% para mantener estatus óptimo).</p>
    `;
    lista.appendChild(tarjetaProgreso);

    if (!registros.length) {
      lista.appendChild(
        crearTarjeta("Todavía no hay evaluaciones guardadas. Tu medidor está en 0% (período inicial de adaptación).")
      );
      return;
    }

    registros.slice().reverse().forEach((registro) => {
      lista.appendChild(
        crearTarjeta(registro.referencia || "Intercambio", [
          `Participante evaluado: ${registro.usuarioEvaluado || "No especificado"}`,
          `Resultado: ${registro.resultadoTexto || "Sin especificar"}`,
          registro.detalle || "",
          registro.fecha
            ? `Fecha: ${new Date(registro.fecha).toLocaleString("es-AR")}`
            : "",
          "Evaluación comunitaria registrada."
        ])
      );
    });
  }

  formulario?.addEventListener("submit", (evento) => {
    evento.preventDefault();

    const usuarioEvaluado = $("usuario-evaluado")?.value.trim() || "";
    const referencia = $("referencia-evaluacion")?.value.trim() || "";
    const resultado = $("resultado-evaluacion")?.value || "";
    const detalle = $("detalle-evaluacion")?.value.trim() || "";

    const nombreUsuarioActual = getItem("hm_nombre_usuario", "").trim().toLowerCase();

    if (usuarioEvaluado && nombreUsuarioActual && usuarioEvaluado.toLowerCase() === nombreUsuarioActual) {
      mostrarNotificacion("No podés evaluarte a vos mismo. Las evaluaciones deben ser realizadas por la contraparte del intercambio.");
      if (estado) {
        estado.textContent = "Error: No está permitida la autoevaluación de perfiles.";
      }
      return;
    }

    if (!usuarioEvaluado || !referencia || !detalle) {
      mostrarNotificacion("Completá el nombre de la contraparte, la referencia y la explicación.");
      return;
    }

    const textos = {
      buena: "BUENA",
      intermedia: "INTERMEDIA",
      mala: "MALA",
      "sin-acuerdo": "NO LLEGAMOS A UN ACUERDO",
      "cancelacion-mutua": "CANCELACIÓN DE COMÚN ACUERDO"
    };

    const registros = obtenerRegistros();

    registros.push({
      id: crearId(),
      usuarioEvaluado,
      referencia,
      resultado,
      resultadoTexto: textos[resultado] || resultado,
      detalle,
      fecha: new Date().toISOString()
    });

    if (!setItem(clave, registros)) {
      mostrarNotificacion("No se pudo guardar la evaluación.");
      return;
    }

    formulario.reset();

    if (estado) {
      estado.textContent = "Evaluación guardada localmente. El medidor progresivo ha sido actualizado.";
    }

    renderizar();
    mostrarNotificacion("Evaluación guardada con éxito.");
  });

  renderizar();
}

/* =========================
   GESTIÓN DE PERFIL
========================= */

function configurarPerfil() {
  const formulario = $("form-perfil");
  const inputNombre = $("nombre-usuario");
  const inputWhatsapp = $("whatsapp-usuario");
  const inputOffline = $("offline-activo");
  const estadoPerfil = $("estado-perfil");

  if (!formulario) return;

  if (inputNombre) {
    inputNombre.value = getItem("hm_nombre_usuario", "");
  }
  if (inputWhatsapp) {
    inputWhatsapp.value = getItem("hm_whatsapp_usuario", "");
  }
  if (inputOffline) {
    inputOffline.checked = Boolean(getItem("hm_offline_activo", false));
  }

  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();

    const nombre = inputNombre?.value.trim() || "";
    const whatsapp = inputWhatsapp?.value.trim() || "";
    const offlineActivo = Boolean(inputOffline?.checked);

    if (!whatsapp) {
      mostrarNotificacion("El número de WhatsApp es obligatorio para crear o actualizar el perfil.");
      if (estadoPerfil) {
        estadoPerfil.textContent = "Error: El número de WhatsApp es obligatorio como filtro de seguridad.";
      }
      inputWhatsapp?.focus();
      return;
    }

    if (!nombre) {
      mostrarNotificacion("Ingresá tu nombre visible.");
      inputNombre?.focus();
      return;
    }

    const guardadoNombre = setItem("hm_nombre_usuario", nombre);
    const guardadoWhatsapp = setItem("hm_whatsapp_usuario", whatsapp);
    const guardadoOffline = setItem("hm_offline_activo", offlineActivo);

    if (!guardadoNombre || !guardadoWhatsapp || !guardadoOffline) {
      mostrarNotificacion("No se pudieron guardar los datos del perfil en este dispositivo.");
      return;
    }

    if (estadoPerfil) {
      estadoPerfil.textContent = "¡Perfil guardado correctamente con validación de WhatsApp y conectividad offline!";
    }

    mostrarNotificacion("Perfil guardado con éxito.");
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
  const zona = $("conectividad-zona");
  const emergencias = $("conectividad-emergencias");
  const disponibilidad = $("conectividad-disponibilidad");
  const estadoPerfil = $("conectividad-estado");
  const mensajeEstado = $("estado-perfil-conectividad");

  const lista = $("lista-conectividad");
  const estadoLista = $("estado-lista-conectividad");

  const clave = "hm_conectividad_solidaria";

  function obtenerPerfil() {
    const perfil = getItem(clave, null);

    if (!perfil || typeof perfil !== "object" || Array.isArray(perfil)) {
      return {
        ofrece: false,
        modalidad: "gratuita",
        zona: "",
        emergencias: false,
        disponibilidad: "",
        estado: "activa",
        fechaActualizacion: null
      };
    }

    return {
      ofrece: Boolean(perfil.ofrece),
      modalidad: ["gratuita", "intercambio", "ambas"].includes(
        perfil.modalidad
      )
        ? perfil.modalidad
        : "gratuita",
      zona: String(perfil.zona || ""),
      emergencias: Boolean(perfil.emergencias),
      disponibilidad: String(perfil.disponibilidad || ""),
      estado: perfil.estado === "pausada" ? "pausada" : "activa",
      fechaActualizacion: perfil.fechaActualizacion || null
    };
  }

  function actualizarVisibilidadOpciones() {
    if (!opciones || !ofrece) return;

    opciones.hidden = !ofrece.checked;

    opciones.querySelectorAll("input, select, textarea").forEach((campo) => {
      campo.disabled = !ofrece.checked;
    });
  }

  function cargarFormulario() {
    const perfil = obtenerPerfil();

    if (ofrece) ofrece.checked = perfil.ofrece;
    if (modalidad) modalidad.value = perfil.modalidad;
    if (zona) zona.value = perfil.zona;
    if (emergencias) emergencias.checked = perfil.emergencias;
    if (disponibilidad) disponibilidad.value = perfil.disponibilidad;
    if (estadoPerfil) estadoPerfil.value = perfil.estado;

    actualizarVisibilidadOpciones();

    if (mensajeEstado) {
      mensajeEstado.textContent = perfil.ofrece
        ? perfil.estado === "activa"
          ? "Tu ofrecimiento está guardado en este dispositivo y figura como activo localmente."
          : "Tu ofrecimiento está pausado en este dispositivo."
        : "Todavía no estás ofreciendo conectividad solidaria.";
    }
  }

  function textoModalidad(valor) {
    const modalidades = {
      gratuita: "Gratuita",
      intercambio: "Por intercambio solidario",
      ambas: "Gratuita o por intercambio solidario"
    };

    return modalidades[valor] || "Sin especificar";
  }

  function renderizarLista() {
    if (!lista) return;

    lista.replaceChildren();

    const perfil = obtenerPerfil();

    if (!perfil.ofrece || perfil.estado !== "activa") {
      if (estadoLista) {
        estadoLista.textContent =
          "Todavía no hay ofrecimientos activos guardados en este dispositivo.";
      }
      return;
    }

    const tarjeta = document.createElement("article");
    tarjeta.className = "tarjeta-conectividad";

    const titulo = document.createElement("h3");
    titulo.textContent = "Ofrecimiento de conectividad solidaria";
    tarjeta.appendChild(titulo);

    const distintivo = document.createElement("span");
    distintivo.className = "distintivo-conectividad";
    distintivo.textContent = "ACTIVO EN ESTE DISPOSITIVO";
    tarjeta.appendChild(distintivo);

    const textoZona = document.createElement("p");
    textoZona.textContent = `Zona o localidad: ${perfil.zona || getItem("hm_barrio", "") || "No especificada"}`;
    tarjeta.appendChild(textoZona);

    const textoMod = document.createElement("p");
    textoMod.textContent = `Modalidad: ${textoModalidad(perfil.modalidad)}`;
    tarjeta.appendChild(textoMod);

    const textoDisponibilidad = document.createElement("p");
    textoDisponibilidad.textContent =
      `Disponibilidad: ${perfil.disponibilidad || "A coordinar"}`;
    tarjeta.appendChild(textoDisponibilidad);

    if (perfil.emergencias) {
      const textoEmergencias = document.createElement("p");
      textoEmergencias.textContent =
        "Indica disponibilidad para situaciones de emergencia.";
      tarjeta.appendChild(textoEmergencias);
    }

    const nota = document.createElement("p");
    nota.textContent =
      "Este ofrecimiento está guardado localmente en la red de relevo Matrix.";
    tarjeta.appendChild(nota);

    lista.appendChild(tarjeta);

    if (estadoLista) {
      estadoLista.textContent =
        "Se muestra el ofrecimiento guardado en este dispositivo.";
    }
  }

  ofrece?.addEventListener("change", actualizarVisibilidadOpciones);

  formulario?.addEventListener("submit", (evento) => {
    evento.preventDefault();

    const perfilOfrece = Boolean(ofrece?.checked);

    const nuevoPerfil = {
      ofrece: perfilOfrece,
      modalidad: modalidad?.value || "gratuita",
      zona: zona?.value.trim() || "",
      emergencias: Boolean(emergencias?.checked),
      disponibilidad: disponibilidad?.value.trim() || "",
      estado: estadoPerfil?.value === "pausada" ? "pausada" : "activa",
      fechaActualizacion: new Date().toISOString()
    };

    if (
      perfilOfrece &&
      !nuevoPerfil.zona &&
      !getItem("hm_barrio", "")
    ) {
      mostrarNotificacion(
        "Indicá una zona o guardá primero tu barrio o localidad."
      );
      zona?.focus();
      return;
    }

    if (!setItem(clave, nuevoPerfil)) {
      mostrarNotificacion(
        "No se pudo guardar la configuración de Conectividad Solidaria."
      );
      return;
    }

    actualizarVisibilidadOpciones();
    renderizarLista();

    if (mensajeEstado) {
      mensajeEstado.textContent = !nuevoPerfil.ofrece
        ? "Tu perfil dejó de ofrecer conectividad solidaria en este dispositivo."
        : nuevoPerfil.estado === "activa"
          ? "Tu ofrecimiento se guardó en este dispositivo."
          : "Tu ofrecimiento quedó pausado en este dispositivo.";
    }

    mostrarNotificacion(
      "Configuración de Conectividad Solidaria guardada localmente."
    );
  });

  cargarFormulario();
  renderizarLista();
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
  configurarAyuda();
  configurarEvaluaciones();
  configurarPerfil();
  configurarConectividadSolidaria();

  try {
    await iniciarAutenticacion();
  } catch (error) {
    console.error("Error al iniciar la autenticación:", error);

    mostrarNotificacion(
      "No se pudo inicializar el acceso a la cuenta. Revisá tu conexión."
    );
  }

  initCommunity({
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

  initMessages({
    getItem,
    setItem,
    mostrarNotificacion
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
