import React from 'react';
import { Clock, CheckCircle } from 'lucide-react';
import { useTimer } from '../hooks/useTimer';
import type { Timer } from '../../../contexts/TimerContext';

interface TimerDisplayGlobalProps {
  tipoFase: 'congelamiento' | 'atemperamiento' | 'envio';
  titulo: string;
}

const TimerDisplayGlobal: React.FC<TimerDisplayGlobalProps> = ({ tipoFase, titulo }) => {
  const { timers, formatearTiempo } = useTimer();

  // Filtrar timers por tipo de fase (incluir activos y completados)
  const timersFiltrados = timers.filter((timer: Timer) => 
    timer.tipoOperacion === tipoFase
  );

  // Separar activos y completados
  const timersActivos = timersFiltrados.filter((timer: Timer) => !timer.completado);
  const timersCompletados = timersFiltrados.filter((timer: Timer) => timer.completado);

  if (timersFiltrados.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
      <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
        <Clock className="w-5 h-5" />
        {titulo}
        <span className="text-sm font-normal text-gray-500">
          ({timersActivos.length} activos{timersCompletados.length > 0 ? `, ${timersCompletados.length} completados` : ''})
        </span>
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Renderizar timers activos primero */}
  {timersActivos.map((timer: Timer) => {
          const tiempoFormateado = formatearTiempo(timer.tiempoRestanteSegundos);
          const esUrgente = timer.tiempoRestanteSegundos < 300; // 5 minutos
          
          const getColorPorTipo = (tipo: string) => {
            switch (tipo) {
              case 'envio':
                return esUrgente ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50';
              case 'congelamiento':
                return esUrgente ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50';
              case 'atemperamiento':
                return esUrgente ? 'border-red-200 bg-red-50' : 'border-orange-200 bg-orange-50';
              default:
                return 'border-gray-200 bg-gray-50';
            }
          };

          const getTextColorPorTipo = (tipo: string) => {
            switch (tipo) {
              case 'envio':
                return esUrgente ? 'text-red-600' : 'text-green-600';
              case 'congelamiento':
                return esUrgente ? 'text-red-600' : 'text-blue-600';
              case 'atemperamiento':
                return esUrgente ? 'text-red-600' : 'text-orange-600';
              default:
                return esUrgente ? 'text-red-600' : 'text-gray-600';
            }
          };

          return (
            <div
              key={timer.id}
              className={`p-3 rounded-lg border ${getColorPorTipo(timer.tipoOperacion)}`}
            >
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-sm text-gray-800 truncate">
                  {timer.nombre}
                </h4>
                {!timer.activo && (
                  <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded">
                    Pausado
                  </span>
                )}
              </div>
              
              <div className="flex items-center justify-between">
                <span className={`text-lg font-bold ${getTextColorPorTipo(timer.tipoOperacion)}`}>
                  {tiempoFormateado}
                </span>
                
                {/* Controles por cronómetro removidos */}
              </div>
              
              {esUrgente && (
                <div className="mt-2 text-xs text-red-600 font-medium">
                  ⚠️ Tiempo crítico
                </div>
              )}
            </div>
          );
        })}

        {/* Renderizar timers completados después */}
  {timersCompletados.map((timer: Timer) => (
          <div
            key={timer.id}
            className="p-3 rounded-lg border border-green-200 bg-green-50 opacity-75"
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-sm text-gray-800 truncate">
                {timer.nombre}
              </h4>
              <span className="text-xs text-green-600 bg-green-200 px-2 py-1 rounded flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                Completado
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-green-600">
                ✅ {timer.tiempoInicialMinutos}min
              </span>
              
              {/* Botón eliminar removido */}
            </div>
            
            <div className="mt-2 text-xs text-green-600">
              Tiempo original: {timer.tiempoInicialMinutos} minutos
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TimerDisplayGlobal;
