import React, { createContext, useContext, ReactNode, useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

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
}

interface TimerContextType {
  timers: Timer[];
  isConnected: boolean;
  iniciarTimer: (nombre: string, tipoOperacion: 'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion', tiempoMinutos: number) => void;
  iniciarTimers: (nombres: string[], tipoOperacion: 'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion', tiempoMinutos: number) => void;
  pausarTimer: (id: string) => void;
  reanudarTimer: (id: string) => void;
  eliminarTimer: (id: string) => void;
  formatearTiempo: (segundos: number) => string;
  // Indica si un nombre está en proceso de inicio por lote (para UI)
  isStartingBatchFor: (nombre: string) => boolean;
  // Compatibilidad hacia atrás con la API previa
  crearTimer: (nombre: string, tipoOperacion: 'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion', tiempoMinutos: number) => string | undefined;
  crearTimersBatch: (nombres: string[], tipoOperacion: 'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion', tiempoMinutos: number) => void;
  obtenerTimersCompletados: () => Timer[];
  forzarSincronizacion: () => void;
  // Para compatibilidad, devolvemos null cuando no hay registro reciente;
  // el tipo incluye 'minutes' porque algunos consumidores lo leen.
  getRecentCompletion: (nombre: string, tipoOperacion?: string) => { minutes: number } | null;
  getRecentCompletionById: (id: string | number) => { minutes: number } | null;
}

const TimerContext = createContext<TimerContextType | undefined>(undefined);

interface TimerProviderProps {
  children: ReactNode;
}

export const TimerProvider: React.FC<TimerProviderProps> = ({ children }) => {
  const [timers, setTimers] = useState<Timer[]>([]);
  // Batch en progreso para evitar efecto "cascada" al iniciar muchos a la vez
  const pendingBatchRef = useRef<{ names: Set<string>; expiresAt: number } | null>(null);
  
  // WebSocket para comunicación con el backend
  const timerWsUrl = (() => {
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

    if (typeof window !== 'undefined') {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      return `${proto}://${window.location.host}/ws/timers`;
    }
    return 'ws://localhost:8006/ws/timers';
  })();

  const { isConnected, sendMessage, lastMessage } = useWebSocket(timerWsUrl);

  // Utilidad UI: saber si un nombre está en un batch en curso
  const isStartingBatchFor = (nombre: string) => {
    const batch = pendingBatchRef.current;
    if (!batch) return false;
    if (Date.now() > batch.expiresAt) return false;
    return batch.names.has(nombre);
  };

  // Escuchar mensajes del WebSocket
  useEffect(() => {
    if (!lastMessage) return;
  // Debug logs removed (mensaje recibido)

    switch (lastMessage.type) {
      case 'TIMER_SYNC':
        // Sincronización completa desde el servidor
        if (Array.isArray(lastMessage.data.timers)) {
          const timersActualizados = lastMessage.data.timers.map((timer: any) => ({
            ...timer,
            fechaInicio: new Date(timer.fechaInicio),
            fechaFin: new Date(timer.fechaFin),
            tiempoRestanteSegundos: timer.server_remaining_time || timer.tiempoRestanteSegundos
          }));
          setTimers(timersActualizados);
          // Debug log removed (timers sincronizados)
          // Liberar batch en curso: tras un SYNC todos aparecen a la vez
          pendingBatchRef.current = null;
        }
        break;

      case 'TIMER_BATCH_UPDATE':
        // Actualización masiva cada segundo desde el servidor
        if (Array.isArray(lastMessage.data.updates)) {
          setTimers(prev => prev.map(timer => {
            const update = lastMessage.data.updates.find((u: any) => u.timerId === timer.id);
            if (update) {
              return {
                ...timer,
                tiempoRestanteSegundos: update.tiempoRestanteSegundos,
                completado: update.completado,
                activo: update.activo
              };
            }
            return timer;
          }));
          // Si había un batch en espera, libéralo al primer tick por si SYNC tarda
          if (pendingBatchRef.current && Date.now() <= pendingBatchRef.current.expiresAt) {
            pendingBatchRef.current = null;
          }
        }
        break;

      case 'TIMER_CREATED':
        // Nuevo timer desde otro dispositivo
        if (lastMessage.data.timer) {
          const nuevoTimer = {
            ...lastMessage.data.timer,
            fechaInicio: new Date(lastMessage.data.timer.fechaInicio),
            fechaFin: new Date(lastMessage.data.timer.fechaFin)
          };
          // Si estamos iniciando un lote, suprime la aparición inmediata
          const batch = pendingBatchRef.current;
          const isSuppressed = batch && Date.now() <= batch.expiresAt && batch.names.has(nuevoTimer.nombre);
          setTimers(prev => {
            // Evitar duplicados
            if (prev.find(t => t.id === nuevoTimer.id)) return prev;
            // Suprimir si es parte del batch en curso, se mostrará tras SYNC/TICK
            if (isSuppressed) return prev;
            return [...prev, nuevoTimer];
          });
        }
        break;

      case 'TIMER_UPDATED':
        // Timer actualizado
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
        // Timer eliminado
        if (lastMessage.data.timerId) {
          setTimers(prev => prev.filter(timer => timer.id !== lastMessage.data.timerId));
        }
        break;
    }
  }, [lastMessage]);

  // Solicitar sincronización al conectar
  useEffect(() => {
    if (isConnected) {
      sendMessage({
        type: 'REQUEST_SYNC',
        data: {}
      });
    }
  }, [isConnected, sendMessage]);

  // Funciones para interactuar con timers
  const iniciarTimer = (nombre: string, tipoOperacion: 'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion', tiempoMinutos: number) => {
    if (!isConnected) return;
    
    sendMessage({
      type: 'CREATE_TIMER',
      data: {
        timer: {
          nombre,
          tipoOperacion,
          tiempoInicialMinutos: tiempoMinutos,
        }
      }
    });
  };

  const iniciarTimers = (nombres: string[], tipoOperacion: 'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion', tiempoMinutos: number) => {
    if (!isConnected || nombres.length === 0) return;
    
    const timersData = nombres.map(nombre => ({
      nombre,
      tipoOperacion,
      tiempoInicialMinutos: tiempoMinutos,
    }));

    // Registrar batch en curso por breve ventana para evitar render cascada
    pendingBatchRef.current = {
      names: new Set(nombres),
      expiresAt: Date.now() + 3000, // 3s de margen
    };

    sendMessage({
      type: 'CREATE_TIMERS_BATCH',
      data: {
        timers: timersData
      }
    });

    // Solicitar una sincronización poco después para obtener el conjunto completo
    setTimeout(() => {
      if (isConnected) {
        sendMessage({ type: 'REQUEST_SYNC', data: {} });
      }
    }, 120);
  };

  const pausarTimer = (id: string) => {
    if (!isConnected) return;
    
    sendMessage({
      type: 'PAUSE_TIMER',
      data: { timerId: id }
    });
  };

  const reanudarTimer = (id: string) => {
    if (!isConnected) return;
    
    sendMessage({
      type: 'RESUME_TIMER',
      data: { timerId: id }
    });
  };

  const eliminarTimer = (id: string) => {
    if (!isConnected) return;
    
    sendMessage({
      type: 'DELETE_TIMER',
      data: { timerId: id }
    });
  };

  const formatearTiempo = (segundos: number): string => {
    const minutos = Math.floor(segundos / 60);
    const segundosRestantes = segundos % 60;
    return `${minutos}:${segundosRestantes.toString().padStart(2, '0')}`;
  };

  // ===== Métodos de compatibilidad (API antigua) =====
  // Nota: crearTimer devuelve undefined porque el ID real lo asigna el servidor.
  // Los consumidores existentes suelen poder resolver por nombre o por otras heurísticas.
  const crearTimer = (
    nombre: string,
    tipoOperacion: 'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion',
    tiempoMinutos: number
  ): string | undefined => {
    iniciarTimer(nombre, tipoOperacion, tiempoMinutos);
    return undefined;
  };

  const crearTimersBatch = (
    nombres: string[],
    tipoOperacion: 'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion',
    tiempoMinutos: number
  ): void => {
    iniciarTimers(nombres, tipoOperacion, tiempoMinutos);
  };

  const obtenerTimersCompletados = (): Timer[] => {
    return timers.filter(t => t.completado);
  };

  const forzarSincronizacion = (): void => {
    if (isConnected) {
      sendMessage({ type: 'REQUEST_SYNC', data: {} });
    }
  };

  // Las funciones de "recent completion" ya no aplican con servidor autoritativo,
  // devolver null para mantener compatibilidad sin romper llamadas existentes.
  const getRecentCompletion = (_nombre: string, _tipoOperacion?: string): { minutes: number } | null => null;
  const getRecentCompletionById = (_id: string | number): { minutes: number } | null => null;

  const contextValue: TimerContextType = {
    timers,
    isConnected,
    iniciarTimer,
    iniciarTimers,
    pausarTimer,
    reanudarTimer,
    eliminarTimer,
  formatearTiempo,
  isStartingBatchFor,
  // Exponer shims de compatibilidad
  crearTimer,
  crearTimersBatch,
  obtenerTimersCompletados,
  forzarSincronizacion,
  getRecentCompletion,
  getRecentCompletionById,
  };

  return (
    <TimerContext.Provider value={contextValue}>
      {children}
    </TimerContext.Provider>
  );
};

export const useTimerContext = (): TimerContextType => {
  const context = useContext(TimerContext);
  if (context === undefined) {
    throw new Error('useTimerContext debe ser usado dentro de un TimerProvider');
  }
  return context;
};

export default TimerContext;
