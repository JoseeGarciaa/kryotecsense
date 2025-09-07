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
  // Campos opcionales para manejo local
  pendienteSync?: boolean; // creado localmente, aún no confirmado por servidor
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
  // Referencias eliminadas (prevTimers / recentCompletions) ya que la lógica de "recent completion" local fue retirada.
  const [serverOffsetMs, setServerOffsetMs] = useState(0); // server_timestamp - Date.now()
  
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

  // Normalización consistente de nombre
  const normalizeName = (n: string) => (n || '').toLowerCase().trim();

  // Escuchar mensajes del WebSocket
  useEffect(() => {
    if (!lastMessage) return;
  // Debug logs removed (mensaje recibido)

    switch (lastMessage.type) {
      case 'TIMER_SYNC':
        if (typeof lastMessage.data?.server_timestamp === 'number') {
          setServerOffsetMs(lastMessage.data.server_timestamp - Date.now());
        }
        if (Array.isArray(lastMessage.data.timers)) {
          const timersActualizados = lastMessage.data.timers.map((t: any) => {
            const fechaInicioSrv = new Date(t.fechaInicio);
            const fechaFinSrv = new Date(t.fechaFin);
            // Ajustar fechaFin para compensar diferencia de reloj (mostrar consistente entre dispositivos)
            const adjustedFin = new Date(fechaFinSrv.getTime() - serverOffsetMs);
            const adjustedInicio = new Date(fechaInicioSrv.getTime() - serverOffsetMs);
            return {
              ...t,
              fechaInicio: adjustedInicio,
              fechaFin: adjustedFin,
              tiempoRestanteSegundos: t.server_remaining_time ?? t.tiempoRestanteSegundos
            } as Timer;
          });
          setTimers(timersActualizados);
        }
        break;

      case 'TIMER_BATCH_UPDATE':
        if (typeof lastMessage.data?.server_timestamp === 'number') {
          setServerOffsetMs(lastMessage.data.server_timestamp - Date.now());
        }
        if (Array.isArray(lastMessage.data.updates)) {
          setTimers(prev => prev.map(timer => {
            const update = lastMessage.data.updates.find((u: any) => u.timerId === timer.id);
            if (!update) return timer;
            return { ...timer, tiempoRestanteSegundos: update.tiempoRestanteSegundos, completado: update.completado, activo: update.activo };
          }));
        }
        break;

      case 'TIMER_CREATED':
        if (typeof lastMessage.data?.timer?.server_timestamp === 'number') {
          setServerOffsetMs(lastMessage.data.timer.server_timestamp - Date.now());
        }
        if (lastMessage.data.timer) {
          const t = lastMessage.data.timer;
            const fechaInicioSrv = new Date(t.fechaInicio);
            const fechaFinSrv = new Date(t.fechaFin);
            const adjustedFin = new Date(fechaFinSrv.getTime() - serverOffsetMs);
            const adjustedInicio = new Date(fechaInicioSrv.getTime() - serverOffsetMs);
          const nuevo: Timer = { ...t, fechaInicio: adjustedInicio, fechaFin: adjustedFin };
          setTimers(prev => {
            if (prev.find(x => x.id === nuevo.id)) return prev.map(x => x.id === nuevo.id ? nuevo : x);
            return [...prev, nuevo];
          });
        }
        break;

      case 'TIMER_UPDATED':
        if (lastMessage.data.timer) {
          const t = lastMessage.data.timer;
          const fechaInicioSrv = new Date(t.fechaInicio);
          const fechaFinSrv = new Date(t.fechaFin);
          const adjustedFin = new Date(fechaFinSrv.getTime() - serverOffsetMs);
          const adjustedInicio = new Date(fechaInicioSrv.getTime() - serverOffsetMs);
          setTimers(prev => prev.map(timer => timer.id === t.id ? { ...timer, ...t, fechaInicio: adjustedInicio, fechaFin: adjustedFin } : timer));
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

  // Funciones para interactuar con timers
  const iniciarTimer = (nombre: string, tipoOperacion: 'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion', tiempoMinutos: number) => {
    if (isConnected) {
      sendMessage({ type: 'CREATE_TIMER', data: { timer: { nombre, tipoOperacion, tiempoInicialMinutos: tiempoMinutos } } });
    }
  };

  const iniciarTimers = (nombres: string[], tipoOperacion: 'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion', tiempoMinutos: number) => {
    if (!nombres.length) return;
    if (isConnected) {
      const timersData = nombres.map(nombre => ({ nombre, tipoOperacion, tiempoInicialMinutos: tiempoMinutos }));
      sendMessage({ type: 'CREATE_TIMERS_BATCH', data: { timers: timersData } });
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
