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
  // Eliminado: offset de servidor; usaremos directamente fechas/segundos enviados.
  
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
            fechaFin: new Date(t.fechaFin),
            pendienteSync: false
          };
          setTimers(prev => {
            const idx = prev.findIndex(x => x.pendienteSync && x.nombre === nuevo.nombre && x.tipoOperacion === nuevo.tipoOperacion);
            if (idx >= 0) {
              const copia = [...prev];
              pendingTimersRef.current.delete(prev[idx].id);
              copia[idx] = nuevo;
              return copia;
            }
            if (prev.find(x => x.id === nuevo.id)) return prev.map(x => x.id === nuevo.id ? nuevo : x);
            return [...prev, nuevo];
          });
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

  // Creación optimista -----------------------------------------------------
  const pendingTimersRef = useRef<Map<string, number>>(new Map());

  const crearOptimista = (nombre: string, tipoOperacion: Timer['tipoOperacion'], tiempoMinutos: number) => {
    const now = new Date();
    const provisionalId = `local-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const provisional: Timer = {
      id: provisionalId,
      nombre,
      tipoOperacion,
      tiempoInicialMinutos: tiempoMinutos,
      tiempoRestanteSegundos: tiempoMinutos * 60,
      fechaInicio: now,
      fechaFin: new Date(now.getTime() + tiempoMinutos * 60000),
      activo: true,
      completado: false,
      pendienteSync: true
    };
    setTimers(prev => {
      if (prev.some(t => t.pendienteSync && t.nombre === nombre && t.tipoOperacion === tipoOperacion)) return prev;
      return [...prev, provisional];
    });
    pendingTimersRef.current.set(provisionalId, Date.now());
  };

  const iniciarTimer = (nombre: string, tipoOperacion: Timer['tipoOperacion'], tiempoMinutos: number) => {
    crearOptimista(nombre, tipoOperacion, tiempoMinutos);
    if (isConnected) {
      sendMessage({ type: 'CREATE_TIMER', data: { timer: { nombre, tipoOperacion, tiempoInicialMinutos: tiempoMinutos } } });
    }
  };

  const iniciarTimers = (nombres: string[], tipoOperacion: Timer['tipoOperacion'], tiempoMinutos: number) => {
    if (!nombres.length) return;
    nombres.forEach(n => crearOptimista(n, tipoOperacion, tiempoMinutos));
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

  // Reconciliación de timers optimistas
  useEffect(() => {
    const iv = setInterval(() => {
      if (!pendingTimersRef.current.size) return;
      const now = Date.now();
      let needSync = false;
      pendingTimersRef.current.forEach((ts, provisionalId) => {
        if (now - ts > 4000) needSync = true;
        if (now - ts > 15000) {
          setTimers(prev => prev.filter(t => t.id !== provisionalId));
          pendingTimersRef.current.delete(provisionalId);
        }
      });
      if (needSync) forzarSincronizacion();
    }, 2000);
    return () => clearInterval(iv);
  }, [isConnected]);

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
