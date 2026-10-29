export function initConnectivity({ onChange } = {}) {
  function actualizarEstado() {
    const conectado = navigator.onLine;

    if (typeof onChange === "function") {
      onChange(conectado);
    }
  }

  window.addEventListener("online", actualizarEstado);
  window.addEventListener("offline", actualizarEstado);

  actualizarEstado();

  return function detenerDeteccion() {
    window.removeEventListener("online", actualizarEstado);
    window.removeEventListener("offline", actualizarEstado);
  };
}
