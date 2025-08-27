import React, { createContext, useContext, ReactNode } from 'react';
import useTimer, { Timer } from '../features/operacion/hooks/useTimer';

interface TimerContextType {
  timers: Timer[];
  crearTimer: (nombre: string, tipoOperacion: 'congelamiento' | 'atemperamiento' | 'envio', tiempoMinutos: number) => string;
  pausarTimer: (id: string) => void;
  reanudarTimer: (id: string) => void;
  eliminarTimer: (id: string) => void;
  formatearTiempo: (segundos: number) => string;
  obtenerTimersActivos: () => Timer[];
  obtenerTimersCompletados: () => Timer[];
  isConnected: boolean;
}

const TimerContext = createContext<TimerContextType | undefined>(undefined);

interface TimerProviderProps {
  children: ReactNode;
}

export const TimerProvider: React.FC<TimerProviderProps> = ({ children }) => {
  const timerHook = useTimer();

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
