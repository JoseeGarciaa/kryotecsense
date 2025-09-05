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
}

const TimerContext = createContext<TimerContextType | undefined>(undefined);

interface TimerProviderProps {
  children: ReactNode;
}

export const TimerProvider: React.FC<TimerProviderProps> = ({ children }) => {
  const [timers, setTimers] = useState<Timer[]>([]);
  
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

    console.log('📨 Mensaje WebSocket recibido:', lastMessage.type);

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
          console.log(`🔄 ${timersActualizados.length} timers sincronizados desde servidor`);
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
          setTimers(prev => {
            // Evitar duplicados
            if (prev.find(t => t.id === nuevoTimer.id)) return prev;
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

    sendMessage({
      type: 'CREATE_TIMERS_BATCH',
      data: {
        timers: timersData
      }
    });
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

  const contextValue: TimerContextType = {
    timers,
    isConnected,
    iniciarTimer,
    iniciarTimers,
    pausarTimer,
    reanudarTimer,
    eliminarTimer,
    formatearTiempo,
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
