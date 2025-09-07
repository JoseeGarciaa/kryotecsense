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
  // Limpieza robusta: elimina todos los timers (activos o completados) asociados a un nombre y borra registros recientes.
  forceClearTimer: (nombre: string, tipoOperacion?: 'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion') => void;
  // Limpieza masiva (una sola pasada) por lista de nombres
  forceClearTimers: (nombres: string[], tipoOperacion?: 'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion') => void;
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
  // Nombres limpiados manualmente recientemente (para evitar que reaparezcan inmediatamente por un SYNC tardío)
  const clearedNamesRef = useRef<Map<string, number>>(new Map()); // nombre normalizado -> expiry timestamp
  // Intervalo de limpieza de completados recientes
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const limit = 2 * 60 * 1000; // 2 minutos
      for (const [k, v] of recentCompletionsRef.current.entries()) {
        if (now - v.ts > limit) recentCompletionsRef.current.delete(k);
      }
      // Limpiar expirados de clearedNamesRef
      for (const [k, expiry] of clearedNamesRef.current.entries()) {
        if (now > expiry) clearedNamesRef.current.delete(k);
      }
    }, 30000);
    return () => clearInterval(id);
  }, []);
  // Batch en progreso para evitar efecto "cascada" al iniciar muchos a la vez
  const pendingBatchRef = useRef<{
    names: Set<string>;
    expiresAt: number;
    startAt: number; // timestamp ms cuando se pulsó Iniciar Todos
    durationSec: number; // duración total en segundos
  } | null>(null);
  
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
    return batch.names.has(nombre.toLowerCase());
  };

  // Escuchar mensajes del WebSocket
  useEffect(() => {
    if (!lastMessage) return;
  // Debug logs removed (mensaje recibido)

    switch (lastMessage.type) {
      case 'TIMER_SYNC':
        // Sincronización completa desde el servidor
        if (Array.isArray(lastMessage.data.timers)) {
          let timersActualizados = lastMessage.data.timers.map((timer: any) => ({
            ...timer,
            fechaInicio: new Date(timer.fechaInicio),
            fechaFin: new Date(timer.fechaFin),
            tiempoRestanteSegundos: timer.server_remaining_time || timer.tiempoRestanteSegundos
          }));
          // Filtrar timers que fueron limpiados recientemente por el usuario (protección anti "reaparecer")
          const now = Date.now();
          timersActualizados = timersActualizados.filter((t: any) => {
            const key = String(t.nombre).toLowerCase();
            const expiry = clearedNamesRef.current.get(key);
            if (expiry && now <= expiry) {
              return false; // suprimir
            }
            return true;
          });
          // Normalizar batch si sigue vigente (alinear misma fechaInicio/fin para todos los nombres del batch)
          const batchSync = pendingBatchRef.current;
          if (batchSync && Date.now() <= batchSync.expiresAt) {
            timersActualizados = timersActualizados.map((t: any) => {
              if (!batchSync.names.has(t.nombre)) return t;
              const fechaInicio = new Date(batchSync.startAt);
              const fechaFin = new Date(batchSync.startAt + batchSync.durationSec * 1000);
              const restante = Math.max(0, Math.ceil((fechaFin.getTime() - Date.now()) / 1000));
              return { ...t, fechaInicio, fechaFin, tiempoRestanteSegundos: restante };
            });
          }
          setTimers(prev => {
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
          let nuevoTimer = {
            ...lastMessage.data.timer,
            fechaInicio: new Date(lastMessage.data.timer.fechaInicio),
            fechaFin: new Date(lastMessage.data.timer.fechaFin)
          };
          // Suprimir si el usuario lo limpió manualmente hace muy poco (servidor tardío)
          const clearedExpiry = clearedNamesRef.current.get(String(nuevoTimer.nombre).toLowerCase());
          if (clearedExpiry && Date.now() <= clearedExpiry) {
            break; // ignorar evento
          }
          // Si estamos iniciando un lote, normalizar fechaInicio/fin y opcionalmente suprimir hasta SYNC
          const batch = pendingBatchRef.current;
          const isBatchMember = batch && Date.now() <= batch.expiresAt && batch.names.has(String(nuevoTimer.nombre).toLowerCase());
          if (isBatchMember && batch) {
            const fechaInicio = new Date(batch.startAt);
            const fechaFin = new Date(batch.startAt + batch.durationSec * 1000);
            const restante = Math.max(0, Math.ceil((fechaFin.getTime() - Date.now()) / 1000));
            nuevoTimer = { ...nuevoTimer, fechaInicio, fechaFin, tiempoRestanteSegundos: restante } as any;
          }
          const isSuppressed = !!(batch && Date.now() <= batch.expiresAt && batch.names.has(String(nuevoTimer.nombre).toLowerCase()));
          setTimers(prev => {
            // Reemplazar placeholder local si existe
            const existeId = prev.find(t => t.id === nuevoTimer.id);
            if (existeId) return prev.map(t => t.id === nuevoTimer.id ? { ...nuevoTimer, pendienteSync: false } : t);
            const idxPlace = prev.findIndex(t => t.pendienteSync && t.nombre === nuevoTimer.nombre);
            if (idxPlace >= 0) {
              const copia = [...prev];
              copia[idxPlace] = { ...nuevoTimer, pendienteSync: false } as any;
              return copia;
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
    if (!nombres.length) return;
    if (isConnected) {
      const startAt = Date.now();
      pendingBatchRef.current = { names: new Set(nombres.map(n => n.toLowerCase())), expiresAt: startAt + 5000, startAt, durationSec: tiempoMinutos * 60 };
      // Placeholders uniformes
      setTimers(prev => {
        const existentes = new Set(prev.map(t => t.nombre.toLowerCase()));
        const fechaInicio = new Date(startAt);
        const fechaFin = new Date(startAt + tiempoMinutos * 60000);
        const nuevos: Timer[] = nombres.filter(n => !existentes.has(n.toLowerCase())).map((nombre, idx) => ({
          id: `batch-local-${startAt}-${idx}-${Math.random().toString(36).slice(2,6)}`,
          nombre,
          tipoOperacion,
          tiempoInicialMinutos: tiempoMinutos,
          tiempoRestanteSegundos: tiempoMinutos * 60,
          fechaInicio,
          fechaFin,
          activo: true,
          completado: false,
          pendienteSync: true,
        }));
        return nuevos.length ? [...prev, ...nuevos] : prev;
      });
      const timersData = nombres.map(nombre => ({ nombre, tipoOperacion, tiempoInicialMinutos: tiempoMinutos }));
      sendMessage({ type: 'CREATE_TIMERS_BATCH', data: { timers: timersData } });
      setTimeout(() => { if (isConnected) sendMessage({ type: 'REQUEST_SYNC', data: {} }); }, 250);
    } else {
      // Offline fallback
      const ahora = Date.now();
      const base = new Date();
      const locales: Timer[] = nombres.map((nombre, idx) => ({
        id: `offline-${ahora}-${idx}-${Math.random().toString(36).slice(2,6)}`,
        nombre,
        tipoOperacion,
        tiempoInicialMinutos: tiempoMinutos,
        tiempoRestanteSegundos: tiempoMinutos * 60,
        fechaInicio: base,
        fechaFin: new Date(base.getTime() + tiempoMinutos * 60000),
        activo: true,
        completado: false,
        pendienteSync: true,
      }));
      setTimers(prev => [...prev, ...locales]);
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

  // Elimina cualquier timer (activo, completado o pendiente) que coincida con el nombre (y opcionalmente tipoOperacion)
  // y limpia registros de completado recientes para evitar que reaparezca el estado "Completo" visual.
  const SUPPRESS_MS = 12000; // ventana para evitar reaparición desde SYNC

  const forceClearTimer = (nombre: string, tipoOperacion?: 'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion') => {
    if (!nombre) return;
    const claveNorm = nombre.toLowerCase();
    setTimers(prev => {
      const aEliminar: string[] = [];
      const restantes = prev.filter(t => {
        const coincideNombre = t.nombre.toLowerCase() === claveNorm;
        const coincideTipo = !tipoOperacion || t.tipoOperacion === tipoOperacion;
        if (coincideNombre && coincideTipo) {
          aEliminar.push(t.id);
          return false;
        }
        return true;
      });
      // Enviar DELETE al backend para cada id eliminado (mejor esfuerzo)
      if (isConnected && aEliminar.length) {
        aEliminar.forEach(id => {
          try { sendMessage({ type: 'DELETE_TIMER', data: { timerId: id } }); } catch {}
        });
      }
      // Limpiar recent completions (por nombre y por id)
      recentCompletionsRef.current.delete(claveNorm);
      aEliminar.forEach(id => recentCompletionsRef.current.delete(id));
  // Bloquear recreación durante unos segundos
      clearedNamesRef.current.set(claveNorm, Date.now() + SUPPRESS_MS);
      return restantes;
    });
  };

  const forceClearTimers = (nombres: string[], tipoOperacion?: 'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion') => {
    if (!nombres?.length) return;
    const claves = new Set(nombres.map(n => n.toLowerCase()));
    setTimers(prev => {
      const aEliminarIds: string[] = [];
      const restantes = prev.filter(t => {
        const cn = t.nombre.toLowerCase();
        if (!claves.has(cn)) return true;
        if (tipoOperacion && t.tipoOperacion !== tipoOperacion) return true;
        aEliminarIds.push(t.id);
        return false;
      });
      if (isConnected && aEliminarIds.length) {
        aEliminarIds.forEach(id => { try { sendMessage({ type: 'DELETE_TIMER', data: { timerId: id } }); } catch {} });
      }
      // limpiar registros recientes y marcar supresión
      claves.forEach(c => {
        recentCompletionsRef.current.delete(c);
        clearedNamesRef.current.set(c, Date.now() + SUPPRESS_MS);
      });
      aEliminarIds.forEach(id => recentCompletionsRef.current.delete(id));
      return restantes;
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
  forceClearTimer,
  forceClearTimers,
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
