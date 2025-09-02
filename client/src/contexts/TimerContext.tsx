import React, { createContext, useContext, ReactNode } from 'react';
import useTimer, { Timer } from '../features/operacion/hooks/useTimer';

interface TimerContextType {
  timers: Timer[];
  crearTimer: (nombre: string, tipoOperacion: 'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion', tiempoMinutos: number) => string;
  crearTimerLocal: (nombre: string, tipoOperacion: 'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion', tiempoMinutos: number) => string;
  pausarTimer: (id: string) => void;
  reanudarTimer: (id: string) => void;
  eliminarTimer: (id: string) => void;
  formatearTiempo: (segundos: number) => string;
  obtenerTimersActivos: () => Timer[];
  obtenerTimersCompletados: () => Timer[];
  forzarSincronizacion: () => void;
  isConnected: boolean;
  getRecentCompletion: (
    nombre: string,
    tipoOperacion: 'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion'
  ) => { minutes: number; at: number; startMs: number } | null;
  getRecentCompletionById: (
    tipoOperacion: 'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion',
    itemId: number
  ) => { minutes: number; at: number; startMs: number } | null;
}

const TimerContext = createContext<TimerContextType | undefined>(undefined);

interface TimerProviderProps {
  children: ReactNode;
}

export const TimerProvider: React.FC<TimerProviderProps> = ({ children }) => {
  const timerHook = useTimer(async (timer) => {
    // Reglas de alertas específicas
    try {
      // 1) Operación 96h: alertar solo si no ha retornado ni pasado por limpieza ni regresado a operación
      if (timer.tipoOperacion === 'envio') {
        const match = timer.nombre.match(/^Envío\s+#(\d+)\s+-/);
        if (match) {
          const id = Number(match[1]);
          try {
            const { apiServiceClient } = await import('../api/apiClient');
            const resp = await apiServiceClient.get('/inventory/inventario/');
            const inv = resp.data || [];
            const item = inv.find((it: any) => it.id === id);
            const norm = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
            const estado = norm(item?.estado);
            const sub = norm(item?.sub_estado);
            const devolucion = estado === 'devolucion';
            const inspeccion = estado === 'inspeccion';
            const regresoOperacion = estado === 'operacion' && sub === 'en transito';
            if (!devolucion && !inspeccion && !regresoOperacion) {
              // Enviar alerta específica
              const { apiServiceClient } = await import('../api/apiClient');
              await apiServiceClient.post('/alerts/timer-completed', {
                timer: {
                  id: timer.id,
                  nombre: timer.nombre,
                  tipoOperacion: 'operacion_overdue',
                  tiempoInicialMinutos: timer.tiempoInicialMinutos,
                  fechaInicio: timer.fechaInicio.toISOString(),
                  fechaFin: timer.fechaFin.toISOString()
                },
                reason: 'operacion_overdue_no_return',
                severity: 'high'
              });
            }
          } catch (e) {
            console.warn('No se pudo verificar estado de inventario para overdue de operación:', e);
          }
        }
      }

      // 2) Inspección 36h: el alert ya se envía por defecto (ver useTimer), no se requiere lógica extra aquí
    } catch (err) {
      console.warn('Error en onTimerComplete (TimerProvider):', err);
    }
  });

  return (
  <TimerContext.Provider value={timerHook}>
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
