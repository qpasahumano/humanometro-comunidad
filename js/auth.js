import { supabase } from "./supabase.js";

let usuarioActual = null;
let perfilActual = null;
let escuchadorAutenticacion = null;
let cargaPerfilEnCurso = false;
let modoEdicionPerfil = false;

const $ = (id) => document.getElementById(id);

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

      <button id="hm-auth-logout" class="boton-secundario" type="button" hidden>
        CERRAR SESIÓN
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
  $("hm-auth-logout").addEventListener("click", cerrarSesion);

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
      placeholder: "Contá algo sobre vos, tus intereses o lo que ofrecés."
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
    },
    {
      id: "hm-profile-whatsapp",
      nombre: "WhatsApp",
      etiqueta: "Número de WhatsApp (para contacto con Wi-Fi)",
      tipo: "input",
      max: 30,
      placeholder: "Ej.: +5491112345678"
    }
  ];

  const boton = $("btn-guardar-perfil");

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

    if (boton) {
      formulario.insertBefore(etiqueta, boton);
      formulario.insertBefore(control, boton);
    } else {
      formulario.append(etiqueta, control);
    }
  });

  // Conectividad Solidaria y Emergencias
  if (!$("hm-connectivity-available")) {
    const bloque = document.createElement("fieldset");
    bloque.className = "perfil-conectividad tarjeta";
    bloque.innerHTML = `
      <legend>Conectividad Solidaria</legend>
      <label class="control-check" for="hm-connectivity-available">
        <input id="hm-connectivity-available" type="checkbox">
        Puedo ofrecer acceso a Internet voluntariamente
      </label>
      <label for="hm-connectivity-mode">Modalidad</label>
      <select id="hm-connectivity-mode">
        <option value="gratuito">Gratuito / solidario</option>
        <option value="intercambio">Por intercambio</option>
        <option value="ambas">Ambas modalidades</option>
      </select>
      <label class="control-check" for="hm-connectivity-emergency">
        <input id="hm-connectivity-emergency" type="checkbox">
        Podría ofrecerlo durante una emergencia si tengo conexión y energía
      </label>
      <label for="hm-connectivity-zone">Zona aproximada para ofrecer conectividad</label>
      <input id="hm-connectivity-zone" type="text" maxlength="120" placeholder="Ej.: zona centro de mi localidad">
      <p class="texto-ayuda">La oferta es voluntaria. No publiques contraseñas ni tu dirección exacta. Podés pausar o desactivar esta opción cuando quieras.</p>
    `;
    if (boton) formulario.insertBefore(bloque, boton);
    else formulario.appendChild(bloque);
  }

  // Crear contenedor de Ficha Visual (Modo Lectura) si no existe
  let fichaVisual = $("hm-perfil-ficha");
  if (!fichaVisual) {
    fichaVisual = document.createElement("div");
    fichaVisual.id = "hm-perfil-ficha";
    fichaVisual.className = "tarjeta perfil-ficha-visual";
    formulario.parentNode.insertBefore(fichaVisual, formulario);
  }

  // Asegurar estilos correctos en la vista previa de la foto
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
    const urlTemporal = URL.createObjectURL(archivo);
    if (vista) {
      if (vista.dataset.previewUrl) URL.revokeObjectURL(vista.dataset.previewUrl);
      vista.src = urlTemporal;
      vista.style.objectFit = "cover";
      vista.style.objectPosition = "center";
      vista.dataset.previewUrl = urlTemporal;
      vista.hidden = false;
    }
    if (inicial) inicial.hidden = true;
  });

  formulario.addEventListener("submit", guardarPerfil, true);
  actualizarModoVisualizacion();
}

function actualizarModoVisualizacion() {
  const formulario = $("form-perfil");
  const ficha = $("hm-perfil-ficha");
  const autenticado = Boolean(usuarioActual);

  if (!autenticado) {
    if (formulario) formulario.hidden = true;
    if (ficha) ficha.hidden = true;
    return;
  }

  if (modoEdicionPerfil) {
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
  const fotoSrc = datos.foto_url || "";
  const inicial = datos.nombre_visible ? datos.nombre_visible.charAt(0).toUpperCase() : "H";

  contenedor.innerHTML = `
    <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 15px;">
      <div style="width: 70px; height: 70px; border-radius: 50%; overflow: hidden; background: #1e293b; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; color: #fff; font-weight: bold; flex-shrink: 0; border: 2px solid #38bdf8;">
        ${fotoSrc ? `<img src="${fotoSrc}" alt="Foto de perfil" style="width: 100%; height: 100%; object-fit: cover;">` : inicial}
      </div>
      <div>
        <h3 style="margin: 0; color: #38bdf8; font-size: 1.2rem;">${datos.nombre_visible || "Sin nombre visible"}</h3>
        <p style="margin: 4px 0 0 0; font-size: 0.9rem; color: #94a3b8;">${datos.localidad ? `📍 ${datos.localidad}` : "Sin localidad especificada"}</p>
      </div>
    </div>

    <div style="display: flex; flex-direction: column; gap: 8px; font-size: 0.95rem; color: #cbd5e1; border-top: 1px solid #334155; padding-top: 12px;">
      <p><strong>Presentación:</strong> ${datos.presentacion || "Sin presentación cargada."}</p>
      <p><strong>Zona aproximada:</strong> ${datos.zona_aproximada || "No especificada"}</p>
      <p><strong>WhatsApp:</strong> ${datos.whatsapp || "No vinculado"}</p>
      <div style="background: #0f172a; padding: 10px; border-radius: 6px; margin-top: 6px; border: 1px solid #334155;">
        <strong style="color: #38bdf8; display: block; margin-bottom: 4px;">🌐 Conectividad Solidaria</strong>
        <p style="margin: 0; font-size: 0.85rem;">${datos.conectividad_disponible ? `🟢 Activa (${datos.conectividad_modalidad}) - Zona: ${datos.conectividad_zona || "General"}` : "🔴 No ofrecida actualmente"}</p>
      </div>
    </div>

    <button id="btn-activar-edicion" class="boton-accion" type="button" style="margin-top: 15px; width: 100%;">
      EDITAR PERFIL
    </button>
  `;

  $("btn-activar-edicion")?.addEventListener("click", () => {
    modoEdicionPerfil = true;
    actualizarModoVisualizacion();
  });
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

  const autenticado = Boolean(usuarioActual);

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
  const whatsapp = $("hm-profile-whatsapp");
  const conectividad = $("hm-connectivity-available");
  const modalidad = $("hm-connectivity-mode");
  const emergencia = $("hm-connectivity-emergency");
  const zonaConectividad = $("hm-connectivity-zone");
  const foto = $("foto-perfil-vista");
  const inicialFoto = $("foto-perfil-inicial");

  if (foto) { foto.hidden = true; foto.removeAttribute("src"); }
  if (inicialFoto) inicialFoto.hidden = false;
  if (conectividad) conectividad.checked = false;
  if (modalidad) modalidad.value = "gratuito";
  if (emergencia) emergencia.checked = false;
  if (zonaConectividad) zonaConectividad.value = "";
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
  const aviso = document.createElement("p");
  aviso.textContent = "Cargando tus publicaciones…";
  contenedor.appendChild(aviso);
  try {
    const { data, error } = await supabase
      .from("publicaciones")
      .select("id, tipo, categoria, titulo, descripcion, estado, creado_en")
      .eq("perfil_id", perfilActual.id)
      .order("creado_en", { ascending: false });
    contenedor.replaceChildren();
    if (error) throw error;
    if (!data?.length) {
      contenedor.textContent = "Todavía no publicaste productos ni servicios desde esta cuenta.";
      return;
    }
    data.forEach((publicacion) => {
      const tarjeta = document.createElement("article");
      tarjeta.className = "tarjeta-publicacion";
      const titulo = document.createElement("h4");
      titulo.textContent = publicacion.titulo || "Publicación sin título";
      const detalle = document.createElement("p");
      detalle.textContent = publicacion.descripcion || "";
      const estado = document.createElement("small");
      estado.textContent = `${publicacion.tipo === "oferta" ? "OFREZCO" : "BUSCO"} · ${publicacion.categoria || "Sin categoría"} · Estado: ${publicacion.estado || "sin especificar"}`;
      tarjeta.append(titulo, detalle, estado);
      contenedor.appendChild(tarjeta);
    });
  } catch (error) {
    console.error("Error cargando publicaciones propias:", error);
    contenedor.textContent = "No se pudieron cargar tus publicaciones.";
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
        "id, nombre_visible, presentacion, localidad, zona_aproximada, whatsapp, foto_url, conectividad_disponible, conectividad_modalidad, conectividad_emergencias, conectividad_zona"
      )
      .eq("id", usuarioActual.id)
      .maybeSingle();

    if (error) {
      console.error("Error al consultar el perfil:", error);
      mostrarEstadoPerfil("No se pudo consultar tu perfil: " + error.message);
      return;
    }

    perfilActual = data || null;

    if ($("nombre-usuario")) $("nombre-usuario").value = data?.nombre_visible || "";
    if ($("hm-profile-presentation")) $("hm-profile-presentation").value = data?.presentacion || "";
    if ($("hm-profile-locality")) $("hm-profile-locality").value = data?.localidad || "";
    if ($("hm-profile-zone")) $("hm-profile-zone").value = data?.zona_aproximada || "";
    if ($("hm-profile-whatsapp")) $("hm-profile-whatsapp").value = data?.whatsapp || "";
    if ($("hm-connectivity-available")) $("hm-connectivity-available").checked = Boolean(data?.conectividad_disponible);
    if ($("hm-connectivity-mode")) $("hm-connectivity-mode").value = data?.conectividad_modalidad || "gratuito";
    if ($("hm-connectivity-emergency")) $("hm-connectivity-emergency").checked = Boolean(data?.conectividad_emergencias);
    if ($("hm-connectivity-zone")) $("hm-connectivity-zone").value = data?.conectividad_zona || "";

    if ($("foto-perfil-vista") && data?.foto_url) {
      const vistaFoto = $("foto-perfil-vista");
      vistaFoto.src = data.foto_url;
      vistaFoto.style.objectFit = "cover";
      vistaFoto.style.objectPosition = "center";
      vistaFoto.hidden = false;
      if ($("foto-perfil-inicial")) $("foto-perfil-inicial").hidden = true;
    }

    // Si el usuario nunca creó perfil, lo mandamos directo a modo edición para que cargue sus datos
    if (!data) {
      modoEdicionPerfil = true;
    }

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
  const whatsapp = $("hm-profile-whatsapp")?.value.trim() || "";
  const conectividadDisponible = Boolean($("hm-connectivity-available")?.checked);
  const conectividadModalidad = $("hm-connectivity-mode")?.value || "gratuito";
  const conectividadEmergencias = Boolean($("hm-connectivity-emergency")?.checked);
  const conectividadZona = $("hm-connectivity-zone")?.value.trim() || "";
  let fotoUrl = perfilActual?.foto_url || null;

  if (!nombre) {
    mostrarEstadoPerfil("Escribí el nombre visible.");
    $("nombre-usuario")?.focus();
    return;
  }

  const boton = $("btn-guardar-perfil");
  if (boton) {
    boton.disabled = true;
    boton.textContent = "GUARDANDO…";
  }

  mostrarEstadoPerfil("Guardando perfil en tu cuenta…");

  try {
    const archivoFoto = $("foto-perfil-archivo")?.files?.[0];
    if (archivoFoto) {
      const extension = archivoFoto.type === "image/png" ? "png" : archivoFoto.type === "image/webp" ? "webp" : "jpg";
      const rutaFoto = `${usuarioActual.id}/perfil-${Date.now()}.${extension}`;
      const { error: errorSubida } = await supabase.storage
        .from("fotos-perfil")
        .upload(rutaFoto, archivoFoto, {
          upsert: true,
          contentType: archivoFoto.type,
          cacheControl: "3600"
        });
      if (errorSubida) {
        mostrarEstadoPerfil("No se pudo subir la foto: " + errorSubida.message);
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
      conectividad_disponible: conectividadDisponible,
      conectividad_modalidad: conectividadModalidad,
      conectividad_emergencias: conectividadEmergencias,
      conectividad_zona: conectividadZona || null,
      actualizado_en: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from("perfiles")
      .upsert(registro, { onConflict: "id" })
      .select(
        "id, nombre_visible, presentacion, localidad, zona_aproximada, whatsapp, foto_url, conectividad_disponible, conectividad_modalidad, conectividad_emergencias, conectividad_zona"
      )
      .single();

    if (error) {
      console.error("Error al guardar el perfil:", error);
      mostrarEstadoPerfil("No se pudo guardar el perfil: " + error.message);
      return;
    }

    perfilActual = data;
    modoEdicionPerfil = false; // Volver automáticamente a modo ficha al guardar con éxito
    actualizarModoVisualizacion();

    if ($("foto-perfil-archivo")) $("foto-perfil-archivo").value = "";
    await cargarMisPublicaciones();

    mostrarEstadoPerfil("¡Perfil guardado correctamente!");
    mostrarEstado("Sesión activa: " + usuarioActual.email);

  } catch (error) {
    console.error("Error inesperado al guardar el perfil:", error);
    mostrarEstadoPerfil("Ocurrió un error al guardar el perfil.");
  } finally {
    if (boton) {
      boton.disabled = false;
      boton.textContent = "GUARDAR PERFIL";
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
