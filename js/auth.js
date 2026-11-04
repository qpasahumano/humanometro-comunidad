import { supabase } from "./supabase.js";

let usuarioActual = null;
let perfilActual = null;
let escuchadorAutenticacion = null;
let cargaPerfilEnCurso = false;
let modoEdicionPerfil = false;

// ==========================================
// CONSTANTES DE SEGURIDAD: ALTA CONFIANZA
// ==========================================
const REQUISITO_MIN_EVALUACIONES = 20;
const REQUISITO_MIN_CALIDAD = 95;
const CATEGORIAS_ALTA_CONFIANZA = ["hospedaje", "cuidado_mascotas_casa"];

const $ = (id) => document.getElementById(id);

function escaparHTML(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (caracter) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[caracter]);
}

export function perfilEstaCompleto() {
  if (!usuarioActual || !perfilActual?.id) return false;
  return Boolean(
    String(perfilActual.nombre_visible || "").trim() &&
    String(perfilActual.whatsapp || "").trim() &&
    String(perfilActual.presentacion || "").trim() &&
    String(perfilActual.localidad || "").trim() &&
    String(perfilActual.foto_url || "").trim() &&
    String(perfilActual.estado_acceso_comunidad || "activo") === "activo"
  );
}

function obtenerVistaPerfil() {
  return $("vista-perfil");
}

function crearInterfazAcceso() {
  const vista = obtenerVistaPerfil();
  if (!vista || $("hm-auth-panel")) return;

  const panel = document.createElement("section");
  panel.id = "hm-auth-panel";
  panel.className = "tarjeta";
  panel.innerHTML = `
    <h3>Tu cuenta comunitaria</h3>
    <p id="hm-auth-intro">
      Ingresá o creá tu cuenta para participar y compartir publicaciones.
    </p>

    <div id="hm-auth-credentials">
      <label for="hm-auth-email">Correo electrónico</label>
      <input
        id="hm-auth-email"
        type="email"
        autocomplete="email"
        maxlength="254"
        placeholder="tu@correo.com"
      >

      <label for="hm-auth-password">Contraseña</label>
      <input
        id="hm-auth-password"
        type="password"
        autocomplete="current-password"
        minlength="8"
        placeholder="Mínimo 8 caracteres"
      >
    </div>

    <div class="acciones-cuenta">
      <button id="hm-auth-login" class="boton-accion" type="button">
        INICIAR SESIÓN
      </button>

      <button id="hm-auth-register" class="boton-secundario" type="button">
        CREAR CUENTA
      </button>

    </div>

    <p id="hm-auth-status" class="texto-ayuda" role="status" aria-live="polite">
      Comprobando tu cuenta…
    </p>
  `;

  const encabezado = vista.querySelector("h2");
  if (encabezado) {
    encabezado.insertAdjacentElement("afterend", panel);
  } else {
    vista.prepend(panel);
  }

  $("hm-auth-login").addEventListener("click", iniciarSesion);
  $("hm-auth-register").addEventListener("click", crearCuenta);

  const botonSalirPerfil = document.createElement("button");
  botonSalirPerfil.id = "hm-auth-logout";
  botonSalirPerfil.className = "boton-secundario boton-ancho";
  botonSalirPerfil.type = "button";
  botonSalirPerfil.textContent = "CERRAR SESIÓN";
  botonSalirPerfil.hidden = true;
  botonSalirPerfil.addEventListener("click", cerrarSesion);
  const formularioPerfil = $("form-perfil");
  formularioPerfil?.appendChild(botonSalirPerfil);

  prepararFormularioPerfil();
}

function prepararFormularioPerfil() {
  const formulario = $("form-perfil");
  if (!formulario || formulario.dataset.supabasePreparado === "true") {
    return;
  }

  formulario.dataset.supabasePreparado = "true";

  const avisoLocal = obtenerVistaPerfil()?.querySelector(".aviso-local");
  if (avisoLocal) {
    avisoLocal.textContent =
      "Tu perfil se guarda en tu cuenta comunitaria para utilizarlo en las funciones compartidas.";
  }

  const nombre = $("nombre-usuario");
  if (nombre) {
    nombre.maxLength = 80;
    nombre.placeholder = "Cómo querés aparecer";
  }

  const campos = [
    {
      id: "hm-profile-presentation",
      nombre: "Presentación",
      etiqueta: "Presentación",
      tipo: "textarea",
      max: 600,
      placeholder: "Contá detalladamente las condiciones reales de lo que ofrecés o buscás."
    },
    {
      id: "hm-profile-locality",
      nombre: "Localidad",
      etiqueta: "Localidad",
      tipo: "input",
      max: 100,
      placeholder: "Ej.: San Vicente"
    },
    {
      id: "hm-profile-zone",
      nombre: "Zona aproximada",
      etiqueta: "Zona aproximada",
      tipo: "input",
      max: 120,
      placeholder: "Ej.: zona centro"
    }
  ];

  const boton = $("btn-guardar-perfil");
  const campoWhatsApp = $("whatsapp-usuario");
  if (campoWhatsApp) {
    campoWhatsApp.required = true;
    campoWhatsApp.autocomplete = "tel";
    campoWhatsApp.placeholder = "Ej.: +5491112345678";
  }
  if ($("nombre-usuario")) $("nombre-usuario").required = true;

  campos.forEach((campo) => {
    if ($(campo.id)) return;

    const etiqueta = document.createElement("label");
    etiqueta.htmlFor = campo.id;
    etiqueta.textContent = campo.etiqueta;

    let control;

    if (campo.tipo === "textarea") {
      control = document.createElement("textarea");
      control.rows = 3;
    } else {
      control = document.createElement("input");
      control.type = "text";
    }

    control.id = campo.id;
    control.maxLength = campo.max;
    control.placeholder = campo.placeholder;
    if (campo.id === "hm-profile-presentation" || campo.id === "hm-profile-locality") {
      control.required = true;
    }

    if (boton) {
      formulario.insertBefore(etiqueta, boton);
      formulario.insertBefore(control, boton);
    } else {
      formulario.append(etiqueta, control);
    }
  });

  // Preferencia voluntaria de mensajería offline externa
  if (!$("hm-offline-messaging-available")) {
    const bloqueOffline = document.createElement("fieldset");
    bloqueOffline.className = "perfil-conectividad perfil-mensajeria-offline tarjeta";
    bloqueOffline.innerHTML = `
      <legend>Comunicación de emergencia</legend>
      <label class="control-check" for="hm-offline-messaging-available">
        <input id="hm-offline-messaging-available" type="checkbox">
        Tengo mensajería offline para comunicarme sin Internet
      </label>
      <p class="texto-ayuda">Si activás esta opción, aparecerá un indicador en tu perfil comunitario. Briar es una aplicación gratuita y de código abierto; para comunicarse sin Internet, ambas personas deben tenerla instalada y configurada. Puede sincronizar mensajes por Bluetooth o Wi-Fi cuando los dispositivos están cerca.</p>
      <a class="boton-secundario enlace-mensajeria-offline" href="https://www.briarproject.org/download-briar/" target="_blank" rel="noopener noreferrer">CONOCER / DESCARGAR BRIAR GRATIS</a>
    `;
    if (boton) formulario.insertBefore(bloqueOffline, boton);
    else formulario.appendChild(bloqueOffline);
  }

  // Conectividad Solidaria: una sola pregunta y tres modalidades.
  if (!$("hm-connectivity-available")) {
    const bloque = document.createElement("fieldset");
    bloque.className = "perfil-conectividad tarjeta";
    bloque.innerHTML = `
      <legend>Conectividad solidaria</legend>
      <label class="control-check" for="hm-connectivity-available">
        <input id="hm-connectivity-available" type="checkbox">
        ¿Ofrecés conectividad (Internet y/o electricidad)?
      </label>
      <div id="hm-connectivity-options">
        <label for="hm-connectivity-mode">Modalidad</label>
        <select id="hm-connectivity-mode">
          <option value="gratuito">Gratuita / solidaria</option>
          <option value="intercambio">Por intercambio</option>
          <option value="ambas">Gratuita o por intercambio (mixta)</option>
        </select>
      </div>
      <p class="texto-ayuda">Si no ofrecés conectividad, dejá la opción desactivada. Los detalles se acuerdan al contactarse. No publiques contraseñas ni tu dirección exacta.</p>
    `;
    if (boton) formulario.insertBefore(bloque, boton);
    else formulario.appendChild(bloque);
  }
  const conectividadCheck = $("hm-connectivity-available");
  const conectividadOpciones = $("hm-connectivity-options");
  const actualizarOpcionesConectividad = () => {
    if (conectividadOpciones) conectividadOpciones.hidden = !conectividadCheck?.checked;
  };
  if (conectividadCheck && !conectividadCheck.dataset.listenerConfigurado) {
    conectividadCheck.dataset.listenerConfigurado = "true";
    conectividadCheck.addEventListener("change", actualizarOpcionesConectividad);
  }
  actualizarOpcionesConectividad();

  let fichaVisual = $("hm-perfil-ficha");
  if (!fichaVisual) {
    fichaVisual = document.createElement("div");
    fichaVisual.id = "hm-perfil-ficha";
    fichaVisual.className = "tarjeta perfil-ficha-visual";
    formulario.parentNode.insertBefore(fichaVisual, formulario);
  }

  const vistaFoto = $("foto-perfil-vista");
  if (vistaFoto) {
    vistaFoto.style.objectFit = "cover";
    vistaFoto.style.objectPosition = "center";
  }

  const selectorFoto = $("foto-perfil-archivo");
  selectorFoto?.addEventListener("change", () => {
    const archivo = selectorFoto.files?.[0];
    if (!archivo) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(archivo.type)) {
      mostrarEstadoPerfil("Elegí una imagen JPG, PNG o WebP.");
      selectorFoto.value = "";
      return;
    }
    if (archivo.size > 5 * 1024 * 1024) {
      mostrarEstadoPerfil("La foto debe pesar 5 MB o menos.");
      selectorFoto.value = "";
      return;
    }
    const vista = $("foto-perfil-vista");
    const inicial = $("foto-perfil-inicial");
    const lector = new FileReader();
    lector.onload = () => {
      if (vista && typeof lector.result === "string") {
        vista.src = lector.result;
        vista.style.objectFit = "cover";
        vista.style.objectPosition = "center";
        vista.hidden = false;
      }
      if (inicial) inicial.hidden = true;
    };
    lector.onerror = () => mostrarEstadoPerfil("No se pudo previsualizar la fotografía seleccionada.");
    lector.readAsDataURL(archivo);
  });

  formulario.addEventListener("submit", guardarPerfil, true);
  actualizarModoVisualizacion();
}

function actualizarModoVisualizacion() {
  const formulario = $("form-perfil");
  const ficha = $("hm-perfil-ficha");
  const botonGuardar = $("btn-guardar-perfil");
  const autenticado = Boolean(usuarioActual);

  if (!autenticado) {
    if (formulario) formulario.hidden = true;
    if (ficha) ficha.hidden = true;
    return;
  }

  if (!perfilEstaCompleto()) modoEdicionPerfil = true;

  if (modoEdicionPerfil) {
    if (botonGuardar) botonGuardar.textContent = perfilActual?.id ? "GUARDAR CAMBIOS" : "GUARDAR / CREAR PERFIL";
    if (formulario) formulario.hidden = false;
    if (ficha) ficha.hidden = true;
  } else {
    if (formulario) formulario.hidden = true;
    if (ficha) {
      ficha.hidden = false;
      renderizarFichaVisual(ficha);
    }
  }
}

function renderizarFichaVisual(contenedor) {
  const datos = perfilActual || {};
  const fotoSrc = escaparHTML(datos.foto_url || "");
  const nombreVisible = escaparHTML(datos.nombre_visible || "Sin nombre");
  const localidadVisible = escaparHTML(datos.localidad || "Sin localidad");
  const zonaVisible = escaparHTML(datos.zona_aproximada || "");
  const presentacionVisible = escaparHTML(datos.presentacion || "Sin presentación detallada.");
  const modalidadVisible = escaparHTML(datos.conectividad_modalidad || "");
  const conectividadActiva = String(datos.conectividad_disponible).toLowerCase() === "true";
  const inicial = nombreVisible !== "Sin nombre" ? nombreVisible.charAt(0).toUpperCase() : "H";

  const infoHumanidad = datos.indice_humanidad || { porcentaje: 0, total: 0 };
  const pct = infoHumanidad.porcentaje;

  let colorPct = "#22c55e";
  if (pct < 60) {
    colorPct = "#ef4444";
  } else if (pct < 80) {
    colorPct = "#eab308";
  }

  const wppRaw = datos.whatsapp ? String(datos.whatsapp).replace(/\D/g, "") : "";
  const wppLink = wppRaw ? `https://wa.me/${wppRaw}` : "";

  contenedor.innerHTML = `
    <div style="background: #0b0f19; border: 1px solid #334155; border-radius: 12px; padding: 12px; font-family: inherit;">

      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 10px;">
        <div style="width: 55px; height: 55px; border-radius: 50%; overflow: hidden; background: #1e293b; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; color: #fff; font-weight: bold; flex-shrink: 0; border: 2px solid #38bdf8;">
          ${fotoSrc ? `<img src="${fotoSrc}" alt="Foto" style="width: 100%; height: 100%; object-fit: cover;">` : inicial}
        </div>
        <div style="overflow: hidden; flex-grow: 1;">
          <h3 style="margin: 0; color: #38bdf8; font-size: 1.05rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${nombreVisible}</h3>
          <p style="margin: 2px 0 0 0; font-size: 0.8rem; color: #94a3b8;">📍 ${localidadVisible} ${zonaVisible ? `(${zonaVisible})` : ""}</p>
        </div>
      </div>

      <div style="background: #1e293b; padding: 8px 10px; border-radius: 8px; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; border: 1px solid #475569;">
        <span style="width: 10px; height: 10px; border-radius: 50%; background: ${colorPct}; box-shadow: 0 0 6px ${colorPct}; display: inline-block; flex-shrink: 0;"></span>
        <span style="font-size: 0.8rem; color: #e2e8f0; font-weight: bold;">Calidad Humana: ${pct}% (${infoHumanidad.total} ev.)</span>
      </div>

      <div style="background: #0f172a; padding: 8px 10px; border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #1e293b;">
        <span style="font-size: 0.8rem; color: #e2e8f0;">Reputación comunitaria</span>
        <strong style="font-size: 0.82rem; color: #8bd9ee;">${infoHumanidad.total} evaluaciones recibidas</strong>
      </div>

      <div style="font-size: 0.85rem; color: #cbd5e1; display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px;">
        <p style="margin: 0; font-style: italic; color: #94a3b8; font-size: 0.8rem; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
          "${presentacionVisible}"
        </p>

        <div style="display: flex; justify-content: space-between; align-items: center; background: #0f172a; padding: 6px 8px; border-radius: 6px; border: 1px solid #1e293b;">
          <span style="font-size: 0.8rem;">📱 WhatsApp:</span>
          ${wppLink ? `<a href="${wppLink}" target="_blank" style="color: #4ade80; text-decoration: none; font-weight: bold; font-size: 0.8rem; display: flex; align-items: center; gap: 4px;">💬 Chatear</a>` : `<span style="color: #64748b; font-size: 0.8rem;">No vinculado</span>`}
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; background: #0f172a; padding: 6px 8px; border-radius: 6px; border: 1px solid #1e293b;">
          <span style="font-size: 0.8rem;">📡 Wi-Fi Solidario:</span>
          <span style="font-size: 0.8rem; color: ${conectividadActiva ? "#4ade80" : "#f87171"}; font-weight: bold;">
            ${conectividadActiva ? `🟢 Activo (${modalidadVisible})` : "🔴 Inactivo"}
          </span>
        </div>
        ${datos.mensajeria_offline ? `
          <a href="https://www.briarproject.org/download-briar/" target="_blank" rel="noopener noreferrer" style="display: flex; justify-content: space-between; align-items: center; background: #0f172a; padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(139,217,238,.35); color: #8bd9ee; text-decoration: none; font-size: 0.8rem;">
            <span>📶 Comunicación offline:</span>
            <strong>Briar · Gratis y código abierto ↗</strong>
          </a>
        ` : ""}
      </div>

      <p style="margin: 0 0 10px 0; font-size: 0.7rem; color: #64748b; text-align: center;">
        💡 El nexo es aquí: acordá como quieras; la comunidad construye su confianza mediante evaluaciones entre personas.
      </p>

      <button id="btn-activar-edicion" class="boton-secundario" type="button" style="width: 100%; font-size: 0.8rem; padding: 8px; margin-bottom: 8px;">
        EDITAR MI PERFIL
      </button>
      <button id="btn-entrar-aplicacion" class="boton-accion" type="button" style="width: 100%; font-size: 0.85rem; padding: 10px;">
        INGRESAR A HUMANÓMETRO COMUNIDAD →
      </button>

    </div>
  `;

  $("btn-activar-edicion")?.addEventListener("click", () => {
    modoEdicionPerfil = true;
    actualizarModoVisualizacion();
  });

  $("btn-entrar-aplicacion")?.addEventListener("click", () => {
    if (!perfilEstaCompleto()) {
      mostrarEstadoPerfil("Completá y guardá todos los datos obligatorios antes de ingresar.");
      modoEdicionPerfil = true;
      actualizarModoVisualizacion();
      return;
    }
    window.dispatchEvent(new CustomEvent("abrirPanelPrincipal"));
  });

}

// ==========================================
// NUEVO: VALIDACIÓN DE NIVEL DE ALTA CONFIANZA
// ==========================================
export function verificarAccesoAltaConfianza() {
  const infoHumanidad = perfilActual?.indice_humanidad || { porcentaje: 0, total: 0 };
  const totalEvals = infoHumanidad.total;
  const porcentaje = infoHumanidad.porcentaje;

  if (totalEvals < REQUISITO_MIN_EVALUACIONES || porcentaje < REQUISITO_MIN_CALIDAD) {
    return {
      permitido: false,
      mensaje: `🔒 Zona de Alta Confianza\n\nPara ofrecer o solicitar estadías y cuidado de animales en propiedades, necesitás al menos ${REQUISITO_MIN_EVALUACIONES} evaluaciones comunitarias (tenés ${totalEvals}) y un ${REQUISITO_MIN_CALIDAD}% de Calidad Humana (tenés ${porcentaje}%).\n\nSumá reputación con intercambios cotidianos para desbloquear este nivel automáticamente.`
    };
  }

  return { permitido: true };
}

// ==========================================
// NUEVO: INTERCEPTOR DE CATEGORÍA AL PUBLICAR
// ==========================================
export function seleccionarCategoriaPublicacion(categoriaSeleccionada) {
  if (CATEGORIAS_ALTA_CONFIANZA.includes(categoriaSeleccionada)) {
    const verificacion = verificarAccesoAltaConfianza();

    if (!verificacion.permitido) {
      alert(verificacion.mensaje);
      return false;
    }
  }

  return true;
}

function mostrarEstado(mensaje) {
  const estado = $("hm-auth-status");
  if (estado) estado.textContent = mensaje;
}

function mostrarEstadoPerfil(mensaje) {
  const estado = $("estado-perfil");
  if (estado) estado.textContent = mensaje;
}

function obtenerCredenciales() {
  const email = $("hm-auth-email")?.value.trim().toLowerCase();
  const password = $("hm-auth-password")?.value || "";

  if (!email || !password) {
    mostrarEstado("Ingresá tu correo electrónico y contraseña.");
    return null;
  }

  if (password.length < 8) {
    mostrarEstado("La contraseña debe tener al menos 8 caracteres.");
    return null;
  }

  return { email, password };
}

async function iniciarSesion() {
  const credenciales = obtenerCredenciales();
  if (!credenciales) return;

  const boton = $("hm-auth-login");
  if (boton) boton.disabled = true;

  mostrarEstado("Iniciando sesión…");

  try {
    const { error } = await supabase.auth.signInWithPassword(credenciales);

    if (error) {
      mostrarEstado("No se pudo iniciar sesión: " + error.message);
      return;
    }

    mostrarEstado("Sesión iniciada. Cargando tu perfil…");

  } catch (error) {
    console.error("Error al iniciar sesión:", error);
    mostrarEstado("No se pudo completar el inicio de sesión. Probá nuevamente.");
  } finally {
    if (boton) boton.disabled = false;
  }
}

async function crearCuenta() {
  const credenciales = obtenerCredenciales();
  if (!credenciales) return;

  const boton = $("hm-auth-register");
  if (boton) boton.disabled = true;

  mostrarEstado("Creando tu cuenta…");

  try {
    const { data, error } = await supabase.auth.signUp(credenciales);

    if (error) {
      mostrarEstado("No se pudo crear la cuenta: " + error.message);
      return;
    }

    if (!data.session) {
      mostrarEstado(
        "Cuenta creada. Revisá tu correo y confirmá el registro antes de iniciar sesión."
      );
    } else {
      mostrarEstado("Cuenta creada. Preparando tu perfil…");
    }

  } catch (error) {
    console.error("Error al crear la cuenta:", error);
    mostrarEstado("No se pudo completar el registro. Probá nuevamente.");
  } finally {
    if (boton) boton.disabled = false;
  }
}

async function cerrarSesion() {
  const boton = $("hm-auth-logout");
  if (boton) boton.disabled = true;

  mostrarEstado("Cerrando sesión…");

  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      mostrarEstado("No se pudo cerrar sesión: " + error.message);
      return;
    }

    usuarioActual = null;
    perfilActual = null;
    modoEdicionPerfil = false;
    limpiarFormularioPerfil();
    actualizarModoVisualizacion();
    mostrarEstado("Sesión cerrada.");

  } catch (error) {
    console.error("Error al cerrar sesión:", error);
    mostrarEstado("No se pudo cerrar la sesión. Probá nuevamente.");
  } finally {
    if (boton) boton.disabled = false;
  }
}

function actualizarInterfazUsuario() {
  const credenciales = $("hm-auth-credentials");
  const botonEntrar = $("hm-auth-login");
  const botonCrear = $("hm-auth-register");
  const botonSalir = $("hm-auth-logout");
  const panelAcceso = $("hm-auth-panel");

  const autenticado = Boolean(usuarioActual);

  if (panelAcceso) panelAcceso.hidden = autenticado;
  if (credenciales) credenciales.hidden = autenticado;
  if (botonEntrar) botonEntrar.hidden = autenticado;
  if (botonCrear) botonCrear.hidden = autenticado;
  if (botonSalir) botonSalir.hidden = !autenticado;

  if (!autenticado) {
    perfilActual = null;
    modoEdicionPerfil = false;
    limpiarFormularioPerfil();
    actualizarModoVisualizacion();
    mostrarEstado("Ingresá o creá tu cuenta para participar.");
    mostrarEstadoPerfil("");
    return;
  }

  mostrarEstado("Sesión activa: " + usuarioActual.email);
  actualizarModoVisualizacion();
}

function limpiarFormularioPerfil() {
  const nombre = $("nombre-usuario");
  const presentacion = $("hm-profile-presentation");
  const localidad = $("hm-profile-locality");
  const zona = $("hm-profile-zone");
  const whatsapp = $("whatsapp-usuario");
  const conectividad = $("hm-connectivity-available");
  const modalidad = $("hm-connectivity-mode");
  const mensajeriaOffline = $("hm-offline-messaging-available");
  const foto = $("foto-perfil-vista");
  const inicialFoto = $("foto-perfil-inicial");

  if (foto) {
    foto.hidden = true;
    foto.removeAttribute("src");
  }
  if (inicialFoto) inicialFoto.hidden = false;
  if (conectividad) conectividad.checked = false;
  if (modalidad) modalidad.value = "gratuito";
  if (mensajeriaOffline) mensajeriaOffline.checked = false;
  if (nombre) nombre.value = "";
  if (presentacion) presentacion.value = "";
  if (localidad) localidad.value = "";
  if (zona) zona.value = "";
  if (whatsapp) whatsapp.value = "";
}

async function cargarMisPublicaciones() {
  const contenedor = $("lista-mis-publicaciones");
  if (!contenedor) return;
  contenedor.replaceChildren();

  if (!usuarioActual || !perfilActual?.id) {
    contenedor.textContent = "Iniciá sesión y completá tu perfil para ver tus publicaciones.";
    return;
  }

  if (!contenedor.dataset.retiroConfigurado) {
    contenedor.dataset.retiroConfigurado = "true";
    contenedor.addEventListener("click", async (evento) => {
      const botonEditar = evento.target.closest(".btn-editar-mi-publicacion");
      if (botonEditar) {
        const publicacionId = botonEditar.dataset.pubId;
        const usuario = usuarioActual;
        if (!usuario?.id || !publicacionId) return;
        const { data: registro, error: errorLectura } = await supabase
          .from("publicaciones")
          .select("id, perfil_id, usuario_id, titulo, descripcion")
          .eq("id", publicacionId)
          .maybeSingle();
        if (errorLectura || !registro ||
            String(registro.perfil_id || registro.usuario_id) !== String(usuario.id)) {
          window.alert("No se pudo verificar que la publicación sea tuya.");
          return;
        }
        const tituloNuevo = window.prompt("Editar título de la publicación:", registro.titulo || "");
        if (tituloNuevo === null) return;
        if (!tituloNuevo.trim()) { window.alert("El título no puede quedar vacío."); return; }
        const descripcionActual = String(registro.descripcion || "");
        const descripcionVisible = descripcionActual
          .replace(/(?:^|\n)\[Condición informada:\s*[^\]]*\]\s*$/, "")
          .replace(/\n?\[HMC_META:[^\]]+\]\s*$/, "")
          .trim();
        const descripcionNueva = window.prompt("Editar descripción:", descripcionVisible);
        if (descripcionNueva === null) return;
        botonEditar.disabled = true;
        const meta = descripcionActual.match(/\n?\[HMC_META:[^\]]+\]\s*$/)?.[0] || "";
        const { error: errorActualizacion } = await supabase
          .from("publicaciones")
          .update({ titulo: tituloNuevo.trim(), descripcion: descripcionNueva.trim() + meta, actualizado_en: new Date().toISOString() })
          .eq("id", publicacionId)
          .eq("perfil_id", usuario.id);
        if (errorActualizacion) {
          console.error("No se pudo editar la publicación:", errorActualizacion);
          botonEditar.disabled = false;
          window.alert("No se pudo guardar la edición. Revisá la conexión e intentá nuevamente.");
          return;
        }
        await cargarMisPublicaciones();
        window.dispatchEvent(new CustomEvent("publicacionComunidadActualizada"));
        return;
      }
      const boton = evento.target.closest(".btn-retirar-mi-publicacion");
      if (!boton) return;
      const usuario = usuarioActual;
      const publicacionId = boton.dataset.pubId;
      if (!usuario?.id || !publicacionId) return;
      const confirmar = window.confirm("¿Querés retirar esta publicación de la comunidad? Podrás volver a publicar más adelante.");
      if (!confirmar) return;
      boton.disabled = true;
      const { error } = await supabase
        .from("publicaciones")
        .update({ estado: "retirada", actualizado_en: new Date().toISOString() })
        .eq("id", publicacionId)
        .eq("perfil_id", usuario.id);
      if (error) {
        console.error("No se pudo retirar la publicación propia:", error);
        boton.disabled = false;
        window.alert("No se pudo retirar la publicación. Intentá nuevamente.");
        return;
      }
      await cargarMisPublicaciones();
      window.dispatchEvent(new CustomEvent("perfilComunidadActualizado"));
    });
  }

  const aviso = document.createElement("p");
  aviso.textContent = "Cargando tus publicaciones…";
  contenedor.appendChild(aviso);

  try {
    const { data, error } = await supabase
      .from("publicaciones")
      .select("id, perfil_id, usuario_id, tipo, categoria, titulo, descripcion, estado, creado_en")
      .eq("estado", "publicada")
      .order("creado_en", { ascending: false });

    contenedor.replaceChildren();
    if (error) throw error;

    const propias = (data || []).filter((publicacion) =>
      String(publicacion.perfil_id || publicacion.usuario_id || "") === String(usuarioActual.id)
    );
    const activas = propias.length;
    const contador = document.createElement("p");
    contador.className = "texto-ayuda";
    contador.textContent = `${activas} publicación${activas === 1 ? "" : "es"} publicada${activas === 1 ? "" : "s"}`;
    contenedor.appendChild(contador);

    if (!propias.length) {
      const vacio = document.createElement("p");
      vacio.textContent = "Todavía no publicaste productos ni servicios desde esta cuenta.";
      contenedor.appendChild(vacio);
      return;
    }

    propias.forEach((publicacion) => {
      const tarjeta = document.createElement("article");
      tarjeta.className = "tarjeta-publicacion";
      const titulo = document.createElement("h4");
      titulo.textContent = publicacion.titulo || "Publicación sin título";
      const detalle = document.createElement("p");
      const descripcionOriginal = publicacion.descripcion || "";
      const metaMatch = descripcionOriginal.match(/(?:^|\n)\[HMC_META:([^\]]+)\]\s*$/);
      let metadatos = {};
      if (metaMatch) {
        try { metadatos = JSON.parse(decodeURIComponent(metaMatch[1])); } catch (error) {
          console.warn("No se pudieron leer los metadatos de la publicación propia:", error);
        }
      }
      detalle.textContent = descripcionOriginal
        .replace(/(?:^|\n)\[Condición informada:\s*[^\]]*\]\s*$/, "")
        .replace(/\n?\[HMC_META:[^\]]+\]\s*$/, "")
        .trim();
      const estado = document.createElement("small");
      const tipoOriginal = metadatos.tipoUI || publicacion.tipo;
      const tipoVisible = ["oferta", "ofrezco"].includes(tipoOriginal) ? "OFREZCO" : "BUSCO";
      const categoriaVisible = metadatos.categoriaUI || publicacion.categoria || "Sin categoría";
      estado.textContent = `${tipoVisible} · ${categoriaVisible} · Estado: ${publicacion.estado || "sin especificar"}`;
      tarjeta.append(titulo, detalle, estado);

      if (publicacion.estado === "publicada") {
        const acciones = document.createElement("div");
        acciones.className = "mis-publicaciones-acciones";
        const editar = document.createElement("button");
        editar.type = "button";
        editar.className = "boton-secundario btn-editar-mi-publicacion";
        editar.dataset.pubId = String(publicacion.id);
        editar.textContent = "EDITAR PUBLICACIÓN";
        const retirar = document.createElement("button");
        retirar.type = "button";
        retirar.className = "boton-secundario btn-retirar-mi-publicacion";
        retirar.dataset.pubId = String(publicacion.id);
        retirar.textContent = "RETIRAR PUBLICACIÓN";
        acciones.append(editar, retirar);
        tarjeta.appendChild(acciones);
      }

      contenedor.appendChild(tarjeta);
    });

  } catch (error) {
    console.error("Error cargando publicaciones propias:", error);
    contenedor.textContent = "No se pudieron cargar tus publicaciones.";
  }
}

async function calcularPorcentajeHumanidad(perfilId) {
  try {
    const { data: evaluaciones, error } = await supabase
      .from("evaluaciones")
      .select("respeta_condiciones, cordialidad, puntualidad, comunicacion_clara")
      .eq("evaluado_id", perfilId);

    if (!error && Array.isArray(evaluaciones) && evaluaciones.length > 0) {
      let totalChecksPositivos = 0;
      const totalCriteriosPosibles = evaluaciones.length * 4;

      evaluaciones.forEach((ev) => {
        if (ev.respeta_condiciones) totalChecksPositivos++;
        if (ev.cordialidad) totalChecksPositivos++;
        if (ev.puntualidad) totalChecksPositivos++;
        if (ev.comunicacion_clara) totalChecksPositivos++;
      });

      return {
        porcentaje: Math.round((totalChecksPositivos / totalCriteriosPosibles) * 100),
        total: evaluaciones.length
      };
    }

    const { data: mediciones, error: errorMediciones } = await supabase
      .from("mediciones_humanidad")
      .select("resultado")
      .eq("evaluado_id", perfilId);

    if (!errorMediciones && Array.isArray(mediciones)) {
      const puntuaciones = mediciones
        .map((medicion) => {
          if (medicion.resultado === "excelente") return 100;
          if (medicion.resultado === "neutral") return 60;
          if (medicion.resultado === "deficiente") return 0;
          return null;
        })
        .filter((valor) => valor !== null);

      if (puntuaciones.length) {
        const promedio = Math.round(
          puntuaciones.reduce((suma, valor) => suma + valor, 0) / puntuaciones.length
        );
        return { porcentaje: promedio, total: puntuaciones.length };
      }

      return { porcentaje: 0, total: 0 };
    }

    console.warn("No se pudieron consultar las fuentes de evaluaciones:", error || errorMediciones);
    return { porcentaje: 0, total: 0 };

  } catch (e) {
    console.error("Error calculando porcentaje de humanidad:", e);
    return { porcentaje: 0, total: 0 };
  }
}

async function cargarPerfil() {
  if (!usuarioActual || cargaPerfilEnCurso) return;

  cargaPerfilEnCurso = true;

  try {
    prepararFormularioPerfil();
    mostrarEstadoPerfil("Buscando tu perfil…");

    const { data, error } = await supabase
      .from("perfiles")
      .select(
        "id, nombre_visible, presentacion, localidad, zona_aproximada, whatsapp, foto_url, conectividad_disponible, conectividad_modalidad, conectividad_emergencias, conectividad_zona, mensajeria_offline, estado_acceso_comunidad, procesos_incumplidos, motivo_restriccion"
      )
      .eq("id", usuarioActual.id)
      .maybeSingle();

    if (error) {
      console.error("Error al consultar el perfil:", error);
      mostrarEstadoPerfil("No se pudo consultar tu perfil: " + error.message);
      return;
    }

    perfilActual = data || null;

    if (perfilActual) {
      perfilActual.indice_humanidad = await calcularPorcentajeHumanidad(usuarioActual.id);
    }

    if ($("nombre-usuario")) $("nombre-usuario").value = data?.nombre_visible || "";
    if ($("hm-profile-presentation")) $("hm-profile-presentation").value = data?.presentacion || "";
    if ($("hm-profile-locality")) $("hm-profile-locality").value = data?.localidad || "";
    if ($("hm-profile-zone")) $("hm-profile-zone").value = data?.zona_aproximada || "";
    if ($("whatsapp-usuario")) $("whatsapp-usuario").value = data?.whatsapp || "";
    if ($("hm-connectivity-available")) {
      $("hm-connectivity-available").checked = String(data?.conectividad_disponible).toLowerCase() === "true";
      $("hm-connectivity-available").dispatchEvent(new Event("change"));
    }
    if ($("hm-connectivity-mode")) $("hm-connectivity-mode").value = data?.conectividad_modalidad || "gratuito";
    if ($("hm-offline-messaging-available")) {
      $("hm-offline-messaging-available").checked = Boolean(data?.mensajeria_offline);
    }

    if ($("foto-perfil-vista") && data?.foto_url) {
      const vistaFoto = $("foto-perfil-vista");
      vistaFoto.src = data.foto_url;
      vistaFoto.style.objectFit = "cover";
      vistaFoto.style.objectPosition = "center";
      vistaFoto.hidden = false;
      if ($("foto-perfil-inicial")) $("foto-perfil-inicial").hidden = true;
    }

    modoEdicionPerfil = !perfilEstaCompleto();

    actualizarModoVisualizacion();
    await cargarMisPublicaciones();

  } catch (error) {
    console.error("Error inesperado al cargar el perfil:", error);
    mostrarEstadoPerfil("Ocurrió un error al cargar el perfil.");
  } finally {
    cargaPerfilEnCurso = false;
  }
}

async function guardarPerfil(evento) {
  evento.preventDefault();
  evento.stopImmediatePropagation();

  if (!usuarioActual) {
    mostrarEstadoPerfil("Primero tenés que iniciar sesión.");
    return;
  }

  const nombre = $("nombre-usuario")?.value.trim() || "";
  const presentacion = $("hm-profile-presentation")?.value.trim() || "";
  const localidad = $("hm-profile-locality")?.value.trim() || "";
  const zona = $("hm-profile-zone")?.value.trim() || "";
  const whatsapp = $("whatsapp-usuario")?.value.trim() || "";
  const archivoFotoSeleccionado = $("foto-perfil-archivo")?.files?.[0] || null;
  const conectividadDisponible = Boolean($("hm-connectivity-available")?.checked);
  const conectividadModalidad = $("hm-connectivity-mode")?.value || "gratuito";
  const mensajeriaOffline = Boolean($("hm-offline-messaging-available")?.checked);
  let fotoUrl = perfilActual?.foto_url || null;

  if (!nombre) {
    mostrarEstadoPerfil("Escribí el nombre visible.");
    $("nombre-usuario")?.focus();
    return;
  }
  if (!whatsapp) {
    mostrarEstadoPerfil("El número de WhatsApp es obligatorio.");
    $("whatsapp-usuario")?.focus();
    return;
  }
  if (!presentacion) {
    mostrarEstadoPerfil("Completá tu presentación comunitaria.");
    $("hm-profile-presentation")?.focus();
    return;
  }
  if (!localidad) {
    mostrarEstadoPerfil("Indicá tu localidad para participar del radar vecinal.");
    $("hm-profile-locality")?.focus();
    return;
  }
  if (!perfilActual?.foto_url && !archivoFotoSeleccionado) {
    mostrarEstadoPerfil("Subí una fotografía para completar tu perfil.");
    $("foto-perfil-archivo")?.focus();
    return;
  }

  const boton = $("btn-guardar-perfil");
  if (boton) {
    boton.disabled = true;
    boton.textContent = "GUARDANDO…";
  }

  mostrarEstadoPerfil("Guardando perfil en tu cuenta…");

  try {
    const archivoFoto = archivoFotoSeleccionado;

    if (archivoFoto) {
      const extension = archivoFoto.type === "image/png" ? "png" : archivoFoto.type === "image/webp" ? "webp" : "jpg";
      const rutaFoto = `${usuarioActual.id}-${Date.now()}.${extension}`;

      const { error: errorSubida } = await supabase.storage
        .from("fotos-perfil")
        .upload(rutaFoto, archivoFoto, {
          upsert: true,
          contentType: archivoFoto.type,
          cacheControl: "3600"
        });

      if (errorSubida) {
        console.error("Detalle del error de Storage:", errorSubida);
        mostrarEstadoPerfil("No se pudo subir la foto: " + (errorSubida.message || errorSubida.error));
        return;
      }

      const { data: urlFoto } = supabase.storage.from("fotos-perfil").getPublicUrl(rutaFoto);
      fotoUrl = urlFoto?.publicUrl || null;
    }

    const registro = {
      id: usuarioActual.id,
      nombre_visible: nombre,
      presentacion: presentacion || null,
      localidad: localidad || null,
      zona_aproximada: zona || null,
      whatsapp: whatsapp || null,
      foto_url: fotoUrl,
      conectividad_disponible: conectividadDisponible ? "true" : "false",
      conectividad_modalidad: conectividadModalidad,
      conectividad_emergencias: false,
      conectividad_zona: null,
      mensajeria_offline: mensajeriaOffline,
      actualizado_en: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from("perfiles")
      .upsert(registro, { onConflict: "id" })
      .select(
        "id, nombre_visible, presentacion, localidad, zona_aproximada, whatsapp, foto_url, conectividad_disponible, conectividad_modalidad, conectividad_emergencias, conectividad_zona, mensajeria_offline, estado_acceso_comunidad, procesos_incumplidos, motivo_restriccion"
      )
      .single();

    if (error) {
      console.error("Error al guardar el perfil en tabla:", error);
      mostrarEstadoPerfil("No se pudo guardar el perfil: " + error.message);
      return;
    }

    perfilActual = data;
    perfilActual.indice_humanidad = await calcularPorcentajeHumanidad(usuarioActual.id);
    modoEdicionPerfil = false;
    actualizarModoVisualizacion();

    if ($("foto-perfil-archivo")) $("foto-perfil-archivo").value = "";
    await cargarMisPublicaciones();
    window.dispatchEvent(new CustomEvent("perfilComunidadActualizado"));

    mostrarEstadoPerfil("¡Perfil guardado correctamente!");
    mostrarEstado("Sesión activa: " + usuarioActual.email);

  } catch (error) {
    console.error("Error inesperado en guardado:", error);
    mostrarEstadoPerfil("Error de red al guardar. Verificá tu conexión.");
  } finally {
    if (boton) {
      boton.disabled = false;
      boton.textContent = perfilActual?.id ? "GUARDAR CAMBIOS" : "GUARDAR / CREAR PERFIL";
    }
  }
}

export function obtenerUsuarioActual() {
  return usuarioActual;
}

export function obtenerPerfilActual() {
  return perfilActual;
}

export async function iniciarAutenticacion() {
  crearInterfazAcceso();
  prepararFormularioPerfil();
  window.addEventListener("publicacionComunidadActualizada", cargarMisPublicaciones);

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    mostrarEstado("No se pudo consultar la sesión: " + error.message);
    return;
  }

  usuarioActual = data.session?.user || null;
  actualizarInterfazUsuario();

  if (usuarioActual) {
    await cargarPerfil();
  }

  if (!escuchadorAutenticacion) {
    const resultado = supabase.auth.onAuthStateChange((_evento, sesion) => {
      usuarioActual = sesion?.user || null;
      actualizarInterfazUsuario();

      if (usuarioActual) {
        window.setTimeout(() => {
          cargarPerfil();
        }, 0);
      }
    });

    escuchadorAutenticacion = resultado.data.subscription;
  }
}
