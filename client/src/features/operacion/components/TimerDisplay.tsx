import React, { useEffect, useState } from 'react';
import { Clock, Pause, Play, X } from 'lucide-react';
import { Timer } from '../../../contexts/TimerContext';

interface TimerDisplayProps {
  timers: Timer[];
  onPausar: (id: string) => void;
  onReanudar: (id: string) => void;
  onEliminar: (id: string) => void;
  formatearTiempo: (segundos: number) => string;
}

const TimerDisplay: React.FC<TimerDisplayProps> = ({
  timers,
  onPausar,
  onReanudar,
  onEliminar,
  formatearTiempo
}) => {
  // Tick local cada segundo para timers activos (evita depender de updates por WebSocket cada segundo)
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const timersActivos = timers.filter(timer => !timer.completado);
  
  if (timersActivos.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-sm">
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gray-50 p-3 border-b">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-800">
              Cronómetros Activos ({timersActivos.length})
            </h3>
          </div>
        </div>

        {/* Timers */}
        <div className="max-h-80 overflow-y-auto">
          {timersActivos.map((timer) => (
            <div
              key={timer.id}
              className={`p-3 border-b last:border-b-0 ${
                timer.tipoOperacion === 'congelamiento' ? 'bg-blue-50' : 'bg-orange-50'
              }`}
            >
              {/* Header del timer */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Clock className={`w-4 h-4 ${
                    timer.tipoOperacion === 'congelamiento' ? 'text-blue-600' : 'text-orange-600'
                  }`} />
                  <span className={`text-xs font-medium ${
                    timer.tipoOperacion === 'congelamiento' ? 'text-blue-800' : 'text-orange-800'
                  }`}>
                    {timer.tipoOperacion === 'congelamiento' ? 'Congelamiento' : 'Atemperamiento'}
                  </span>
                </div>
                <button
                  onClick={() => onEliminar(timer.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                  title="Eliminar cronómetro"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Nombre del TIC */}
              <div className="mb-2">
                <span className="text-sm font-medium text-gray-800 truncate block">
                  {timer.nombre}
                </span>
              </div>

              {/* Tiempo restante */}
              <div className="flex items-center justify-between">
                <div className={`text-lg font-bold ${
                  timer.tiempoRestanteSegundos < 300 // Menos de 5 minutos
                    ? 'text-red-600'
                    : timer.tipoOperacion === 'congelamiento'
                    ? 'text-blue-600'
                    : 'text-orange-600'
                }`}>
                  {(() => {
                    if (timer.completado) return formatearTiempo(0);
                    const remaining = (!timer.activo ? timer.tiempoRestanteSegundos : Math.max(0, Math.ceil((timer.fechaFin.getTime() - now) / 1000)));
                    return formatearTiempo(remaining);
                  })()}
                </div>
                
                {/* Controles */}
                <div className="flex gap-1">
                  {timer.activo ? (
                    <button
                      onClick={() => onPausar(timer.id)}
                      className="p-1 text-gray-600 hover:text-gray-800 transition-colors"
                      title="Pausar"
                    >
                      <Pause size={16} />
                    </button>
                  ) : (
                    <button
                      onClick={() => onReanudar(timer.id)}
                      className="p-1 text-green-600 hover:text-green-800 transition-colors"
                      title="Reanudar"
                    >
                      <Play size={16} />
                    </button>
                  )}
                </div>
              </div>

              {/* Barra de progreso */}
              <div className="mt-2">
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-1000 ${
                      timer.tipoOperacion === 'congelamiento' ? 'bg-blue-500' : 'bg-orange-500'
                    }`}
                    style={{
                      width: `${(() => {
                        const total = timer.tiempoInicialMinutos * 60;
                        const remaining = timer.completado ? 0 : (!timer.activo ? timer.tiempoRestanteSegundos : Math.max(0, Math.ceil((timer.fechaFin.getTime() - now) / 1000)));
                        return Math.max(0, (remaining / total) * 100);
                      })()}%`
                    }}
                  />
                </div>
              </div>

              {/* Estado */}
              {!timer.activo && !timer.completado && (
                <div className="mt-1 text-xs text-gray-500 flex items-center gap-1">
                  <Pause size={12} />
                  Pausado
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TimerDisplay;
