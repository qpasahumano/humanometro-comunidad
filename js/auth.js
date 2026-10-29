import { supabase } from "./supabase.js";

let usuarioActual = null;

function crearInterfazAcceso() {
if (document.getElementById("hm-auth-panel")) return;

const panel = document.createElement("section");
panel.id = "hm-auth-panel";
panel.style.cssText = "max-width: 440px; margin: 20px auto; padding: 20px; border-radius: 16px; background: #ffffff; color: #222; box-shadow: 0 4px 18px rgba(0,0,0,.12); font-family: sans-serif;";

panel.innerHTML = `
<h2 style="margin-top:0">Tu cuenta comunitaria</h2>
<p>Ingresá o creá tu cuenta para participar en la comunidad.</p>

<label for="hm-auth-email">Correo electrónico</label>
<input id="hm-auth-email" type="email" autocomplete="email"
  placeholder="tu@correo.com" required
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

document.getElementById("hm-auth-login").addEventListener("click", iniciarSesion);
document.getElementById("hm-auth-register").addEventListener("click", crearCuenta);
document.getElementById("hm-auth-logout").addEventListener("click", cerrarSesion);
}

function mostrarEstado(mensaje) {
const estado = document.getElementById("hm-auth-status");
if (estado) estado.textContent = mensaje;
}

function obtenerCredenciales() {
const email = document.getElementById("hm-auth-email").value.trim();
const password = document.getElementById("hm-auth-password").value;

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

mostrarEstado("Sesión iniciada correctamente.");
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
mostrarEstado("Cuenta creada correctamente.");
}
}

async function cerrarSesion() {
const { error } = await supabase.auth.signOut();

if (error) {
mostrarEstado("No se pudo cerrar sesión: " + error.message);
return;
}

mostrarEstado("Sesión cerrada.");
}

function actualizarUsuario(usuario) {
usuarioActual = usuario || null;

const botonEntrar = document.getElementById("hm-auth-login");
const botonCrear = document.getElementById("hm-auth-register");
const botonSalir = document.getElementById("hm-auth-logout");

if (botonEntrar) botonEntrar.hidden = Boolean(usuarioActual);
if (botonCrear) botonCrear.hidden = Boolean(usuarioActual);
if (botonSalir) botonSalir.hidden = !usuarioActual;

if (usuarioActual) {
mostrarEstado("Sesión activa: " + usuarioActual.email);
}
}

export function obtenerUsuarioActual() {
return usuarioActual;
}

export async function iniciarAutenticacion() {
crearInterfazAcceso();

const { data, error } = await supabase.auth.getSession();

if (error) {
mostrarEstado("No se pudo consultar la sesión: " + error.message);
return;
}

actualizarUsuario(data.session?.user || null);

supabase.auth.onAuthStateChange((_evento, session) => {
actualizarUsuario(session?.user || null);
});
}
