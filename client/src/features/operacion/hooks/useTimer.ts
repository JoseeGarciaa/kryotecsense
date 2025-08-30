import { useState, useEffect, useCallback } from 'react';
import { apiServiceClient } from '../../../api/apiClient';
import { createUtcTimestamp, getDeviceTimeAsUtcDate } from '../../../shared/utils/dateUtils';
import { useWebSocket } from '../../../hooks/useWebSocket';

export interface Timer {
  id: string;
  nombre: string;
  tipoOperacion: 'congelamiento' | 'atemperamiento' | 'envio';
  tiempoInicialMinutos: number;
  tiempoRestanteSegundos: number;
  fechaInicio: Date;
  fechaFin: Date;
  activo: boolean;
  completado: boolean;
  server_timestamp?: number; // Timestamp del servidor para sincronización
  optimistic?: boolean; // Marcador para timers locales optimistas
}

export const useTimer = (onTimerComplete?: (timer: Timer) => void) => {
  const [timers, setTimers] = useState<Timer[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [serverTimeDiff, setServerTimeDiff] = useState<number>(0);
  
  // WebSocket para sincronización en tiempo real - CONFIGURACIÓN SIMPLIFICADA
  const timerWsUrl = import.meta.env.VITE_TIMER_WS_URL || 'wss://auth-production-f64d.up.railway.app/ws/timers';
  
  console.log('🔌 Conectando WebSocket:', timerWsUrl);
  
  const { isConnected, sendMessage, lastMessage } = useWebSocket(timerWsUrl);

  // Cargar timers del localStorage al inicializar (SOLO como respaldo)
  useEffect(() => {
    const cargarTimersLocales = () => {
      const timersGuardados = localStorage.getItem('kryotec_timers');
      if (timersGuardados && !isConnected) {
        try {
          const timersParseados = JSON.parse(timersGuardados);
          const timersConFechas = timersParseados.map((timer: Timer) => ({
            ...timer,
            fechaInicio: new Date(timer.fechaInicio),
            fechaFin: new Date(timer.fechaFin)
          }));
          setTimers(timersConFechas);
          console.log('💾 Timers cargados desde localStorage (respaldo):', timersConFechas.length);
          return timersConFechas;
        } catch (error) {
          console.error('Error al cargar timers:', error);
        }
      }
      return [];
    };

    cargarTimersLocales();
    setIsInitialized(true);
  }, [isConnected]);

  // Escuchar mensajes de WebSocket - EL SERVIDOR ES LA ÚNICA FUENTE DE VERDAD
  useEffect(() => {
    if (!lastMessage) return;

    console.log('📨 Mensaje WebSocket recibido:', lastMessage.type, lastMessage.data);

    switch (lastMessage.type) {
      case 'TIMER_SYNC':
        // Sincronización completa desde el servidor
        console.log('✅ Sincronización recibida del servidor');
        
        if (lastMessage.data.timers) {
          const timersDelServidor = lastMessage.data.timers.map((timer: any) => ({
            ...timer,
            fechaInicio: new Date(timer.fechaInicio),
            fechaFin: new Date(timer.fechaFin),
            // Usar tiempo del servidor directamente
            tiempoRestanteSegundos: timer.server_remaining_time || timer.tiempoRestanteSegundos,
            server_timestamp: timer.server_timestamp
          }));
          
          // Combinar con optimistas locales que aún no llegaron del servidor (por nombre)
          setTimers(prev => {
            const restantesOptimistas = prev.filter(t => t.optimistic && !timersDelServidor.some((s: any) => s.nombre === t.nombre));
            const combinados = [...timersDelServidor, ...restantesOptimistas];
            localStorage.setItem('kryotec_timers', JSON.stringify(combinados));
            return combinados;
          });
          
          // Almacenar diferencia de tiempo del servidor
          if (lastMessage.data.server_timestamp) {
            const serverTime = lastMessage.data.server_timestamp;
            const localTime = Date.now();
            setServerTimeDiff(serverTime - localTime);
          }
          
          console.log(`🔄 ${timersDelServidor.length} timers sincronizados desde servidor`);
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
              }
              
              return {
                ...timer,
                tiempoRestanteSegundos: nuevoTiempoRestante,
                completado,
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
          console.log('📤 Enviando REQUEST_SYNC al servidor...');
          sendMessage({
            type: 'REQUEST_SYNC'
          });
          console.log('✅ REQUEST_SYNC enviado');
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
            const ahora = getDeviceTimeAsUtcDate();
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
      if (document.visibilityState === 'visible' && isConnected && !syncRequested) {
        // Solo sincronizar si la pestaña estuvo oculta por más de 5 segundos
        const lastVisibilityChange = Date.now() - (localStorage.getItem('last_visibility_hidden') ? parseInt(localStorage.getItem('last_visibility_hidden')!) : 0);
        if (lastVisibilityChange > 5000) {
          console.log('👁️ Pestaña visible después de estar oculta - Sincronizando');
          sendMessage({
            type: 'REQUEST_SYNC'
          });
        }
      } else if (document.visibilityState === 'hidden') {
        localStorage.setItem('last_visibility_hidden', Date.now().toString());
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isConnected, sendMessage, syncRequested]);

  // Actualizar timers cada segundo
  useEffect(() => {
    const interval = setInterval(() => {
      setTimers(prevTimers => 
        prevTimers.map(timer => {
          if (!timer.activo || timer.completado) return timer;
          
          // Regla: si WS está conectado y el timer NO es optimista, no tocamos (servidor es autoridad)
          const debeActualizarLocal = !isConnected || timer.optimistic;
          if (!debeActualizarLocal) return timer;
          
          // Actualizar localmente basado en fechas (optimista o sin WS)
          const ahora = getDeviceTimeAsUtcDate();
          const fechaFin = new Date(timer.fechaFin);
          const tiempoRestanteMs = fechaFin.getTime() - ahora.getTime();
          const nuevoTiempoRestante = Math.max(0, Math.floor(tiempoRestanteMs / 1000));
          const completado = nuevoTiempoRestante === 0;
          
          // Si se completó, mostrar notificación y ejecutar callback
          if (completado && timer.activo && !timer.completado) {
            // Ejecutar de forma asíncrona para no bloquear el estado
            (async () => {
              await mostrarNotificacionCompletado(timer);
              
              // Ejecutar callback si está definido
              if (onTimerComplete) {
                onTimerComplete(timer);
              }
            })();
          }
          
    return {
            ...timer,
            tiempoRestanteSegundos: nuevoTiempoRestante,
            completado,
            activo: !completado
          };
        })
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [onTimerComplete, isConnected]); // isConnected cambia el modo de actualización

  const mostrarNotificacionCompletado = async (timer: Timer) => {
    // Notificación del navegador
    if (Notification.permission === 'granted') {
      new Notification(`⏰ Temporizador completado`, {
        body: `${timer.nombre} - ${timer.tipoOperacion === 'congelamiento' ? 'Congelación' : 'Atemperamiento'} completado`,
        icon: '/favicon.ico'
      });
    }
    
    // Alerta visual
    alert(`⏰ Temporizador completado!\n\n${timer.nombre}\n${timer.tipoOperacion === 'congelamiento' ? 'Congelación' : 'Atemperamiento'} completado`);
    
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
    tipoOperacion: 'congelamiento' | 'atemperamiento' | 'envio',
    tiempoMinutos: number
  ): string => {
    const timerId = `timer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`🚀 Creando timer: ${nombre} - ${tiempoMinutos} minutos`);
    // Crear timer local optimista inmediatamente para mostrar el conteo regresivo
    const ahora = getDeviceTimeAsUtcDate();
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
    tipoOperacion: 'congelamiento' | 'atemperamiento' | 'envio',
    tiempoMinutos: number
  ): string => {
    const timerId = `optimistic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const ahora = getDeviceTimeAsUtcDate();
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
      sendMessage({
  type: 'REQUEST_SYNC'
      });
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
    isConnected
  };
};

export default useTimer;
