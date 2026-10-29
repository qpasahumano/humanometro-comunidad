const PREFIX = "humanometro_comunidad_";

function obtenerAlmacenamiento() {
  try {
    return window.localStorage;
  } catch (error) {
    console.warn("El almacenamiento local no está disponible.", error);
    return null;
  }
}

export function getItem(clave, valorPredeterminado = null) {
  const almacenamiento = obtenerAlmacenamiento();

  if (!almacenamiento) return valorPredeterminado;

  try {
    const valor = almacenamiento.getItem(PREFIX + clave);

    if (valor === null) return valorPredeterminado;

    return JSON.parse(valor);
  } catch (error) {
    console.warn(`No se pudo leer "${clave}".`, error);
    return valorPredeterminado;
  }
}

export function setItem(clave, valor) {
  const almacenamiento = obtenerAlmacenamiento();

  if (!almacenamiento) return false;

  try {
    almacenamiento.setItem(PREFIX + clave, JSON.stringify(valor));
    return true;
  } catch (error) {
    console.warn(`No se pudo guardar "${clave}".`, error);
    return false;
  }
}

export function removeItem(clave) {
  const almacenamiento = obtenerAlmacenamiento();

  if (!almacenamiento) return false;

  try {
    almacenamiento.removeItem(PREFIX + clave);
    return true;
  } catch (error) {
    console.warn(`No se pudo eliminar "${clave}".`, error);
    return false;
  }
}

export function clearCommunityStorage() {
  const almacenamiento = obtenerAlmacenamiento();

  if (!almacenamiento) return false;

  try {
    const claves = [];

    for (let i = 0; i < almacenamiento.length; i++) {
      const clave = almacenamiento.key(i);

      if (clave && clave.startsWith(PREFIX)) {
        claves.push(clave);
      }
    }

    claves.forEach((clave) => almacenamiento.removeItem(clave));
    return true;
  } catch (error) {
    console.warn("No se pudo limpiar el almacenamiento.", error);
    return false;
  }
}
