import { supabase } from "./supabase.js";

let usuarioActual = null;
let perfilActual = null;
let escuchadorAutenticacion = null;

function crearInterfazAcceso() {
  if (document.getElementById("hm-auth-panel")) return;

  const panel = document.createElement("section");
  panel.id = "hm-auth-panel";
  panel.style.cssText = `
    max-width: 440px;
    margin: 20px auto;
    padding: 20px;
    border-radius: 16px;
    background: #ffffff;
    color: #222;
    box-shadow: 0 4px 18px rgba(0,0,0,.12);
    font-family: sans-serif;
  `;

  panel.innerHTML = `
    <h2 style="margin-top:0">Tu cuenta comunitaria</h2>
    <p>Ingresá o creá tu cuenta para participar en la comunidad.</p>

    <label for="hm-auth-email">Correo electrónico</label>
    <input id="hm-auth-email" type="email"
      autocomplete="email" placeholder="tu@correo.com" required
      style="display:block;box-sizing:border-box;width:100%;padding:12px;margin:8px 0 14px">

    <label for="hm-auth-password">Contraseña</label>
    <input id="hm-auth-password" type="password"
      autocomplete="current-password" minlength="8"
      placeholder="Mínimo 8 caracteres" required
      style="display:block;box-sizing:border-box;width:100%;padding:12px;margin:8px 0 14px">

    <button id="hm-auth-login" type="button"
      style="padding:12px;margin:4px;border:0;border-radius:8px;cursor:pointer">
      Iniciar sesión
    </button>

    <button id="hm-auth-register" type="button"
      style="padding:12px;margin:4px;border:0;border-radius:8px;cursor:pointer">
      Crear cuenta
    </button>

    <button id="hm-auth-logout" type="button" hidden
      style="padding:12px;margin:4px;border:0;border-radius:8px;cursor:pointer">
      Cerrar sesión
    </button>

    <p id="hm-auth-status" role="status" aria-live="polite"></p>
  `;

  const destino =
    document.getElementById("pantalla-comunidad") ||
    document.querySelector("main") ||
    document.body;

  destino.prepend(panel);

  document.getElementById("hm-auth-login")
    .addEventListener("click", iniciarSesion);

  document.getElementById("hm-auth-register")
    .addEventListener("click", crearCuenta);

  document.getElementById("hm-auth-logout")
    .addEventListener("click", cerrarSesion);
}

function crearInterfazPerfil() {
  if (document.getElementById("hm-profile-panel")) return;

  const panel = document.createElement("section");
  panel.id = "hm-profile-panel";
  panel.style.cssText = `
    max-width: 600px;
    margin: 20px auto;
    padding: 20px;
    border: 1px solid #29475c;
    border-radius: 16px;
    background: #091c30;
    color: #f4f8ff;
    font-family: sans-serif;
  `;

  panel.innerHTML = `
    <h2 style="margin-top:0">Mi perfil comunitario</h2>
    <p>Completá los datos que querés compartir con la comunidad.</p>

    <form id="hm-profile-form">
      <label for="hm-profile-name">Nombre visible *</label>
      <input id="hm-profile-name" type="text"
        maxlength="80" required
        placeholder="Cómo querés aparecer"
        style="display:block;box-sizing:border-box;width:100%;padding:12px;margin:8px 0 14px">

      <label for="hm-profile-presentation">Presentación</label>
      <textarea id="hm-profile-presentation"
        maxlength="600" rows="3"
        placeholder="Contá algo sobre vos, tus intereses o lo que ofrecés."
        style="display:block;box-sizing:border-box;width:100%;padding:12px;margin:8px 0 14px"></textarea>

      <label for="hm-profile-locality">Localidad</label>
      <input id="hm-profile-locality" type="text"
        maxlength="100" placeholder="Ej.: San Vicente"
        style="display:block;box-sizing:border-box;width:100%;padding:12px;margin:8px 0 14px">

      <label for="hm-profile-zone">Zona aproximada</label>
      <input id="hm-profile-zone" type="text"
        maxlength="120" placeholder="Ej.: zona centro"
        style="display:block;box-sizing:border-box;width:100%;padding:12px;margin:8px 0 14px">

      <button id="hm-profile-save" type="submit"
        style="padding:13px 18px;border:0;border-radius:9px;cursor:pointer;font-weight:bold">
        GUARDAR PERFIL
      </button>
    </form>

    <p id="hm-profile-status" role="status" aria-live="polite"></p>
  `;

  const destino =
    document.getElementById("vista-perfil") ||
    document.getElementById("pantalla-comunidad");

  if (destino) destino.prepend(panel);

  document.getElementById("hm-profile-form")
    .addEventListener("submit", guardarPerfil);
}

function mostrarEstado(mensaje) {
  const estado = document.getElementById("hm-auth-status");
  if (estado) estado.textContent = mensaje;
}

function mostrarEstadoPerfil(mensaje) {
  const estado = document.getElementById("hm-profile-status");
  if (estado) estado.textContent = mensaje;
}

function obtenerCredenciales() {
  const email = document.getElementById("hm-auth-email")?.value.trim();
  const password = document.getElementById("hm-auth-password")?.value;

  if (!email || !password) {
    mostrarEstado("Ingresá tu correo y contraseña.");
    return null;
  }

  if (password.length < 8) {
    mostrarEstado("La contraseña debe tener al menos 8 caracteres.");
    return null;
  }

  return { email, password };
}

async function iniciarSesion() {
  const datos = obtenerCredenciales();
  if (!datos) return;

  mostrarEstado("Iniciando sesión…");

  const { error } = await supabase.auth.signInWithPassword(datos);

  if (error) {
    mostrarEstado("No se pudo iniciar sesión: " + error.message);
    return;
  }

  mostrarEstado("Sesión iniciada. Consultando tu perfil…");
}

async function crearCuenta() {
  const datos = obtenerCredenciales();
  if (!datos) return;

  mostrarEstado("Creando cuenta…");

  const { data, error } = await supabase.auth.signUp({
    email: datos.email,
    password: datos.password
  });

  if (error) {
    mostrarEstado("No se pudo crear la cuenta: " + error.message);
    return;
  }

  if (!data.session) {
    mostrarEstado(
      "Cuenta creada. Revisá tu correo para confirmar el registro antes de ingresar."
    );
  } else {
    mostrarEstado("Cuenta creada. Preparando tu perfil…");
  }
}

async function cerrarSesion() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    mostrarEstado("No se pudo cerrar sesión: " + error.message);
    return;
  }

  perfilActual = null;
  mostrarEstado("Sesión cerrada.");
}

function actualizarUsuario(usuario) {
  usuarioActual = usuario || null;

  const botonEntrar = document.getElementById("hm-auth-login");
  const botonCrear = document.getElementById("hm-auth-register");
  const botonSalir = document.getElementById("hm-auth-logout");
  const panelPerfil = document.getElementById("hm-profile-panel");

  if (botonEntrar) botonEntrar.hidden = Boolean(usuarioActual);
  if (botonCrear) botonCrear.hidden = Boolean(usuarioActual);
  if (botonSalir) botonSalir.hidden = !usuarioActual;

  if (panelPerfil) {
    panelPerfil.hidden = !usuarioActual;
  }

  if (!usuarioActual) {
    perfilActual = null;
    mostrarEstado("Ingresá o creá tu cuenta para participar.");
    return;
  }

  mostrarEstado("Sesión activa: " + usuarioActual.email);

  if (panelPerfil) {
    cargarPerfil();
  }
}

async function cargarPerfil() {
  if (!usuarioActual) return;

  crearInterfazPerfil();

  const panel = document.getElementById("hm-profile-panel");
  if (panel) panel.hidden = false;

  mostrarEstadoPerfil("Buscando tu perfil…");

  const { data, error } = await supabase
    .from("perfiles")
    .select("id, nombre_visible, presentacion, localidad, zona_aproximada, foto_url")
    .eq("id", usuarioActual.id)
    .maybeSingle();

  if (error) {
    console.error("Error al consultar el perfil:", error);
    mostrarEstadoPerfil(
      "No pudimos consultar el perfil. Revisaremos las políticas de seguridad y los permisos."
    );
    return;
  }

  perfilActual = data || null;

  document.getElementById("hm-profile-name").value =
    data?.nombre_visible || "";

  document.getElementById("hm-profile-presentation").value =
    data?.presentacion || "";

  document.getElementById("hm-profile-locality").value =
    data?.localidad || "";

  document.getElementById("hm-profile-zone").value =
    data?.zona_aproximada || "";

  mostrarEstadoPerfil(
    data
      ? "Perfil cargado. Podés revisar los datos y guardarlos."
      : "Todavía no tenés perfil. Completá los datos y pulsá GUARDAR PERFIL."
  );
}

async function guardarPerfil(evento) {
  evento.preventDefault();

  if (!usuarioActual) {
    mostrarEstadoPerfil("Primero tenés que iniciar sesión.");
    return;
  }

  const nombre = document.getElementById("hm-profile-name").value.trim();
  const presentacion =
    document.getElementById("hm-profile-presentation").value.trim();
  const localidad =
    document.getElementById("hm-profile-locality").value.trim();
  const zona =
    document.getElementById("hm-profile-zone").value.trim();

  if (!nombre) {
    mostrarEstadoPerfil("Escribí el nombre visible.");
    return;
  }

  const registro = {
    id: usuarioActual.id,
    nombre_visible: nombre,
    presentacion: presentacion || null,
    localidad: localidad || null,
    zona_aproximada: zona || null,
    actualizado_en: new Date().toISOString()
  };

  mostrarEstadoPerfil("Guardando perfil…");

  const { data, error } = await supabase
    .from("perfiles")
    .upsert(registro, { onConflict: "id" })
    .select("id, nombre_visible, presentacion, localidad, zona_aproximada, foto_url")
    .single();

  if (error) {
    console.error("Error al guardar el perfil:", error);
    mostrarEstadoPerfil(
      "No se pudo guardar el perfil. Verificá las políticas RLS y los permisos de la tabla. Detalle: " +
      error.message
    );
    return;
  }

  perfilActual = data;

  mostrarEstadoPerfil("¡Perfil guardado en Supabase correctamente!");
  mostrarEstado("Sesión activa: " + usuarioActual.email);
}

export function obtenerUsuarioActual() {
  return usuarioActual;
}

export function obtenerPerfilActual() {
  return perfilActual;
}

export async function iniciarAutenticacion() {
  crearInterfazAcceso();

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    mostrarEstado("No se pudo consultar la sesión: " + error.message);
    return;
  }

  actualizarUsuario(data.session?.user || null);

  if (!escuchadorAutenticacion) {
    const resultado = supabase.auth.onAuthStateChange((_evento, session) => {
      actualizarUsuario(session?.user || null);
    });

    escuchadorAutenticacion = resultado.data.subscription;
  }

  if (data.session?.user) {
    crearInterfazPerfil();
    await cargarPerfil();
  }
}
