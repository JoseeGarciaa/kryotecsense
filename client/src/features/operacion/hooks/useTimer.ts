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
}

export const useTimer = (onTimerComplete?: (timer: Timer) => void) => {
  const [timers, setTimers] = useState<Timer[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // WebSocket para sincronización en tiempo real (configurable por env)
  // Preferir VITE_TIMER_WS_URL; si no existe, derivar de VITE_API_URL cambiando http->ws y anexando /ws/timers.
  const derivedWsFromApi = (() => {
    const api = import.meta.env.VITE_API_URL as string | undefined;
    if (!api) return undefined;
    try {
      // limpiar slash final y convertir esquema
      const base = api.replace(/\/$/, "");
      // Usar wss para https y ws para http
      const wsBase = base.replace(/^https/, "wss").replace(/^http/, "ws");
      return `${wsBase}/ws/timers`;
    } catch {
      return undefined;
    }
  })();
  const timerWsUrl = (import.meta.env.VITE_TIMER_WS_URL as string) || derivedWsFromApi || 'ws://localhost:8006/ws/timers';
  
  const { isConnected, sendMessage, lastMessage } = useWebSocket(timerWsUrl);

  // Cargar timers del localStorage al inicializar
  useEffect(() => {
    const cargarTimersLocales = () => {
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
          // Solo log inicial, no en cada carga
          if (timersActualizados.length > 0) {
            console.log('💾 Timers cargados desde localStorage:', timersActualizados.length);
          }
          return timersActualizados;
        } catch (error) {
          console.error('Error al cargar timers:', error);
        }
      }
      return [];
    };

    const timersLocales = cargarTimersLocales();
    setIsInitialized(true);

    // Si hay timers locales y WebSocket está conectado, sincronizar con servidor
    if (timersLocales.length > 0 && isConnected) {
      timersLocales.forEach((timer: Timer) => {
        sendMessage({
          type: 'CREATE_TIMER',
          data: { timer }
        });
      });
    }
  }, []);

  // Escuchar mensajes de WebSocket para sincronización
  useEffect(() => {
    if (!lastMessage) return;

    // console.log('📨 Mensaje WebSocket recibido:', lastMessage);

    switch (lastMessage.type) {
      case 'TIMER_SYNC':
        // Sincronizar todos los timers desde el servidor
        if (lastMessage.data.timers) {
          const timersDelServidor = lastMessage.data.timers.map((timer: any) => ({
            ...timer,
            fechaInicio: new Date(timer.fechaInicio),
            fechaFin: new Date(timer.fechaFin)
          }));
          
          // Merge con timers locales (el servidor tiene prioridad)
          setTimers(prevTimers => {
            const timersLocalesIds = prevTimers.map(t => t.id);
            const timersNuevos = timersDelServidor.filter((t: any) => !timersLocalesIds.includes(t.id));
            const timersActualizados = prevTimers.map(timerLocal => {
              const timerServidor = timersDelServidor.find((t: any) => t.id === timerLocal.id);
              return timerServidor || timerLocal;
            });
            
            const timersFinal = [...timersActualizados, ...timersNuevos];
            return timersFinal;
          });
        }
        break;

      case 'TIMER_CREATED':
        // Agregar nuevo timer desde otro dispositivo
        if (lastMessage.data.timer) {
          const nuevoTimer = {
            ...lastMessage.data.timer,
            fechaInicio: new Date(lastMessage.data.timer.fechaInicio),
            fechaFin: new Date(lastMessage.data.timer.fechaFin)
          };
          setTimers(prev => {
            // Evitar duplicados
            if (prev.find(t => t.id === nuevoTimer.id)) return prev;
            return [...prev, nuevoTimer];
          });
        }
        break;

      case 'TIMER_UPDATED':
        // Actualizar timer desde otro dispositivo
        if (lastMessage.data.timer) {
          const timerActualizado = {
            ...lastMessage.data.timer,
            fechaInicio: new Date(lastMessage.data.timer.fechaInicio),
            fechaFin: new Date(lastMessage.data.timer.fechaFin)
          };
          setTimers(prev => prev.map(timer => 
            timer.id === timerActualizado.id ? timerActualizado : timer
          ));
        }
        break;

      case 'TIMER_DELETED':
        // Eliminar timer desde otro dispositivo
        if (lastMessage.data.timerId) {
          setTimers(prev => prev.filter(timer => timer.id !== lastMessage.data.timerId));
        }
        break;

      case 'TIMER_TIME_UPDATE':
        // Actualización de tiempo en tiempo real desde el servidor
        // Priorizar las actualizaciones del servidor para evitar conflictos
        if (lastMessage.data.timerId && lastMessage.data.tiempoRestanteSegundos !== undefined) {
          setTimers(prev => prev.map(timer => {
            if (timer.id === lastMessage.data.timerId) {
              const nuevoTiempoRestante = lastMessage.data.tiempoRestanteSegundos;
              const completado = nuevoTiempoRestante === 0;
              
              // Si se completó, ejecutar callback
              if (completado && timer.activo && !timer.completado) {
                setTimeout(() => {
                  if (onTimerComplete) {
                    onTimerComplete({
                      ...timer,
                      tiempoRestanteSegundos: nuevoTiempoRestante,
                      completado,
                      activo: !completado
                    });
                  }
                }, 0);
              }
              
              return {
                ...timer,
                tiempoRestanteSegundos: nuevoTiempoRestante,
                completado,
                activo: !completado && timer.activo,
                lastWebSocketUpdate: Date.now() // Marcar última actualización WebSocket
              };
            }
            return timer;
          }));
        }
        break;

      default:
        // Silenciar mensajes no reconocidos para reducir spam
        break;
    }
  }, [lastMessage, onTimerComplete]);

  // Solicitar sincronización inicial cuando se conecte
  useEffect(() => {
    if (isConnected && isInitialized) {
      sendMessage({
        type: 'REQUEST_SYNC'
      });
      
      // Enviar timers locales que puedan no estar en el servidor
      const timersLocales = JSON.parse(localStorage.getItem('kryotec_timers') || '[]');
      if (timersLocales.length > 0) {
        timersLocales.forEach((timer: Timer) => {
          sendMessage({
            type: 'CREATE_TIMER',
            data: { timer }
          });
        });
      }
    }
  }, [isConnected, isInitialized, sendMessage]);

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

  // Detectar cambios de pestaña y sincronizar
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isConnected) {
        // console.log('👁️ Pestaña visible, solicitando sincronización...');
        sendMessage({
          type: 'REQUEST_SYNC'
        });
      }
    };

    const handlePageShow = () => {
      if (isConnected) {
        // console.log('🔄 Página mostrada, solicitando sincronización...');
        sendMessage({
          type: 'REQUEST_SYNC'
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [isConnected, sendMessage]);

  // Actualizar timers cada segundo (SIEMPRE, como backup)
  useEffect(() => {
    const interval = setInterval(() => {
      setTimers(prevTimers => 
        prevTimers.map(timer => {
          if (!timer.activo || timer.completado) return timer;
          
          // Si el timer recibió una actualización WebSocket reciente (menos de 2 segundos), no actualizar localmente
          const ahora = Date.now();
          const tiempoUltimaActualizacionWS = (timer as any).lastWebSocketUpdate || 0;
          const tiempoDesdeUltimaActualizacionWS = ahora - tiempoUltimaActualizacionWS;
          
          if (tiempoDesdeUltimaActualizacionWS < 2000) {
            // WebSocket actualizó recientemente, no hacer nada
            return timer;
          }
          
          const nuevoTiempoRestante = Math.max(0, timer.tiempoRestanteSegundos - 1);
          const completado = nuevoTiempoRestante === 0;
          
          // Si se completó, mostrar notificación y ejecutar callback
          if (completado && timer.activo) {
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
  }, [onTimerComplete]);

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
    const ahora = getDeviceTimeAsUtcDate();
    const fechaFin = new Date(ahora.getTime() + (tiempoMinutos * 60 * 1000));
    
    const nuevoTimer: Timer = {
      id: `timer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      nombre,
      tipoOperacion,
      tiempoInicialMinutos: tiempoMinutos,
      tiempoRestanteSegundos: tiempoMinutos * 60,
      fechaInicio: ahora,
      fechaFin,
      activo: true,
      completado: false
    };

    // Actualizar estado local inmediatamente
    setTimers(prev => {
      const nuevosTimers = [...prev, nuevoTimer];
      // Guardar inmediatamente en localStorage
      localStorage.setItem('kryotec_timers', JSON.stringify(nuevosTimers));
      return nuevosTimers;
    });
    
    // Enviar al WebSocket si está conectado
    if (isConnected) {
      sendMessage({
        type: 'CREATE_TIMER',
        data: { timer: nuevoTimer }
      });
    }
    
    // Solicitar permisos de notificación si no están concedidos
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
    
    return nuevoTimer.id;
  }, [isConnected, sendMessage]);

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
    setTimers(prev => prev.filter(timer => timer.id !== id));
    
    // Enviar al WebSocket si está conectado
    if (isConnected) {
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

  return {
    timers,
    crearTimer,
    pausarTimer,
    reanudarTimer,
    eliminarTimer,
    formatearTiempo,
    obtenerTimersActivos,
    obtenerTimersCompletados,
    isConnected
  };
};

export default useTimer;
