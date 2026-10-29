import { initCommunity } from "./community.js";
import { initConnectivity } from "./connectivity.js";
import { initMessages } from "./messages.js";
import { getItem, setItem } from "./storage.js";

const $ = (id) => document.getElementById(id);

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

function mostrarVista(nombre) {
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

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function configurarBarrio() {
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
      mostrarNotificacion("No se pudo guardar el barrio en este dispositivo.");
      return;
    }

    if (estado) {
      estado.textContent = `Comunidad seleccionada: ${barrio}`;
    }

    mostrarNotificacion("Barrio guardado en este dispositivo.");
  });

  ubicacion?.addEventListener("click", () => {
    if (!navigator.geolocation) {
      mostrarNotificacion("Este navegador no ofrece geolocalización.");
      return;
    }

    ubicacion.disabled = true;
    ubicacion.textContent = "CONSULTANDO UBICACIÓN...";

    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        const lat = posicion.coords.latitude;
        const lon = posicion.coords.longitude;

        setItem("hm_ubicacion_aproximada", {
          lat,
          lon,
          fecha: new Date().toISOString()
        });

        if (estado) {
          estado.textContent =
            "Ubicación obtenida en este dispositivo. No se publicó tu dirección exacta.";
        }

        ubicacion.disabled = false;
        ubicacion.textContent = "USAR MI UBICACIÓN APROXIMADA";
        mostrarNotificacion(
          "Ubicación guardada localmente. No se ha buscado automáticamente el nombre del barrio."
        );
      },
      () => {
        ubicacion.disabled = false;
        ubicacion.textContent = "USAR MI UBICACIÓN APROXIMADA";
        mostrarNotificacion(
          "No se obtuvo la ubicación. Podés escribir el barrio manualmente."
        );
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000
      }
    );
  });
}

function configurarPerfil() {
  const formulario = $("form-perfil");
  const nombre = $("nombre-usuario");
  const estado = $("estado-perfil");

  if (!formulario || !nombre) return;

  nombre.value = getItem("hm_nombre_usuario", "");

  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();

    const valor = nombre.value.trim();

    if (!valor) {
      mostrarNotificacion("Escribí el nombre que querés mostrar.");
      nombre.focus();
      return;
    }

    if (!setItem("hm_nombre_usuario", valor)) {
      mostrarNotificacion("No se pudo guardar el perfil.");
      return;
    }

    if (estado) {
      estado.textContent = "Nombre guardado en este dispositivo.";
    }

    mostrarNotificacion("Perfil guardado localmente.");
  });
}

function configurarNavegacion() {
  $("btn-entrar")?.addEventListener("click", () => {
    $("pantalla-inicial").hidden = true;
    $("pantalla-comunidad").hidden = false;
    mostrarVista(null);
  });

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
    boton.addEventListener("click", () => mostrarVista(null));
  });
}

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

function configurarAyuda() {
  const formulario = $("form-ayuda");
  const lista = $("lista-ayuda");
  const estado = $("estado-ayuda");
  const clave = "hm_solicitudes_ayuda";

  function renderizar() {
    if (!lista) return;

    lista.replaceChildren();
    const registros = getItem(clave, []);

    if (!Array.isArray(registros) || registros.length === 0) {
      lista.appendChild(
        crearTarjeta("Todavía no hay solicitudes ni ofrecimientos guardados.")
      );
      return;
    }

    registros.slice().reverse().forEach((registro) => {
      const tarjeta = crearTarjeta(
        registro.tipoTexto,
        [
          `Categoría: ${registro.categoriaTexto}`,
          registro.detalle,
          registro.disponibilidad
            ? `Disponibilidad: ${registro.disponibilidad}`
            : "",
          registro.barrio ? `Barrio indicado: ${registro.barrio}` : "",
          `Fecha: ${new Date(registro.fecha).toLocaleString("es-AR")}`,
          "Registro guardado solamente en este dispositivo."
        ]
      );

      lista.appendChild(tarjeta);
    });
  }

  formulario?.addEventListener("submit", (evento) => {
    evento.preventDefault();

    const tipo = $("tipo-ayuda").value;
    const categoria = $("categoria-ayuda").value;
    const detalle = $("detalle-ayuda").value.trim();
    const disponibilidad = $("disponibilidad-ayuda").value.trim();

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

    const registros = getItem(clave, []);

    if (!Array.isArray(registros)) {
      mostrarNotificacion("No se pudo leer el almacenamiento de ayuda.");
      return;
    }

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
      mostrarNotificacion("No se pudo guardar el registro de ayuda.");
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

function configurarEvaluaciones() {
  const formulario = $("form-evaluacion");
  const lista = $("lista-evaluaciones");
  const estado = $("estado-evaluacion");
  const clave = "hm_evaluaciones";

  function renderizar() {
    if (!lista) return;

    lista.replaceChildren();
    const registros = getItem(clave, []);

    if (!Array.isArray(registros) || registros.length === 0) {
      lista.appendChild(
        crearTarjeta("Todavía no hay evaluaciones guardadas.")
      );
      return;
    }

    registros.slice().reverse().forEach((registro) => {
      lista.appendChild(
        crearTarjeta(registro.referencia, [
          `Resultado: ${registro.resultadoTexto}`,
          registro.detalle,
          `Fecha: ${new Date(registro.fecha).toLocaleString("es-AR")}`,
          "Evaluación local, sin verificación independiente."
        ])
      );
    });
  }

  formulario?.addEventListener("submit", (evento) => {
    evento.preventDefault();

    const referencia = $("referencia-evaluacion").value.trim();
    const resultado = $("resultado-evaluacion").value;
    const detalle = $("detalle-evaluacion").value.trim();

    if (!referencia || !detalle) {
      mostrarNotificacion("Completá la referencia y la explicación.");
      return;
    }

    const textos = {
      buena: "BUENA",
      intermedia: "INTERMEDIA",
      mala: "MALA",
      "sin-acuerdo": "NO LLEGAMOS A UN ACUERDO",
      "cancelacion-mutua": "CANCELACIÓN DE COMÚN ACUERDO"
    };

    const registros = getItem(clave, []);

    if (!Array.isArray(registros)) {
      mostrarNotificacion("No se pudo leer el historial.");
      return;
    }

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

function crearId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function iniciarAplicacion() {
  configurarNavegacion();
  configurarBarrio();
  configurarPerfil();
  configurarAyuda();
  configurarEvaluaciones();

  initCommunity({ getItem, setItem, mostrarNotificacion });
  initConnectivity({
    onChange: (conectado) => {
      const estado = $("estado-conexion");
      if (estado) {
        estado.textContent = conectado
          ? "Conexión a internet disponible."
          : "Sin conexión. Los datos guardados en este dispositivo siguen disponibles.";
      }
    }
  });

  initMessages({ getItem, setItem, mostrarNotificacion });

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    try {
      await navigator.serviceWorker.register("./service-worker.js");
    } catch (error) {
      console.error("No se pudo registrar el service worker:", error);
    }
  }
}

document.addEventListener("DOMContentLoaded", iniciarAplicacion);
