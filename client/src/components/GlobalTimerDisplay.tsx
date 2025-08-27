import React from 'react';
import { useTimerContext } from '../contexts/TimerContext';
import CompactTimerDisplay from './CompactTimerDisplay';

const GlobalTimerDisplay: React.FC = () => {
  const {
    timers,
    pausarTimer,
    reanudarTimer,
    eliminarTimer,
    formatearTiempo
  } = useTimerContext();

  // Solo mostrar si hay timers activos
  const timersActivos = timers.filter(timer => !timer.completado);
  
  if (timersActivos.length === 0) {
    return null;
  }

  return (
    <CompactTimerDisplay
      timers={timers}
      onPausar={pausarTimer}
      onReanudar={reanudarTimer}
      onEliminar={eliminarTimer}
      formatearTiempo={formatearTiempo}
    />
  );
};

export default GlobalTimerDisplay;
