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
  // Forzar completado inmediato local (batch "Completar todos")
  marcarTimersCompletados: (ids: string[]) => void;
  // Limpiar un registro de completado reciente (sin timer persistente)
  clearRecentCompletion: (nombre: string) => void;
}

const TimerContext = createContext<TimerContextType | undefined>(undefined);

interface TimerProviderProps {
  children: ReactNode;
}

export const TimerProvider: React.FC<TimerProviderProps> = ({ children }) => {
  const [timers, setTimers] = useState<Timer[]>([]);
  // Track previo para detectar transiciones a completado
  const prevTimersRef = useRef<Map<string, boolean>>(new Map());
  // Completados recientes (clave por nombre normalizado o id)
  const recentCompletionsRef = useRef<Map<string, { ts: number; minutes: number; tipo: string }>>(new Map());
  // Intervalo de limpieza de completados recientes
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const limit = 2 * 60 * 1000; // 2 minutos
      for (const [k, v] of recentCompletionsRef.current.entries()) {
        if (now - v.ts > limit) recentCompletionsRef.current.delete(k);
      }
    }, 30000);
    return () => clearInterval(id);
  }, []);
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
          setTimers(prev => {
            // Mantener timers locales no confirmados que aún no aparezcan por nombre
            const serverNames = new Set<string>(timersActualizados.map((t: any) => t.nombre));
            const localesPendientes = prev.filter(t => t.pendienteSync && !serverNames.has(t.nombre));
            return [...timersActualizados, ...localesPendientes];
          });
          // Debug log removed (timers sincronizados)
          // Liberar batch en curso: tras un SYNC todos aparecen a la vez
          pendingBatchRef.current = null;
        }
        break;

      case 'TIMER_BATCH_UPDATE':
        // Actualización masiva cada segundo desde el servidor.
        // Para evitar re-render global cada segundo, sólo aplicamos cambios
        // si el estado (activo/completado) cambia o hay un salto > 5s.
        if (Array.isArray(lastMessage.data.updates)) {
          const updatesArray = lastMessage.data.updates as any[];
          setTimers(prev => prev.map(timer => {
            const update = updatesArray.find(u => u.timerId === timer.id);
            if (!update) return timer;
            const diff = Math.abs((update.tiempoRestanteSegundos ?? timer.tiempoRestanteSegundos) - timer.tiempoRestanteSegundos);
            const estadoCambio = (update.completado !== undefined && update.completado !== timer.completado) || (update.activo !== undefined && update.activo !== timer.activo);
            // Si el timer ya está completado localmente, mantenerlo.
            if (timer.completado && !estadoCambio) return timer;
            if (!estadoCambio && diff <= 5) {
              // Ignorar ajuste pequeño de segundos; InlineCountdown se basa en fechaFin.
              return timer;
            }
            return {
              ...timer,
              tiempoRestanteSegundos: update.tiempoRestanteSegundos ?? timer.tiempoRestanteSegundos,
              completado: update.completado ?? timer.completado,
              activo: update.activo ?? timer.activo
            };
          }));
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
            // Reemplazar posible timer local pendiente con mismo nombre
            const existeId = prev.find(t => t.id === nuevoTimer.id);
            const existeNombreLocal = prev.find(t => t.pendienteSync && t.nombre === nuevoTimer.nombre);
            if (existeId) return prev.map(t => t.id === nuevoTimer.id ? { ...nuevoTimer } : t);
            if (existeNombreLocal) {
              return prev.map(t => (t.pendienteSync && t.nombre === nuevoTimer.nombre) ? { ...nuevoTimer } : t);
            }
            if (isSuppressed) return prev; // esperar SYNC
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

  // Detectar completados nuevos (transición false->true)
  useEffect(() => {
    const prevMap = prevTimersRef.current;
    timers.forEach(t => {
      const estabaCompletado = prevMap.get(t.id) || false;
      if (!estabaCompletado && t.completado) {
        const keyNombre = t.nombre.toLowerCase();
        recentCompletionsRef.current.set(keyNombre, { ts: Date.now(), minutes: t.tiempoInicialMinutos, tipo: t.tipoOperacion });
        recentCompletionsRef.current.set(t.id, { ts: Date.now(), minutes: t.tiempoInicialMinutos, tipo: t.tipoOperacion });
      }
    });
    // Actualizar snapshot
    const nuevo = new Map<string, boolean>();
    timers.forEach(t => nuevo.set(t.id, t.completado));
    prevTimersRef.current = nuevo;
  }, [timers]);

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
    const ahora = new Date();
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    // Optimista local
    setTimers(prev => [
      ...prev,
      {
        id: localId,
        nombre,
        tipoOperacion,
        tiempoInicialMinutos: tiempoMinutos,
        tiempoRestanteSegundos: tiempoMinutos * 60,
        fechaInicio: ahora,
        fechaFin: new Date(ahora.getTime() + tiempoMinutos * 60000),
        activo: true,
        completado: false,
        pendienteSync: true,
      }
    ]);
    if (isConnected) {
      sendMessage({
        type: 'CREATE_TIMER',
        data: { timer: { nombre, tipoOperacion, tiempoInicialMinutos: tiempoMinutos } }
      });
    }
  };

  const iniciarTimers = (nombres: string[], tipoOperacion: 'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion', tiempoMinutos: number) => {
    if (nombres.length === 0) return;
    const ahora = Date.now();
    const nuevos: Timer[] = nombres.map((nombre, idx) => ({
      id: `local-${ahora}-${idx}-${Math.random().toString(36).slice(2,6)}`,
      nombre,
      tipoOperacion,
      tiempoInicialMinutos: tiempoMinutos,
      tiempoRestanteSegundos: tiempoMinutos * 60,
      fechaInicio: new Date(),
      fechaFin: new Date(Date.now() + tiempoMinutos * 60000),
      activo: true,
      completado: false,
      pendienteSync: true,
    }));
    setTimers(prev => [...prev, ...nuevos]);
    if (isConnected) {
      const timersData = nuevos.map(t => ({
        nombre: t.nombre,
        tipoOperacion: t.tipoOperacion,
        tiempoInicialMinutos: t.tiempoInicialMinutos,
      }));
      pendingBatchRef.current = { names: new Set(nombres), expiresAt: Date.now() + 3000 };
      sendMessage({ type: 'CREATE_TIMERS_BATCH', data: { timers: timersData } });
      setTimeout(() => {
        if (isConnected) sendMessage({ type: 'REQUEST_SYNC', data: {} });
      }, 200);
    }
  };

  const pausarTimer = (id: string) => {
    setTimers(prev => prev.map(t => t.id === id ? { ...t, activo: false } : t));
    if (isConnected) {
      sendMessage({ type: 'PAUSE_TIMER', data: { timerId: id } });
    }
  };

  const reanudarTimer = (id: string) => {
    setTimers(prev => prev.map(t => t.id === id ? { ...t, activo: true } : t));
    if (isConnected) {
      sendMessage({ type: 'RESUME_TIMER', data: { timerId: id } });
    }
  };

  const eliminarTimer = (id: string) => {
    setTimers(prev => prev.filter(t => t.id !== id));
    if (isConnected) {
      sendMessage({ type: 'DELETE_TIMER', data: { timerId: id } });
    }
  };

  // Marcar timers como completados inmediatamente de forma local.
  // Nota: si el backend no soporta completado anticipado, en el próximo SYNC podrían revertir.
  // Para minimizar parpadeos, añadimos registro en recentCompletions y los pausamos en el servidor.
  const marcarTimersCompletados = (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    setTimers(prev => prev.map(t => {
      if (ids.includes(t.id) && !t.completado) {
        recentCompletionsRef.current.set(t.nombre.toLowerCase(), { ts: Date.now(), minutes: t.tiempoInicialMinutos, tipo: t.tipoOperacion });
        recentCompletionsRef.current.set(t.id, { ts: Date.now(), minutes: t.tiempoInicialMinutos, tipo: t.tipoOperacion });
        return { ...t, tiempoRestanteSegundos: 0, completado: true, activo: false };
      }
      return t;
    }));
    // Enviar PAUSE_TIMER para cada uno (si el servidor luego decide marcarlos completados al llegar a 0 seguirá su flujo normal)
    ids.forEach(id => {
      if (isConnected) {
        sendMessage({ type: 'PAUSE_TIMER', data: { timerId: id } });
      }
    });
  };

  const clearRecentCompletion = (nombre: string) => {
    if (!nombre) return;
    recentCompletionsRef.current.delete(nombre.toLowerCase());
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

  const normalizarClave = (s: string) => s.toLowerCase();
  const getRecentCompletion = (nombre: string, tipoOperacion?: string): { minutes: number } | null => {
    if (!nombre) return null;
    const key = normalizarClave(nombre);
    const entry = recentCompletionsRef.current.get(key);
    if (!entry) return null;
    if (tipoOperacion && entry.tipo !== tipoOperacion) return null;
    // Vigencia la gestiona el limpiador; si existe, es válido
    return { minutes: entry.minutes };
  };
  const getRecentCompletionById = (id: string | number): { minutes: number } | null => {
    const entry = recentCompletionsRef.current.get(String(id));
    if (!entry) return null;
    return { minutes: entry.minutes };
  };

  // Tick local para timers pendientes de sync
  useEffect(() => {
    const id = setInterval(() => {
      setTimers(prev => prev.map(t => {
        if (t.pendienteSync && t.activo && !t.completado) {
          const nuevoRestante = t.tiempoRestanteSegundos - 1;
          if (nuevoRestante <= 0) {
            // Marcar completado local y registrar completion
            recentCompletionsRef.current.set(t.nombre.toLowerCase(), { ts: Date.now(), minutes: t.tiempoInicialMinutos, tipo: t.tipoOperacion });
            recentCompletionsRef.current.set(t.id, { ts: Date.now(), minutes: t.tiempoInicialMinutos, tipo: t.tipoOperacion });
            return { ...t, tiempoRestanteSegundos: 0, completado: true, activo: false };
          }
          return { ...t, tiempoRestanteSegundos: nuevoRestante };
        }
        return t;
      }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

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
  marcarTimersCompletados,
  clearRecentCompletion,
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
