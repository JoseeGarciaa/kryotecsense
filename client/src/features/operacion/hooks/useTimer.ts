import { useState, useEffect, useCallback, useRef } from 'react';
import { apiServiceClient } from '../../../api/apiClient';
import { createUtcTimestamp } from '../../../shared/utils/dateUtils';
import { useWebSocket } from '../../../hooks/useWebSocket';

export interface Timer {
  id: string;
  nombre: string;
  tipoOperacion: 'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion';
  tiempoInicialMinutos: number;
  tiempoRestanteSegundos: number;
  fechaInicio: Date;
  fechaFin: Date;
  activo: boolean;
  completado: boolean;
  server_timestamp?: number; // Timestamp del servidor para sincronización
  optimistic?: boolean; // Marcador para timers locales optimistas
}

// --- UI notification batching for timer completions ---
// We batch multiple timer-completion notifications within a short window to avoid spamming alerts.
let pendingCompletionBatch: Timer[] = [];
let batchCompletionHandle: number | null = null;
const BATCH_WINDOW_MS = 700;

// Deduplication: avoid notifying the same timer ID more than once within a TTL window
const recentlyNotifiedById: Map<string, number> = new Map();
const DEDUP_TTL_MS = 10_000; // 10s window to ignore duplicates of the same timer

function canNotify(timer: Timer): boolean {
  const now = Date.now();
  const last = recentlyNotifiedById.get(timer.id) ?? 0;
  if (now - last < DEDUP_TTL_MS) {
    return false;
  }
  recentlyNotifiedById.set(timer.id, now);
  return true;
}

function queueCompletionNotification(timer: Timer) {
  // Skip if this timer was recently notified
  if (!canNotify(timer)) return;

  // Ensure we don't add duplicates of the same timer into the current batch
  if (!pendingCompletionBatch.some(t => t.id === timer.id)) {
    pendingCompletionBatch.push(timer);
  }

  if (batchCompletionHandle !== null) {
    return; // already scheduled
  }
  batchCompletionHandle = (setTimeout(() => {
    const items = pendingCompletionBatch.slice();
    pendingCompletionBatch = [];
    batchCompletionHandle = null;

    if (items.length === 0) return;

    // Prefer a single OS notification if permitted; otherwise use one alert
    if (Notification.permission === 'granted') {
      if (items.length === 1) {
        const t = items[0];
        new Notification('⏰ Cronómetro completado', {
          body: `${t.nombre} - ${t.tipoOperacion === 'congelamiento' ? 'Congelación' : 'Atemperamiento'} completado`,
          icon: '/favicon.ico'
        });
      } else {
        const tipo = items.every(i => i.tipoOperacion === 'congelamiento') ? 'Congelación' : items.every(i => i.tipoOperacion === 'atemperamiento') ? 'Atemperamiento' : 'varios procesos';
        new Notification('⏰ Cronómetros completados', {
          body: `${items.length} TIC(s) completaron ${tipo}`,
          icon: '/favicon.ico'
        });
      }
    } else {
      // Fallback single alert
      if (items.length === 1) {
        const t = items[0];
        alert(`⏰ Cronómetro completado!\n\n${t.nombre}\n${t.tipoOperacion === 'congelamiento' ? 'Congelación' : 'Atemperamiento'} completado`);
      } else {
        const tipo = items.every(i => i.tipoOperacion === 'congelamiento') ? 'Congelación' : items.every(i => i.tipoOperacion === 'atemperamiento') ? 'Atemperamiento' : 'varios procesos';
        const nombresPreview = items.slice(0, 5).map(i => i.nombre).join(', ');
        const resto = items.length > 5 ? ` y ${items.length - 5} más` : '';
        alert(`⏰ ${items.length} cronómetros completados (${tipo}).\nEjemplo: ${nombresPreview}${resto}`);
      }
    }
  }, BATCH_WINDOW_MS) as unknown) as number;
}

export const useTimer = (onTimerComplete?: (timer: Timer) => void) => {
  const [timers, setTimers] = useState<Timer[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [serverTimeDiff, setServerTimeDiff] = useState<number>(0);
  const serverTimeDiffRef = useRef<number>(0);
  // Cache de completados recientes para mostrar "Completo" aunque el servidor limpie el timer enseguida
  // key = `${tipo}|${norm(nombre)}`
  const recentCompletionsRef = useRef<Map<string, { minutes: number; at: number; startMs: number }>>(new Map());
  // Fallback adicional por ID de item (para 'envio'): key = `${tipo}|id|${itemId}`
  const recentCompletionsByIdRef = useRef<Map<string, { minutes: number; at: number; startMs: number }>>(new Map());
  const RECENT_TTL_MS = 3 * 60 * 1000; // 3 minutos
  const norm = (s: string | null | undefined) => (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  const markRecentlyCompleted = (t: Timer) => {
    try {
      const key = `${t.tipoOperacion}|${norm(t.nombre)}`;
      const startMs = (t.fechaInicio instanceof Date ? t.fechaInicio.getTime() : new Date(t.fechaInicio).getTime());
      recentCompletionsRef.current.set(key, { minutes: t.tiempoInicialMinutos, at: Date.now(), startMs });
      // Si es 'envio', guardar también por ID extraído del nombre
      if (t.tipoOperacion === 'envio') {
        const m = (t.nombre || '').match(/#(\d+)\s*-\s*/);
        if (m && m[1]) {
          const id = Number(m[1]);
          if (!Number.isNaN(id)) {
            const keyId = `${t.tipoOperacion}|id|${id}`;
            recentCompletionsByIdRef.current.set(keyId, { minutes: t.tiempoInicialMinutos, at: Date.now(), startMs });
          }
        }
      }
    } catch {}
  };
  const getRecentCompletion = (
    nombre: string,
    tipoOperacion: 'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion'
  ): { minutes: number; at: number; startMs: number } | null => {
    const key = `${tipoOperacion}|${norm(nombre)}`;
    const val = recentCompletionsRef.current.get(key);
    if (!val) return null;
    if (Date.now() - val.at > RECENT_TTL_MS) {
      // Expirado
      recentCompletionsRef.current.delete(key);
      return null;
    }
    return val;
  };
  const getRecentCompletionById = (
    tipoOperacion: 'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion',
    itemId: number
  ): { minutes: number; at: number; startMs: number } | null => {
    const key = `${tipoOperacion}|id|${itemId}`;
    const val = recentCompletionsByIdRef.current.get(key);
    if (!val) return null;
    if (Date.now() - val.at > RECENT_TTL_MS) {
      recentCompletionsByIdRef.current.delete(key);
      return null;
    }
    return val;
  };

  // Mantener un ref siempre actualizado para evitar reiniciar el interval al cambiar serverTimeDiff
  useEffect(() => {
    serverTimeDiffRef.current = serverTimeDiff;
  }, [serverTimeDiff]);
  
  // WebSocket para sincronización en tiempo real:
  // Unificado: derivar SIEMPRE del host de la API (VITE_API_URL) o same-origin en dev.
  // Nota: Ignoramos VITE_TIMER_WS_URL para evitar "split-brain" entre servicios distintos.
  const timerWsUrl = (() => {
    const explicit = (import.meta.env.VITE_TIMER_WS_URL as string | undefined)?.trim();
    if (explicit) {
      // Aviso visible en consola si alguien intentó forzar otra URL de WS
      console.warn('VITE_TIMER_WS_URL está definido pero será ignorado para unificar el endpoint WS en API Gateway:', explicit);
    }

    const apiBase = (import.meta.env.VITE_API_URL as string | undefined) || '';
    if (apiBase) {
      try {
        const u = new URL(apiBase);
        const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${wsProto}//${u.host}/ws/timers`;
      } catch {
        // fall through to same-origin
      }
    }

    // Fallback para desarrollo/local cuando no hay variables
    if (typeof window !== 'undefined') {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      return `${proto}://${window.location.host}/ws/timers`;
    }
    return 'ws://localhost:8006/ws/timers';
  })();
  
  console.log('🔌 Conectando WebSocket:', timerWsUrl);
  
  const { isConnected, sendMessage, lastMessage } = useWebSocket(timerWsUrl);

  // Cargar timers del localStorage al inicializar (siempre como pre-hidratación) y recalcular restante
  useEffect(() => {
    const cargarTimersLocales = () => {
      const timersGuardados = localStorage.getItem('kryotec_timers');
      if (timersGuardados) {
        try {
          const timersParseados = JSON.parse(timersGuardados);
          const ahora = new Date();
          const timersConFechas = timersParseados.map((timer: Timer) => {
            const inicio = new Date(timer.fechaInicio);
            const fin = new Date(timer.fechaFin);
            const tiempoRestanteMs = fin.getTime() - ahora.getTime();
            const tiempoRestanteSegundos = Math.max(0, Math.floor(tiempoRestanteMs / 1000));
            return {
              ...timer,
              fechaInicio: inicio,
              fechaFin: fin,
              tiempoRestanteSegundos,
              completado: tiempoRestanteSegundos === 0,
              activo: tiempoRestanteSegundos > 0 && timer.activo
            } as Timer;
          });
          setTimers(timersConFechas);
          console.log('💾 Timers pre-hidratados desde localStorage:', timersConFechas.length);
          return timersConFechas;
        } catch (error) {
          console.error('Error al cargar timers desde localStorage:', error);
        }
      }
      return [];
    };

    cargarTimersLocales();
    setIsInitialized(true);
  }, []);

  // Escuchar mensajes de WebSocket - EL SERVIDOR ES LA ÚNICA FUENTE DE VERDAD
  useEffect(() => {
    if (!lastMessage) return;

    console.log('📨 Mensaje WebSocket recibido:', lastMessage.type, lastMessage.data);

    switch (lastMessage.type) {
      case 'TIMER_SYNC':
        // Sincronización completa desde el servidor
        console.log('✅ Sincronización recibida del servidor');
        
        if (lastMessage.data.timers) {
          // Mezclar con el estado actual para conservar el decremento local de 1s salvo drift significativo
          setTimers(prev => {
            const porIdONombre = new Map<string, Timer>();

            // Indexar prev por id/nombre para lookups
            const indexPrevByKey = (t: Timer) => t.id || t.nombre;
            const prevIndex = new Map<string, Timer>();
            prev.forEach(t => prevIndex.set(indexPrevByKey(t), t));

            const normalizadosServidor: Timer[] = (lastMessage.data.timers as any[]).map((timer: any) => {
              const key = timer.id || timer.nombre;
              const previo = prevIndex.get(key);
              const serverSecs = Number(timer.server_remaining_time ?? timer.tiempoRestanteSegundos ?? 0) || 0;
              const completado = Boolean(timer.completado) || serverSecs === 0;
              // Si el servidor no envía 'activo', asumir activo mientras no esté completado
              const activoServer = timer.activo !== undefined ? Boolean(timer.activo) : !completado;

              // Preservar decrecimiento local si la diferencia es pequeña (<2s) y no hay incremento grande
              let tiempoRestanteSegundos = serverSecs;
              if (previo && !completado) {
                const diff = serverSecs - (previo.tiempoRestanteSegundos ?? 0);
                if (diff < 2 && Math.abs(diff) < 2) {
                  tiempoRestanteSegundos = previo.tiempoRestanteSegundos;
                }
              }

              const normalizado: Timer = {
                id: timer.id,
                nombre: timer.nombre,
                tipoOperacion: timer.tipoOperacion,
                tiempoInicialMinutos: timer.tiempoInicialMinutos,
                tiempoRestanteSegundos,
                fechaInicio: new Date(timer.fechaInicio),
                fechaFin: new Date(timer.fechaFin),
                activo: !completado && (previo?.activo ?? activoServer),
                completado,
                server_timestamp: timer.server_timestamp,
              };
              porIdONombre.set(key, normalizado);
              return normalizado;
            });

            // Mantener optimistas locales no presentes aún en servidor (por nombre)
            const restantesOptimistas = prev.filter(t => t.optimistic && !porIdONombre.has(t.id) && !porIdONombre.has(t.nombre));
            // Preservar cronómetros completados locales (el servidor a veces no los incluye en el snapshot)
            const completadosLocales = prev.filter(t => t.completado && !porIdONombre.has(t.id) && !porIdONombre.has(t.nombre));
            const combinados = [...normalizadosServidor, ...completadosLocales, ...restantesOptimistas];
            localStorage.setItem('kryotec_timers', JSON.stringify(combinados));
            return combinados;
          });
          
          // Almacenar diferencia de tiempo del servidor
          if (lastMessage.data.server_timestamp) {
            const serverTime = lastMessage.data.server_timestamp;
            const localTime = Date.now();
            setServerTimeDiff(serverTime - localTime);
          }
          
          const count = Array.isArray(lastMessage.data.timers) ? lastMessage.data.timers.length : 0;
          console.log(`🔄 ${count} timers sincronizados desde servidor`);
        } else {
          console.log('📭 Sin timers en el servidor');
          setTimers([]);
          localStorage.setItem('kryotec_timers', JSON.stringify([]));
        }
        break;

      case 'TIMER_CREATED':
        // Nuevo timer desde otro dispositivo
        if (lastMessage.data.timer) {
          const nuevoTimer = {
            ...lastMessage.data.timer,
            fechaInicio: new Date(lastMessage.data.timer.fechaInicio),
            fechaFin: new Date(lastMessage.data.timer.fechaFin),
            server_timestamp: lastMessage.data.timer.server_timestamp
          };
          setTimers(prev => {
            // Si ya existe un timer con el mismo ID, no hacer nada
            if (prev.find(t => t.id === nuevoTimer.id)) return prev;

            // Si existe uno por el mismo nombre:
            const existenteMismoNombre = prev.find(t => t.nombre === nuevoTimer.nombre && !t.completado);
            if (existenteMismoNombre) {
              // Si el existente es optimista, reemplazarlo por el del servidor
              if (existenteMismoNombre.optimistic) {
                const reemplazados = prev.map(t => t === existenteMismoNombre ? { ...nuevoTimer, optimistic: false } : t);
                localStorage.setItem('kryotec_timers', JSON.stringify(reemplazados));
                return reemplazados;
              }
              // Si no es optimista, evitar duplicado (quedarse con el primero)
              return prev;
            }

            const nuevos = [...prev, nuevoTimer];
            localStorage.setItem('kryotec_timers', JSON.stringify(nuevos));
            return nuevos;
          });
          console.log('➕ Timer creado desde otro dispositivo:', nuevoTimer.nombre);
        }
        break;

      case 'TIMER_UPDATED':
        // Timer actualizado desde otro dispositivo
        if (lastMessage.data.timer) {
          const timerActualizado = {
            ...lastMessage.data.timer,
            fechaInicio: new Date(lastMessage.data.timer.fechaInicio),
            fechaFin: new Date(lastMessage.data.timer.fechaFin)
          };
          setTimers(prev => {
            const nuevos = prev.map(timer => 
              timer.id === timerActualizado.id ? timerActualizado : timer
            );
            localStorage.setItem('kryotec_timers', JSON.stringify(nuevos));
            return nuevos;
          });
        }
        break;

      case 'TIMER_DELETED':
        // Timer eliminado desde otro dispositivo
        if (lastMessage.data.timerId) {
          setTimers(prev => {
            const nuevos = prev.filter(timer => timer.id !== lastMessage.data.timerId);
            localStorage.setItem('kryotec_timers', JSON.stringify(nuevos));
            return nuevos;
          });
        }
        break;

      case 'TIMER_TIME_UPDATE':
        // Actualización de tiempo desde el servidor - AUTORIDAD ABSOLUTA
        if (lastMessage.data.timerId && lastMessage.data.tiempoRestanteSegundos !== undefined) {
          setTimers(prev => prev.map(timer => {
            if (timer.id === lastMessage.data.timerId) {
              const nuevoTiempoRestante = lastMessage.data.tiempoRestanteSegundos;
              const completado = lastMessage.data.completado || nuevoTiempoRestante === 0;
              const activo = lastMessage.data.activo !== undefined ? lastMessage.data.activo : (!completado && timer.activo);
              
              // Si se completó, ejecutar callback
              if (completado && timer.activo && !timer.completado) {
                setTimeout(() => {
                  if (onTimerComplete) {
                    onTimerComplete({
                      ...timer,
                      tiempoRestanteSegundos: nuevoTiempoRestante,
                      completado,
                      activo
                    });
                  }
                }, 0);
                // Marcar como recientemente completado para vistas que necesiten mostrar "Completo" aunque el timer sea limpiado
                try { markRecentlyCompleted({ ...timer, completado: true }); } catch {}
              }

              // Evitar sobreescribir el conteo local de 1s con el mismo valor del servidor.
              // Solo corregir si hay un aumento (p.ej. edición/pausa) o una diferencia significativa (>=2s).
              let tiempoActualizado = timer.tiempoRestanteSegundos;
              const diff = nuevoTiempoRestante - (timer.tiempoRestanteSegundos ?? 0);

              if (completado) {
                tiempoActualizado = 0;
              } else if (diff >= 2) {
                // El servidor indica mucho más tiempo (edición/reinicio): aceptar incremento grande
                tiempoActualizado = nuevoTiempoRestante;
              } else if (Math.abs(diff) >= 2) {
                // Corrección de drift notable: aceptar valor del servidor
                tiempoActualizado = nuevoTiempoRestante;
              } else {
                // Diferencia menor a 2s: mantener el valor local para preservar el tick visible de 1s
                tiempoActualizado = timer.tiempoRestanteSegundos;
              }

              return {
                ...timer,
                tiempoRestanteSegundos: tiempoActualizado,
                completado: completado || tiempoActualizado === 0,
                activo,
                server_timestamp: lastMessage.data.server_timestamp,
                optimistic: false
              };
            }
            return timer;
          }));
        }
        break;

      default:
        break;
    }
  }, [lastMessage, onTimerComplete]);

  // Estado para manejar sincronización
  const [syncRequested, setSyncRequested] = useState(false);

  // Solicitar sincronización inicial al conectar
  useEffect(() => {
    if (isConnected && isInitialized && !syncRequested) {
      console.log('🔄 WebSocket conectado - Solicitando sincronización');
      console.log('🔍 DEBUG: isConnected:', isConnected, 'isInitialized:', isInitialized, 'syncRequested:', syncRequested);
      setSyncRequested(true);
      
      setTimeout(() => {
        if (isConnected) {
          console.log('📤 Enviando REQUEST_SYNC y SYNC_REQUEST (compat) al servidor...');
          sendMessage({ type: 'REQUEST_SYNC' });
          // Compatibilidad con servidores antiguos
          sendMessage({ type: 'SYNC_REQUEST' });
          console.log('✅ Mensajes de sync enviados');
        } else {
          console.log('⚠️ WebSocket desconectado antes de enviar SYNC_REQUEST');
        }
      }, 500);
    }
    
    if (!isConnected) {
      console.log('🔌 WebSocket desconectado - reseteando syncRequested');
      setSyncRequested(false);
    }
  }, [isConnected, isInitialized, syncRequested, sendMessage]);

  // Cargar timers del localStorage cuando no hay conexión WebSocket (fallback)
  useEffect(() => {
    // Solo usar localStorage como fallback si no estamos conectados y ya inicializamos
    if (!isConnected && isInitialized) {
      const timersGuardados = localStorage.getItem('kryotec_timers');
      if (timersGuardados) {
        try {
          const timersParseados = JSON.parse(timersGuardados);
          // Recalcular tiempo restante basado en la fecha actual
          const timersActualizados = timersParseados.map((timer: Timer) => {
            const ahora = new Date();
            const fechaFin = new Date(timer.fechaFin);
            const tiempoRestanteMs = fechaFin.getTime() - ahora.getTime();
            const tiempoRestanteSegundos = Math.max(0, Math.floor(tiempoRestanteMs / 1000));
            
            return {
              ...timer,
              fechaInicio: new Date(timer.fechaInicio),
              fechaFin: new Date(timer.fechaFin),
              tiempoRestanteSegundos,
              completado: tiempoRestanteSegundos === 0,
              activo: tiempoRestanteSegundos > 0 && timer.activo
            };
          });
          setTimers(timersActualizados);
        } catch (error) {
          console.error('Error al cargar timers:', error);
        }
      }
    }
  }, [isConnected, isInitialized]);

  // Guardar timers en localStorage cuando cambien (inmediatamente)
  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('kryotec_timers', JSON.stringify(timers));
      // console.log('💾 Timers guardados en localStorage:', timers.length);
    }
  }, [timers, isInitialized]);

  // Detectar cambios de pestaña y sincronizar SOLO cuando es necesario
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Solo sincronizar si la pestaña estuvo oculta por más de 5 segundos
        const lastHidden = localStorage.getItem('last_visibility_hidden');
        const elapsed = lastHidden ? Date.now() - parseInt(lastHidden) : 0;
        if (isConnected && elapsed > 5000) {
          console.log('👁️ Pestaña visible tras >5s oculta - Forzando sincronización');
          sendMessage({ type: 'REQUEST_SYNC' });
          sendMessage({ type: 'SYNC_REQUEST' });
          // No dependas de syncRequested para esta re-sincronización puntual
        }
      } else if (document.visibilityState === 'hidden') {
        localStorage.setItem('last_visibility_hidden', Date.now().toString());
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isConnected, sendMessage]);

  // Actualizar timers cada segundo de forma determinística (sin depender del reloj local):
  // Disminuimos 1 segundo por tick sobre el valor sincronizado. El servidor seguirá corrigiendo por WS.
  useEffect(() => {
    const interval = setInterval(() => {
      setTimers(prevTimers =>
        prevTimers.map(timer => {
          if (!timer.activo || timer.completado) return timer;

          // Disminuir 1 segundo del valor sincronizado para evitar desajustes entre dispositivos
          const nuevoTiempoRestante = Math.max(0, (timer.tiempoRestanteSegundos || 0) - 1);
          const seCompletoAhora = nuevoTiempoRestante === 0 && !timer.completado;

          // Si se completó por conteo local, notificar una sola vez (batch + dedup evita duplicados)
          if (seCompletoAhora) {
            (async () => {
              await mostrarNotificacionCompletado(timer);
              if (onTimerComplete) {
                onTimerComplete({ ...timer, tiempoRestanteSegundos: 0, completado: true, activo: false });
              }
              // Marcar como recientemente completado
              try { markRecentlyCompleted({ ...timer, completado: true }); } catch {}
            })();
          }

          return {
            ...timer,
            tiempoRestanteSegundos: nuevoTiempoRestante,
            completado: timer.completado || nuevoTiempoRestante === 0,
            activo: nuevoTiempoRestante > 0 && timer.activo
          };
        })
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [onTimerComplete]);

  const mostrarNotificacionCompletado = async (timer: Timer) => {
  // Encolar para una sola notificación/alerta agregada
  queueCompletionNotification(timer);
    
    // Enviar evento al backend para crear alerta
    try {
      await apiServiceClient.post('/alerts/timer-completed', {
        timer: {
          id: timer.id,
          nombre: timer.nombre,
          tipoOperacion: timer.tipoOperacion,
          tiempoInicialMinutos: timer.tiempoInicialMinutos,
          fechaInicio: timer.fechaInicio.toISOString(),
          fechaFin: timer.fechaFin.toISOString()
        },
        timestamp: createUtcTimestamp()
      });
      
    } catch (error) {
      console.error('❌ Error enviando evento de timer completado:', error);
    }
  };

  const crearTimer = useCallback((
    nombre: string,
    tipoOperacion: 'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion',
    tiempoMinutos: number
  ): string => {
    const timerId = `timer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`🚀 Creando timer: ${nombre} - ${tiempoMinutos} minutos`);
    // Crear timer local optimista inmediatamente para mostrar el conteo regresivo
  const ahora = new Date();
    const fin = new Date(ahora.getTime() + tiempoMinutos * 60 * 1000);
    const nuevoTimerLocal = {
      id: timerId,
      nombre,
      tipoOperacion,
      tiempoInicialMinutos: tiempoMinutos,
      tiempoRestanteSegundos: tiempoMinutos * 60,
      fechaInicio: ahora,
      fechaFin: fin,
      activo: true,
  completado: false,
  optimistic: true
    } as Timer;
    setTimers(prev => [...prev, nuevoTimerLocal]);
    
    // ENVIAR DIRECTAMENTE AL SERVIDOR (si hay conexión) - el servidor es la autoridad
    if (isConnected) {
      sendMessage({
        type: 'CREATE_TIMER',
        data: { 
          timer: {
            id: timerId,
            nombre,
            tipoOperacion,
            tiempoInicialMinutos: tiempoMinutos,
            tiempoRestanteSegundos: tiempoMinutos * 60,
            activo: true,
            completado: false
          }
        }
      });
      
    // Solicitar sincronización para asegurar que se vea en otros dispositivos
      setTimeout(() => {
        if (isConnected) {
          sendMessage({ type: 'REQUEST_SYNC' });
          sendMessage({ type: 'SYNC_REQUEST' });
        }
      }, 200);
    } else {
      console.warn('⚠️ WebSocket no conectado - Timer creado solo localmente');
    }
    
    // Solicitar permisos de notificación
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
    
    return timerId;
  }, [isConnected, sendMessage]);

  // Crear timer SOLO local (optimista) sin enviar al servidor. Útil cuando el backend ya creó el timer.
  const crearTimerLocal = useCallback((
    nombre: string,
    tipoOperacion: 'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion',
    tiempoMinutos: number
  ): string => {
    const timerId = `optimistic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const ahora = new Date();
    const fin = new Date(ahora.getTime() + tiempoMinutos * 60 * 1000);
    const nuevoTimerLocal: Timer = {
      id: timerId,
      nombre,
      tipoOperacion,
      tiempoInicialMinutos: tiempoMinutos,
      tiempoRestanteSegundos: tiempoMinutos * 60,
      fechaInicio: ahora,
      fechaFin: fin,
      activo: true,
      completado: false,
      optimistic: true
    };
    setTimers(prev => {
      // Evitar duplicados por nombre (si ya existe uno activo para el mismo nombre)
      if (prev.some(t => t.nombre === nombre && !t.completado)) {
        return prev;
      }
      const nuevos = [...prev, nuevoTimerLocal];
      localStorage.setItem('kryotec_timers', JSON.stringify(nuevos));
      return nuevos;
    });
    return timerId;
  }, []);

  const pausarTimer = useCallback((id: string) => {
    setTimers(prev => 
      prev.map(timer => 
        timer.id === id ? { ...timer, activo: false } : timer
      )
    );
    
    // Enviar al WebSocket si está conectado
    if (isConnected) {
      sendMessage({
        type: 'PAUSE_TIMER',
        data: { timerId: id }
      });
      // Refuerzo: forzar broadcast de snapshot para que todos los clientes vean el cambio
      setTimeout(() => {
        try { sendMessage({ type: 'FORCE_BROADCAST_SYNC' }); } catch {}
      }, 100);
    }
  }, [isConnected, sendMessage]);

  const reanudarTimer = useCallback((id: string) => {
    setTimers(prev => 
      prev.map(timer => 
        timer.id === id && !timer.completado ? { ...timer, activo: true } : timer
      )
    );
    
    // Enviar al WebSocket si está conectado
    if (isConnected) {
      sendMessage({
        type: 'RESUME_TIMER',
        data: { timerId: id }
      });
      // Refuerzo: forzar broadcast de snapshot para que todos los clientes vean el cambio
      setTimeout(() => {
        try { sendMessage({ type: 'FORCE_BROADCAST_SYNC' }); } catch {}
      }, 100);
    }
  }, [isConnected, sendMessage]);

  const eliminarTimer = useCallback((id: string) => {
    console.log('🗑️ Eliminando timer:', id);
    
    // Eliminar inmediatamente del estado local
    setTimers(prev => {
      const nuevoArray = prev.filter(timer => timer.id !== id);
      console.log('🗑️ Timer eliminado localmente. Timers restantes:', nuevoArray.length);
      return nuevoArray;
    });
    
    // Eliminar del localStorage inmediatamente
    const timersGuardados = localStorage.getItem('kryotec_timers');
    if (timersGuardados) {
      try {
        const timersParseados = JSON.parse(timersGuardados);
        const timersFiltrados = timersParseados.filter((timer: Timer) => timer.id !== id);
        localStorage.setItem('kryotec_timers', JSON.stringify(timersFiltrados));
        console.log('🗑️ Timer eliminado del localStorage');
      } catch (error) {
        console.error('Error al eliminar timer del localStorage:', error);
      }
    }
    
    // Enviar al WebSocket si está conectado
    if (isConnected) {
      console.log('🌐 Enviando DELETE_TIMER al servidor');
      sendMessage({
        type: 'DELETE_TIMER',
        data: { timerId: id }
      });
    }
  }, [isConnected, sendMessage]);

  const formatearTiempo = useCallback((segundos: number): string => {
    const horas = Math.floor(segundos / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);
    const segs = segundos % 60;
    
    if (horas > 0) {
      return `${horas}:${minutos.toString().padStart(2, '0')}:${segs.toString().padStart(2, '0')}`;
    } else {
      return `${minutos}:${segs.toString().padStart(2, '0')}`;
    }
  }, []);

  const obtenerTimersActivos = useCallback(() => {
    return timers.filter(timer => timer.activo && !timer.completado);
  }, [timers]);

  const obtenerTimersCompletados = useCallback(() => {
    return timers.filter(timer => timer.completado);
  }, [timers]);

  const forzarSincronizacion = useCallback(() => {
    if (isConnected) {
      console.log('🔄 Forzando sincronización manual');
  // Sincronizar este cliente (nueva y vieja forma)
  sendMessage({ type: 'REQUEST_SYNC' });
  sendMessage({ type: 'SYNC_REQUEST' });
      // Y forzar broadcast para que todos los dispositivos se actualicen
      setTimeout(() => {
        sendMessage({ type: 'FORCE_BROADCAST_SYNC' });
      }, 100);
    } else {
      console.warn('⚠️ No se puede sincronizar - WebSocket desconectado');
    }
  }, [isConnected, sendMessage]);

  return {
    timers,
    crearTimer,
  crearTimerLocal,
    pausarTimer,
    reanudarTimer,
    eliminarTimer,
    formatearTiempo,
    obtenerTimersActivos,
    obtenerTimersCompletados,
    forzarSincronizacion,
  isConnected,
  getRecentCompletion,
  getRecentCompletionById
  };
};

export default useTimer;
