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
  // Métodos de compatibilidad mínima (creación basada en nombre)
  crearTimer: (nombre: string, tipoOperacion: 'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion', tiempoMinutos: number) => string | undefined;
  crearTimersBatch: (nombres: string[], tipoOperacion: 'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion', tiempoMinutos: number) => void;
  obtenerTimersCompletados: () => Timer[];
  forzarSincronizacion: () => void;
}

const TimerContext = createContext<TimerContextType | undefined>(undefined);

interface TimerProviderProps {
  children: ReactNode;
}

export const TimerProvider: React.FC<TimerProviderProps> = ({ children }) => {
  const [timers, setTimers] = useState<Timer[]>([]);
  // Fuente única de verdad: servidor. Sin creación optimista.
  
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

  // Escuchar mensajes del WebSocket
  useEffect(() => {
    if (!lastMessage) return;
  // Debug logs removed (mensaje recibido)

    switch (lastMessage.type) {
      case 'TIMER_SYNC':
        if (Array.isArray(lastMessage.data.timers)) {
          setTimers(lastMessage.data.timers.map((t: any) => ({
            ...t,
            fechaInicio: new Date(t.fechaInicio),
            fechaFin: new Date(t.fechaFin),
            tiempoRestanteSegundos: t.server_remaining_time ?? t.tiempoRestanteSegundos
          })));
        }
        break;

      case 'TIMER_BATCH_UPDATE':
        if (Array.isArray(lastMessage.data.updates)) {
          setTimers(prev => prev.map(timer => {
            const update = lastMessage.data.updates.find((u: any) => u.timerId === timer.id);
            if (!update) return timer;
            return {
              ...timer,
              tiempoRestanteSegundos: update.tiempoRestanteSegundos,
              completado: update.completado,
              activo: update.activo
            };
          }));
        }
        break;

      case 'TIMER_CREATED':
        if (lastMessage.data.timer) {
          const t = lastMessage.data.timer;
          const nuevo: Timer = {
            ...t,
            fechaInicio: new Date(t.fechaInicio),
            fechaFin: new Date(t.fechaFin)
          };
          setTimers(prev => prev.find(x => x.id === nuevo.id) ? prev.map(x => x.id === nuevo.id ? nuevo : x) : [...prev, nuevo]);
        }
        break;

      case 'TIMER_UPDATED':
        if (lastMessage.data.timer) {
          const t = lastMessage.data.timer;
            const nuevo: Timer = {
              ...t,
              fechaInicio: new Date(t.fechaInicio),
              fechaFin: new Date(t.fechaFin)
            };
            setTimers(prev => prev.find(x => x.id === nuevo.id) ? prev.map(x => x.id === nuevo.id ? nuevo : x) : [...prev, nuevo]);
        }
        break;

      case 'TIMER_DELETED':
        if (lastMessage.data.timerId) {
          setTimers(prev => prev.filter(timer => timer.id !== lastMessage.data.timerId));
        }
        break;
    }
  }, [lastMessage]);

  // Eliminada la detección de completados locales (el servidor es la única fuente de verdad).

  // Solicitar sincronización al conectar
  useEffect(() => {
    if (isConnected) {
      sendMessage({
        type: 'REQUEST_SYNC',
        data: {}
      });
    }
  }, [isConnected, sendMessage]);

  // Creación directa (sin optimismo): esperar evento TIMER_CREATED del servidor.
  const iniciarTimer = (nombre: string, tipoOperacion: Timer['tipoOperacion'], tiempoMinutos: number) => {
    if (isConnected) {
      sendMessage({ type: 'CREATE_TIMER', data: { timer: { nombre, tipoOperacion, tiempoInicialMinutos: tiempoMinutos } } });
      // Fallback: solicitar sync tras breve delay si aún no llegó
      setTimeout(() => {
        setTimers(prev => prev.some(t => t.nombre === nombre && t.tipoOperacion === tipoOperacion && t.tiempoInicialMinutos === tiempoMinutos)
          ? prev
          : (sendMessage({ type: 'REQUEST_SYNC', data: {} }), prev)
        );
      }, 2500);
    }
  };

  const iniciarTimers = (nombres: string[], tipoOperacion: Timer['tipoOperacion'], tiempoMinutos: number) => {
    if (!nombres.length) return;
    if (isConnected) {
      const timersData = nombres.map(nombre => ({ nombre, tipoOperacion, tiempoInicialMinutos: tiempoMinutos }));
      sendMessage({ type: 'CREATE_TIMERS_BATCH', data: { timers: timersData } });
      setTimeout(() => sendMessage({ type: 'REQUEST_SYNC', data: {} }), 2500);
    }
  };

  const pausarTimer = (id: string) => { if (isConnected) sendMessage({ type: 'PAUSE_TIMER', data: { timerId: id } }); };

  const reanudarTimer = (id: string) => { if (isConnected) sendMessage({ type: 'RESUME_TIMER', data: { timerId: id } }); };

  const eliminarTimer = (id: string) => { if (isConnected) sendMessage({ type: 'DELETE_TIMER', data: { timerId: id } }); };

  // Métodos legacy eliminados: marcarTimersCompletados, recentCompletions, forceClear.

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

  const forzarSincronizacion = (): void => { if (isConnected) sendMessage({ type: 'REQUEST_SYNC', data: {} }); };

  // Eliminado soporte de getRecentCompletion / getRecentCompletionById.

  // Eliminado: tick local. El servidor envía TIMER_BATCH_UPDATE cada segundo.

  // Eliminado: reconciliación de timers optimistas (no se usan temporales locales).

  const contextValue: TimerContextType = {
    timers,
    isConnected,
    iniciarTimer,
    iniciarTimers,
    pausarTimer,
    reanudarTimer,
    eliminarTimer,
  formatearTiempo,
  // Exponer shims de compatibilidad
  crearTimer,
  crearTimersBatch,
  obtenerTimersCompletados,
  forzarSincronizacion,
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
