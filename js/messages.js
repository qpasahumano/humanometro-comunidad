import { supabase } from "./supabase.js";
import { obtenerUsuarioActual, obtenerPerfilActual } from "./auth.js";

const STORAGE_KEY = "hm_mensajes_pendientes";

export function initMessages({ getItem, setItem, mostrarNotificacion }) {
  const formulario = document.getElementById("form-mensaje");
  const lista = document.getElementById("lista-mensajes");
  const estado = document.getElementById("estado-mensaje");
  const destinatarioInput = document.getElementById("destinatario-mensaje");
  const textoInput = document.getElementById("texto-mensaje");
  const botonEnviar = formulario?.querySelector('button[type="submit"]');

  function obtenerMensajesLocales() {
    const mensajes = getItem(STORAGE_KEY, []);
    return Array.isArray(mensajes) ? mensajes : [];
  }

  function tarjetaMensaje(mensaje, titulo, estadoTexto = "") {
    const tarjeta = document.createElement("article");
    tarjeta.className = "tarjeta-publicacion";
    const encabezado = document.createElement("h4");
    encabezado.textContent = titulo;
    const texto = document.createElement("p");
    texto.textContent = mensaje.contenido || mensaje.texto || "";
    const fecha = document.createElement("small");
    const valorFecha = mensaje.creado_en || mensaje.fecha;
    fecha.textContent = valorFecha
      ? new Date(valorFecha).toLocaleString("es-AR")
      : "";
    tarjeta.append(encabezado, texto, fecha);
    if (estadoTexto) {
      const estadoItem = document.createElement("small");
      estadoItem.textContent = estadoTexto;
      tarjeta.appendChild(estadoItem);
    }
    return tarjeta;
  }

  function renderizarLocales() {
    if (!lista) return;
    lista.replaceChildren();
    const mensajes = obtenerMensajesLocales();
    if (!mensajes.length) {
      const aviso = document.createElement("p");
      aviso.textContent = "No hay mensajes pendientes guardados en este dispositivo.";
      lista.appendChild(aviso);
      return;
    }
    mensajes.slice().reverse().forEach((mensaje) => {
      lista.appendChild(tarjetaMensaje(
        mensaje,
        `Pendiente para: ${mensaje.destinatario || "destinatario sin indicar"}`,
        "Guardado solo en este dispositivo; todavía no fue enviado."
      ));
    });
  }

  async function cargarMensajesRemotos() {
    if (!lista) return;
    const usuario = await obtenerUsuarioActual();
    if (!usuario) {
      renderizarLocales();
      return;
    }
    try {
      const { data, error } = await supabase
        .from("mensajes")
        .select("id, remitente_id, destinatario_id, contenido, creado_en")
        .or(`remitente_id.eq.${usuario.id},destinatario_id.eq.${usuario.id}`)
        .order("creado_en", { ascending: false })
        .limit(100);
      if (error) throw error;
      lista.replaceChildren();
      if (!data?.length) {
        const aviso = document.createElement("p");
        aviso.textContent = "Todavía no hay conversaciones. Podés escribirle a alguien indicando su nombre visible exacto.";
        lista.appendChild(aviso);
      } else {
        data.forEach((mensaje) => {
          const esEnviado = mensaje.remitente_id === usuario.id;
          lista.appendChild(tarjetaMensaje(
            mensaje,
            esEnviado ? "Mensaje enviado" : "Mensaje recibido",
            esEnviado ? "Enviado desde tu cuenta comunitaria." : "Recibido en tu cuenta comunitaria."
          ));
        });
      }
      const locales = obtenerMensajesLocales();
      if (locales.length) {
        const separador = document.createElement("h3");
        separador.textContent = "Mensajes pendientes guardados en este dispositivo";
        lista.appendChild(separador);
        locales.slice().reverse().forEach((mensaje) => {
          lista.appendChild(tarjetaMensaje(mensaje, `Pendiente para: ${mensaje.destinatario || "destinatario sin indicar"}`, "Todavía no fue enviado."));
        });
      }
    } catch (error) {
      console.error("Error cargando mensajes:", error);
      renderizarLocales();
      if (estado) estado.textContent = "No se pudo conectar con la mensajería compartida. Revisaremos la tabla y los permisos de Supabase.";
    }
  }

  if (destinatarioInput) {
    destinatarioInput.placeholder = "Nombre visible exacto de la persona";
    destinatarioInput.required = true;
  }
  if (botonEnviar) botonEnviar.textContent = "ENVIAR MENSAJE";

  formulario?.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const texto = textoInput?.value.trim() || "";
    const destinatario = destinatarioInput?.value.trim() || "";
    if (!texto || !destinatario) {
      mostrarNotificacion("Indicá el nombre visible del destinatario y escribí el mensaje.");
      return;
    }

    const usuario = await obtenerUsuarioActual();
    const perfil = await obtenerPerfilActual();
    if (!usuario || !perfil) {
      const mensajes = obtenerMensajesLocales();
      mensajes.push({
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
        destinatario,
        texto,
        fecha: new Date().toISOString(),
        estado: "pendiente"
      });
      if (setItem(STORAGE_KEY, mensajes)) {
        if (estado) estado.textContent = "Guardado localmente. Para enviarlo, iniciá sesión y completá tu perfil.";
        formulario.reset();
        renderizarLocales();
      }
      return;
    }

    if (botonEnviar) {
      botonEnviar.disabled = true;
      botonEnviar.textContent = "ENVIANDO…";
    }
    try {
      const { data: candidatos, error: errorPerfil } = await supabase
        .from("perfiles")
        .select("id, nombre_visible")
        .ilike("nombre_visible", destinatario);
      if (errorPerfil) throw errorPerfil;
      const coincidencias = (candidatos || []).filter((p) => p.id !== usuario.id);
      if (coincidencias.length === 0) {
        throw new Error("No encontramos otro perfil con ese nombre visible. Revisá cómo aparece escrito.");
      }
      if (coincidencias.length > 1) {
        throw new Error("Hay más de una persona con ese nombre. Por ahora necesitás pedirle que use un nombre visible único.");
      }
      const { error } = await supabase.from("mensajes").insert({
        remitente_id: usuario.id,
        destinatario_id: coincidencias[0].id,
        contenido: texto
      });
      if (error) throw error;
      formulario.reset();
      if (estado) estado.textContent = `Mensaje enviado a ${coincidencias[0].nombre_visible}.`;
      mostrarNotificacion("Mensaje enviado a la cuenta comunitaria.");
      await cargarMensajesRemotos();
    } catch (error) {
      console.error("Error enviando mensaje:", error);
      if (estado) estado.textContent = `No se pudo enviar: ${error.message}`;
      mostrarNotificacion("No se pudo enviar el mensaje. Revisá el estado indicado.");
    } finally {
      if (botonEnviar) {
        botonEnviar.disabled = false;
        botonEnviar.textContent = "ENVIAR MENSAJE";
      }
    }
  });

  renderizarLocales();
  void cargarMensajesRemotos();
  return { cargarMensajes: cargarMensajesRemotos };
}
