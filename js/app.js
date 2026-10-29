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
"vista-perfil"
];

vistas.forEach((id) => {
const elemento = $(id);
if (elemento) elemento.hidden = id !== nombre;
});

const bienvenida = document.querySelector(".bienvenida");
const barrio = document.querySelector(".selector-barrio");
const acciones = document.querySelector(".acciones-principales");
const humanometro = document.querySelector(".humanometro");

const mostrarInicio = !nombre;

[bienvenida, barrio, acciones, humanometro].forEach((elemento) => {
if (elemento) elemento.hidden = !mostrarInicio;
});

if (mostrarInicio) {
vistas.forEach((id) => {
if ($(id)) $(id).hidden = true;
});
}

window.scrollTo({ top: 0, behavior: "smooth" });
}

function entrarAComunidad() {
$("pantalla-inicial").hidden = true;
$("pantalla-comunidad").hidden = false;
mostrarVista(null);
}

function volverAEntrada() {
$("pantalla-comunidad").hidden = true;
$("pantalla-inicial").hidden = false;
window.scrollTo({ top: 0, behavior: "smooth" });
}

function configurarBarrio() {
const input = $("barrio");
const boton = $("btn-guardar-barrio");
const estado = $("estado-barrio");

if (!input || !boton) return;

input.value = getItem("hm_barrio", "");

if (input.value && estado) {
estado.textContent = "Comunidad seleccionada: ${input.value}";
}

boton.addEventListener("click", () => {
const barrio = input.value.trim();

if (!barrio) {
  mostrarNotificacion("Escribí el nombre de tu barrio.");
  input.focus();
  return;
}

setItem("hm_barrio", barrio);

if (estado) {
  estado.textContent = `Comunidad seleccionada: ${barrio}`;
}

mostrarNotificacion("Barrio guardado en este dispositivo.");

});
}

function configurarPerfil() {
const nombre = $("nombre-usuario");
const boton = $("btn-guardar-perfil");
const estado = $("estado-perfil");

if (!nombre || !boton) return;

nombre.value = getItem("hm_nombre_usuario", "");

boton.addEventListener("click", () => {
const valor = nombre.value.trim();

if (!valor) {
  mostrarNotificacion("Escribí el nombre que querés mostrar.");
  nombre.focus();
  return;
}

setItem("hm_nombre_usuario", valor);

if (estado) {
  estado.textContent = "Nombre guardado en este dispositivo.";
}

mostrarNotificacion("Perfil guardado localmente.");

});
}

function configurarNavegacion() {
$("btn-entrar")?.addEventListener("click", entrarAComunidad);

$("btn-gondola")?.addEventListener("click", () => {
mostrarVista("vista-gondola");
});

$("btn-comunicacion")?.addEventListener("click", () => {
mostrarVista("vista-comunicacion");
});

$("btn-ayuda")?.addEventListener("click", () => {
mostrarVista("vista-ayuda");
});

$("btn-perfil")?.addEventListener("click", () => {
mostrarVista("vista-perfil");
});

document.querySelectorAll("[data-volver]").forEach((boton) => {
boton.addEventListener("click", () => mostrarVista(null));
});

$("btn-necesito-ayuda")?.addEventListener("click", () => {
mostrarNotificacion(
"La solicitud de ayuda todavía no se publica para otros usuarios."
);
});

$("btn-quiero-ayudar")?.addEventListener("click", () => {
mostrarNotificacion(
"La función para ofrecer ayuda se conectará en una próxima etapa."
);
});
}

async function iniciarAplicacion() {
configurarNavegacion();
configurarBarrio();
configurarPerfil();

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
      : "Sin conexión. Los datos locales pueden seguir disponibles.";
  }
}

});

initMessages({
getItem,
setItem,
mostrarNotificacion
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
try {
await navigator.serviceWorker.register("./service-worker.js");
} catch (error) {
console.error("No se pudo registrar el service worker:", error);
}
}
}

document.addEventListener("DOMContentLoaded", iniciarAplicacion);
