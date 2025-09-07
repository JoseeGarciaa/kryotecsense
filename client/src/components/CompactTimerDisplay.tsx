import React from 'react';
import { Clock, Pause, Play, X } from 'lucide-react';
import { Timer } from '../contexts/TimerContext';

interface CompactTimerDisplayProps {
  timers: Timer[];
  onPausar: (id: string) => void;
  onReanudar: (id: string) => void;
  onEliminar: (id: string) => void;
  formatearTiempo: (segundos: number) => string;
}

const CompactTimerDisplay: React.FC<CompactTimerDisplayProps> = ({
  timers,
  onPausar,
  onReanudar,
  onEliminar,
  formatearTiempo
}) => {
  const timersActivos = timers.filter(timer => !timer.completado);
  
  if (timersActivos.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs">
      {timersActivos.map((timer) => (
        <div
          key={timer.id}
          className={`
            relative p-3 rounded-lg shadow-lg border-2 transition-all duration-300
            ${timer.tipoOperacion === 'congelamiento' 
              ? 'bg-blue-50 border-blue-200' 
              : 'bg-orange-50 border-orange-200'
            }
            ${timer.tiempoRestanteSegundos < 300 ? 'animate-pulse' : ''}
          `}
        >
          {/* Indicador de tipo */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Clock className={`w-4 h-4 ${
                timer.tipoOperacion === 'congelamiento' ? 'text-blue-600' : 'text-orange-600'
              }`} />
              <span className={`text-xs font-semibold ${
                timer.tipoOperacion === 'congelamiento' ? 'text-blue-800' : 'text-orange-800'
              }`}>
                {timer.tipoOperacion === 'congelamiento' ? 'Congelamiento' : 'Atemperamiento'}
              </span>
            </div>
            
            {/* Botón eliminar */}
            <button
              onClick={() => onEliminar(timer.id)}
              className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-full hover:bg-white/50"
              title="Eliminar cronómetro"
            >
              <X size={14} />
            </button>
          </div>

          {/* Nombre del TIC */}
          <div className="mb-2">
            <span className="text-sm font-bold text-gray-800 truncate block">
              {timer.nombre}
            </span>
          </div>

          {/* Tiempo y controles */}
          <div className="flex items-center justify-between">
            <div className={`text-xl font-bold ${
              timer.tiempoRestanteSegundos < 300 // Menos de 5 minutos
                ? 'text-red-600'
                : timer.tipoOperacion === 'congelamiento'
                ? 'text-blue-600'
                : 'text-orange-600'
            }`}>
              {formatearTiempo(timer.tiempoRestanteSegundos)}
            </div>
            
            {/* Control de pausa/reanudar */}
            <div className="flex items-center gap-1">
              {timer.activo ? (
                <button
                  onClick={() => onPausar(timer.id)}
                  className="p-2 rounded-full bg-white/70 text-gray-600 hover:text-gray-800 hover:bg-white transition-all shadow-sm"
                  title="Pausar"
                >
                  <Pause size={16} />
                </button>
              ) : (
                <button
                  onClick={() => onReanudar(timer.id)}
                  className="p-2 rounded-full bg-white/70 text-green-600 hover:text-green-800 hover:bg-white transition-all shadow-sm"
                  title="Reanudar"
                >
                  <Play size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Barra de progreso */}
          <div className="mt-3">
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all duration-1000 ${
                  timer.tipoOperacion === 'congelamiento' ? 'bg-blue-500' : 'bg-orange-500'
                }`}
                style={{
                  width: `${Math.max(0, (timer.tiempoRestanteSegundos / (timer.tiempoInicialMinutos * 60)) * 100)}%`
                }}
              />
            </div>
          </div>

          {/* Indicador de estado pausado */}
          {!timer.activo && !timer.completado && (
            <div className="absolute top-2 left-2 text-xs text-gray-500 bg-white/80 px-2 py-1 rounded-full flex items-center gap-1">
              <Pause size={10} />
              Pausado
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default CompactTimerDisplay;
