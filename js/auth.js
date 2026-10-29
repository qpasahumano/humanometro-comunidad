import { supabase } from "./supabase.js";

let usuarioActual = null;
let perfilActual = null;
let escuchadorAutenticacion = null;
let cargaPerfilEnCurso = false;

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

formulario.addEventListener("submit", guardarPerfil, true);
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
limpiarFormularioPerfil();
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
const formulario = $("form-perfil");
const botonGuardar = $("btn-guardar-perfil");

const autenticado = Boolean(usuarioActual);

if (credenciales) credenciales.hidden = autenticado;
if (botonEntrar) botonEntrar.hidden = autenticado;
if (botonCrear) botonCrear.hidden = autenticado;
if (botonSalir) botonSalir.hidden = !autenticado;

if (formulario) {
formulario.hidden = !autenticado;
}

if (botonGuardar) {
botonGuardar.hidden = !autenticado;
}

if (!autenticado) {
perfilActual = null;
limpiarFormularioPerfil();
mostrarEstado("Ingresá o creá tu cuenta para participar.");
mostrarEstadoPerfil("");
return;
}

mostrarEstado("Sesión activa: " + usuarioActual.email);
}

function limpiarFormularioPerfil() {
const nombre = $("nombre-usuario");
const presentacion = $("hm-profile-presentation");
const localidad = $("hm-profile-locality");
const zona = $("hm-profile-zone");

if (nombre) nombre.value = "";
if (presentacion) presentacion.value = "";
if (localidad) localidad.value = "";
if (zona) zona.value = "";
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
    "id, nombre_visible, presentacion, localidad, zona_aproximada, foto_url"
  )
  .eq("id", usuarioActual.id)
  .maybeSingle();

if (error) {
  console.error("Error al consultar el perfil:", error);
  mostrarEstadoPerfil(
    "No se pudo consultar tu perfil. Detalle: " + error.message
  );
  return;
}

perfilActual = data || null;

if ($("nombre-usuario")) {
  $("nombre-usuario").value = data?.nombre_visible || "";
}

if ($("hm-profile-presentation")) {
  $("hm-profile-presentation").value = data?.presentacion || "";
}

if ($("hm-profile-locality")) {
  $("hm-profile-locality").value = data?.localidad || "";
}

if ($("hm-profile-zone")) {
  $("hm-profile-zone").value = data?.zona_aproximada || "";
}

mostrarEstadoPerfil(
  data
    ? "Perfil cargado. Podés revisar tus datos y guardarlos."
    : "Todavía no tenés perfil. Completá tus datos y guardalos."
);

} catch (error) {
console.error("Error inesperado al cargar el perfil:", error);
mostrarEstadoPerfil("Ocurrió un error al cargar el perfil. Probá nuevamente.");
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
const registro = {
id: usuarioActual.id,
nombre_visible: nombre,
presentacion: presentacion || null,
localidad: localidad || null,
zona_aproximada: zona || null,
actualizado_en: new Date().toISOString()
};

const { data, error } = await supabase
  .from("perfiles")
  .upsert(registro, { onConflict: "id" })
  .select(
    "id, nombre_visible, presentacion, localidad, zona_aproximada, foto_url"
  )
  .single();

if (error) {
  console.error("Error al guardar el perfil:", error);
  mostrarEstadoPerfil("No se pudo guardar el perfil: " + error.message);
  return;
}

perfilActual = data;

mostrarEstadoPerfil("¡Perfil guardado correctamente en Supabase!");
mostrarEstado("Sesión activa: " + usuarioActual.email);

} catch (error) {
console.error("Error inesperado al guardar el perfil:", error);
mostrarEstadoPerfil("Ocurrió un error al guardar el perfil. Probá nuevamente.");
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
