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

   Las coordenadas se consultan para
   sugerir una localidad o barrio.
   No se guardan en el almacenamiento.
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
   BARRIO O LOCALIDAD
========================= */

function configurarBarrio() {
  if (barrioConfigurado) return;
  barrioConfigurado = true;

  const input = $("barrio");
  const boton = $("btn-guardar-barrio");
  const estado = $("estado-barrio");
  const ubicacion = $("btn-ubicacion");

  if (!input || !boton) return;

  input.value = getItem("hm_barrio", "");

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
   DE AYUDA: ALMACENAMIENTO LOCAL
========================= */

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
   ALMACENAMIENTO LOCAL
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

  function renderizar() {
    if (!lista) return;

    lista.replaceChildren();
    const registros = obtenerRegistros();

    if (!registros.length) {
      lista.appendChild(
        crearTarjeta("Todavía no hay evaluaciones guardadas.")
      );
      return;
    }

    registros.slice().reverse().forEach((registro) => {
      lista.appendChild(
        crearTarjeta(registro.referencia || "Intercambio", [
          `Resultado: ${registro.resultadoTexto || "Sin especificar"}`,
          registro.detalle || "",
          registro.fecha
            ? `Fecha: ${new Date(registro.fecha).toLocaleString("es-AR")}`
            : "",
          "Evaluación local, sin verificación independiente."
        ])
      );
    });
  }

  formulario?.addEventListener("submit", (evento) => {
    evento.preventDefault();

    const referencia =
      $("referencia-evaluacion")?.value.trim() || "";
    const resultado = $("resultado-evaluacion")?.value || "";
    const detalle =
      $("detalle-evaluacion")?.value.trim() || "";

    if (!referencia || !detalle) {
      mostrarNotificacion(
        "Completá la referencia y la explicación."
      );
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
      estado.textContent =
        "Evaluación guardada localmente. No se publicó ni se envió a nadie.";
    }

    renderizar();
    mostrarNotificacion("Evaluación guardada en este dispositivo.");
  });

  renderizar();
}

/* =========================
   CONECTIVIDAD SOLIDARIA
   CONFIGURACIÓN DEL PERFIL
   Y LISTADO LOCAL
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

    /*
      Esta primera versión muestra únicamente el ofrecimiento
      del perfil guardado en el dispositivo actual.
      No presenta registros ficticios ni afirma que sean
      publicaciones de otros integrantes de la comunidad.
    */

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

    const textoModalidad = document.createElement("p");
    textoModalidad.textContent = `Modalidad: ${textoModalidadValor(perfil.modalidad)}`;
    tarjeta.appendChild(textoModalidad);

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
      "Este ofrecimiento está guardado localmente. Todavía no es visible para otros dispositivos.";
    tarjeta.appendChild(nota);

    lista.appendChild(tarjeta);

    if (estadoLista) {
      estadoLista.textContent =
        "Se muestra el ofrecimiento guardado en este dispositivo.";
    }
  }

  function textoModalidadValor(valor) {
    return textoModalidad(valor);
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
          ? "Conexión a internet disponible."
          : "Sin conexión. Los mensajes guardados siguen disponibles en este dispositivo.";
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
