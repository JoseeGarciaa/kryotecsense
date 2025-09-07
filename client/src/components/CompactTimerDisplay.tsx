import React, { useEffect, useState, useMemo } from 'react';
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
  // Tick local SOLO para refrescar la UI; la fuente de verdad sigue siendo el servidor.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Calcular remaining dinámico (si activo usamos fechaFin, si pausado usamos tiempoRestanteSegundos entregado por el server)
  const enrich = (t: Timer) => {
    let remaining = t.tiempoRestanteSegundos;
    if (t.completado) remaining = 0;
    else if (t.activo && t.fechaFin) {
      const diff = Math.ceil((t.fechaFin.getTime() - Date.now()) / 1000);
      remaining = diff < 0 ? 0 : diff; // clamp
    }
    return { ...t, _remaining: remaining } as Timer & { _remaining: number };
  };

  const timersActivos = useMemo(() => timers.filter(t => !t.completado).map(enrich), [timers]);

  if (timersActivos.length === 0) return null;

  const typeStyles: Record<string, { bg: string; border: string; accent: string; accentText: string; bar: string }> = {
    congelamiento: { bg: 'bg-blue-50', border: 'border-blue-200', accent: 'text-blue-600', accentText: 'text-blue-800', bar: 'bg-blue-500' },
    atemperamiento: { bg: 'bg-orange-50', border: 'border-orange-200', accent: 'text-orange-600', accentText: 'text-orange-800', bar: 'bg-orange-500' },
    envio: { bg: 'bg-emerald-50', border: 'border-emerald-200', accent: 'text-emerald-600', accentText: 'text-emerald-800', bar: 'bg-emerald-500' },
    inspeccion: { bg: 'bg-violet-50', border: 'border-violet-200', accent: 'text-violet-600', accentText: 'text-violet-800', bar: 'bg-violet-500' }
  };

  const label = (tipo: string) => {
    switch (tipo) {
      case 'congelamiento': return 'Congelamiento';
      case 'atemperamiento': return 'Atemperamiento';
      case 'envio': return 'Envío';
      case 'inspeccion': return 'Inspección';
      default: return tipo;
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs">
      {timersActivos.map((timer) => {
        const styles = typeStyles[timer.tipoOperacion] || typeStyles.congelamiento;
        const urg = timer._remaining < 300; // <5m
        const progreso = timer.tiempoInicialMinutos > 0 ? (timer._remaining / (timer.tiempoInicialMinutos * 60)) * 100 : 0;
        return (
          <div
            key={timer.id}
            className={`relative p-3 rounded-lg shadow-lg border-2 transition-all duration-300 ${styles.bg} ${styles.border} ${urg ? 'animate-pulse' : ''}`}
          >
            {/* Indicador de tipo */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock className={`w-4 h-4 ${styles.accent}`} />
                <span className={`text-xs font-semibold ${styles.accentText}`}>{label(timer.tipoOperacion)}</span>
              </div>
              <button
                onClick={() => onEliminar(timer.id)}
                className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-full hover:bg-white/50"
                title="Eliminar cronómetro"
              >
                <X size={14} />
              </button>
            </div>
            {/* Nombre */}
            <div className="mb-2">
              <span className="text-sm font-bold text-gray-800 truncate block">{timer.nombre}</span>
            </div>
            {/* Tiempo + controles */}
            <div className="flex items-center justify-between">
              <div className={`text-xl font-bold ${urg ? 'text-red-600' : styles.accent}`}>{formatearTiempo(timer._remaining)}</div>
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
                  className={`h-2 rounded-full transition-all duration-1000 ${styles.bar}`}
                  style={{ width: `${Math.max(0, Math.min(100, progreso))}%` }}
                />
              </div>
            </div>
            {/* Pausado badge */}
            {!timer.activo && !timer.completado && (
              <div className="absolute top-2 left-2 text-xs text-gray-500 bg-white/80 px-2 py-1 rounded-full flex items-center gap-1">
                <Pause size={10} />
                Pausado
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default CompactTimerDisplay;
