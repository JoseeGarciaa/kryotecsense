/**
 * Utilidades para manejo de fechas en UTC
 */

/**
 * Obtiene la fecha actual en UTC como string ISO
 */
export const getUtcNow = (): string => {
  return new Date().toISOString();
};

/**
 * Obtiene la fecha actual en UTC como objeto Date
 */
export const getUtcNowAsDate = (): Date => {
  return new Date(Date.now());
};

/**
 * Convierte una fecha a UTC manteniendo la hora local como UTC
 * Esto es útil cuando quieres que la hora local del dispositivo se trate como UTC
 */
export const localTimeAsUtc = (date?: Date): Date => {
  const now = date || new Date();
  // Crear nueva fecha usando los valores locales pero interpretándolos como UTC
  return new Date(Date.UTC(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds()
  ));
};

/**
 * Obtiene la fecha actual del dispositivo pero la trata como UTC
 */
export const getDeviceTimeAsUtc = (): string => {
  return localTimeAsUtc().toISOString();
};

/**
 * Obtiene la fecha actual del dispositivo como objeto Date tratada como UTC
 */
export const getDeviceTimeAsUtcDate = (): Date => {
  return localTimeAsUtc();
};

/**
 * Formatea una fecha para mostrar en la UI
 */
export const formatDateForDisplay = (dateString: string): string => {
  try {
    return new Date(dateString).toLocaleDateString();
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Fecha inválida';
  }
};

/**
 * Crea un timestamp UTC basado en la hora del dispositivo
 * Para usar cuando necesitas que la hora local se registre como UTC
 */
export const createUtcTimestamp = (): string => {
  // Registrar el instante real en UTC para que coincida con lo mostrado al usuario
  return new Date().toISOString();
};
