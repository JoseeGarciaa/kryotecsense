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
        // Sincronizar todos los timers desde el servidor (ABSOLUTA PRIORIDAD)
        console.log('✅ Sincronización recibida del servidor');
        
        // Resetear estado de sincronización
        setSyncRequested(false);
        
        if (lastMessage.data.timers) {
          const timersDelServidor = lastMessage.data.timers.map((timer: any) => ({
            ...timer,
            fechaInicio: new Date(timer.fechaInicio),
            fechaFin: new Date(timer.fechaFin)
          }));
          
          // REEMPLAZAR COMPLETAMENTE los timers locales con los del servidor
          // El servidor es la fuente de verdad absoluta
          setTimers(timersDelServidor);
          
          // Actualizar localStorage inmediatamente
          localStorage.setItem('kryotec_timers', JSON.stringify(timersDelServidor));
          
          console.log(`🔄 ${timersDelServidor.length} timers sincronizados desde servidor`);
          
          // Si hay server_time, almacenar la diferencia para corrección futura
          if (lastMessage.data.server_time) {
            const serverTime = new Date(lastMessage.data.server_time);
            const localTime = new Date();
            const timeDiff = serverTime.getTime() - localTime.getTime();
            localStorage.setItem('server_time_diff', timeDiff.toString());
          }
        } else {
          console.log('📭 Sin timers en el servidor - limpiando locales');
          setTimers([]);
          localStorage.setItem('kryotec_timers', JSON.stringify([]));
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
        // PRIORIDAD ABSOLUTA: WebSocket siempre actualiza el tiempo para perfecta sincronización
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
                activo
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

  // Estado para manejar sincronización (simplificado)
  const [syncRequested, setSyncRequested] = useState(false);

  // Solicitar sincronización SOLO una vez al conectar (ULTRA SIMPLIFICADO)
  useEffect(() => {
    // Solo si conectó y no se ha pedido sincronización
    if (isConnected && isInitialized && !syncRequested) {
      // Solo log una vez y luego silenciar
      if (!localStorage.getItem('sync_logged')) {
        console.log('🔄 WebSocket conectado, sincronización inicial');
        localStorage.setItem('sync_logged', 'true');
      }
      
      setSyncRequested(true);
      
      // Enviar sincronización después de un pequeño delay
      setTimeout(() => {
        if (isConnected) {
          sendMessage({
            type: 'REQUEST_SYNC'
          });
        }
      }, 200);
    }
    
    // Reset cuando se desconecta
    if (!isConnected && syncRequested) {
      setSyncRequested(false);
    }
  }, [isConnected, isInitialized]); // Solo dependencias esenciales

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

  // Detectar cambios de pestaña y sincronizar FORZADAMENTE para garantizar sincronización perfecta
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isConnected) {
        // SINCRONIZACIÓN FORZADA cuando la pestaña se vuelve visible
        console.log('👁️ Pestaña visible - Forzando sincronización');
        sendMessage({
          type: 'REQUEST_SYNC'
        });
      }
    };

    const handlePageShow = () => {
      if (isConnected) {
        // SINCRONIZACIÓN FORZADA cuando la página se muestra
        console.log('🔄 Página mostrada - Forzando sincronización');
        sendMessage({
          type: 'REQUEST_SYNC'
        });
      }
    };

    const handleFocus = () => {
      if (isConnected) {
        // SINCRONIZACIÓN FORZADA cuando la ventana recibe foco
        console.log('🎯 Ventana enfocada - Forzando sincronización');
        sendMessage({
          type: 'REQUEST_SYNC'
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isConnected, sendMessage]);

  // Actualizar timers cada segundo - PRIORIDAD AL WEBSOCKET PARA SINCRONIZACIÓN PERFECTA
  useEffect(() => {
    const interval = setInterval(() => {
      setTimers(prevTimers => 
        prevTimers.map(timer => {
          if (!timer.activo || timer.completado) return timer;
          
          // NUEVA LÓGICA: Si estamos conectados al WebSocket, SOLO permitir actualizaciones del servidor
          // Esto garantiza sincronización perfecta entre dispositivos
          if (isConnected) {
            // WebSocket conectado: NO actualizar localmente, esperar actualizaciones del servidor
            // Solo verificar si el timer debería estar completado por seguridad
            const ahora = getDeviceTimeAsUtcDate();
            const fechaFin = new Date(timer.fechaFin);
            const tiempoRestanteMs = fechaFin.getTime() - ahora.getTime();
            const tiempoRestanteCalculado = Math.max(0, Math.floor(tiempoRestanteMs / 1000));
            
            // Solo actualizar si el tiempo calculado es muy diferente (error de más de 5 segundos)
            if (Math.abs(tiempoRestanteCalculado - timer.tiempoRestanteSegundos) > 5) {
              console.log(`⚠️ Corrección de sincronización para timer ${timer.id}: ${timer.tiempoRestanteSegundos} -> ${tiempoRestanteCalculado}`);
              return {
                ...timer,
                tiempoRestanteSegundos: tiempoRestanteCalculado,
                completado: tiempoRestanteCalculado === 0,
                activo: tiempoRestanteCalculado > 0 && timer.activo
              };
            }
            
            // Si estamos conectados, mantener el timer tal como está
            return timer;
          }
          
          // WebSocket desconectado: Actualizar localmente basado en fechas
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
  }, [onTimerComplete, isConnected]); // Agregar isConnected como dependencia

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
        data: { 
          timer: {
            ...nuevoTimer,
            fechaInicio: nuevoTimer.fechaInicio.toISOString(),
            fechaFin: nuevoTimer.fechaFin.toISOString()
          }
        }
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
