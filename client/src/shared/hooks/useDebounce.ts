import { useState, useEffect, useRef } from 'react';

/**
 * Hook para manejar debouncing de valores
 * @param value - Valor a hacer debounce
 * @param delay - Retraso en milisegundos
 * @returns Valor debounced
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook para prevenir ejecuciones múltiples rápidas de una función
 * @param callback - Función a ejecutar
 * @param delay - Retraso en milisegundos para prevenir ejecuciones múltiples
 * @returns Función debounced
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const callbackRef = useRef(callback);
  const timeoutRef = useRef<NodeJS.Timeout>();

  // Actualizar la referencia del callback cuando cambie
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const debouncedCallback = useRef(
    ((...args: Parameters<T>) => {
      // Cancelar timeout anterior si existe
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Crear nuevo timeout
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    }) as T
  ).current;

  // Limpiar timeout al desmontar
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedCallback;
}

/**
 * Hook para throttling - ejecuta la función máximo una vez por período
 * @param callback - Función a ejecutar
 * @param delay - Período mínimo entre ejecuciones en milisegundos
 * @returns Función throttled
 */
export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const callbackRef = useRef(callback);
  const lastCallRef = useRef<number>(0);

  // Actualizar la referencia del callback cuando cambie
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const throttledCallback = useRef(
    ((...args: Parameters<T>) => {
      const now = Date.now();
      
      if (now - lastCallRef.current >= delay) {
        lastCallRef.current = now;
        callbackRef.current(...args);
      }
    }) as T
  ).current;

  return throttledCallback;
}

/**
 * Hook para prevenir procesamiento de códigos duplicados REALES
 * NO bloquea escaneos rápidos, solo evita procesar el mismo código múltiples veces consecutivas
 * @param delay - Tiempo muy corto en milisegundos para evitar doble-click accidental (default: 100ms)
 * @returns Objeto con función para verificar duplicados y limpiar historial
 */
export function useAntiDuplicate(delay: number = 100) {
  const lastProcessedRef = useRef<{ value: string; timestamp: number } | null>(null);

  const isDuplicate = (value: string): boolean => {
    const now = Date.now();
    const lastProcessed = lastProcessedRef.current;

    // Solo bloquear si es exactamente el mismo código Y fue procesado hace muy poco tiempo (< 100ms)
    // Esto evita doble-procesamiento accidental pero permite escaneos rápidos legítimos
    if (lastProcessed && lastProcessed.value === value && (now - lastProcessed.timestamp) < delay) {
      console.log(`🚫 Doble-procesamiento evitado: ${value} (${now - lastProcessed.timestamp}ms después)`);
      return true;
    }

    // Registrar el código como procesado
    lastProcessedRef.current = { value, timestamp: now };
    return false;
  };

  const clearHistory = () => {
    lastProcessedRef.current = null;
  };

  return { isDuplicate, clearHistory };
}
