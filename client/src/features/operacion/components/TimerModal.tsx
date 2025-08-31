import React, { useState } from 'react';
import { Clock, X, Play, Loader } from 'lucide-react';

interface TimerModalProps {
  mostrarModal: boolean;
  onCancelar: () => void;
  onConfirmar: (tiempoMinutos: number) => void;
  titulo: string;
  descripcion: string;
  tipoOperacion: 'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion';
  cargando?: boolean;
}

const TimerModal: React.FC<TimerModalProps> = ({
  mostrarModal,
  onCancelar,
  onConfirmar,
  titulo,
  descripcion,
  tipoOperacion,
  cargando = false
}) => {
  // Defaults: 30 minutos por defecto para cualquier operación
  const [horas, setHoras] = useState<number>(0);
  const [minutos, setMinutos] = useState<number>(30);

  const handleConfirmar = () => {
    const tiempoTotalMinutos = (horas * 60) + minutos;
    if (tiempoTotalMinutos > 0) {
      onConfirmar(tiempoTotalMinutos);
      // Resetear valores
      setHoras(0);
      setMinutos(30);
    }
  };

  const handleCancelar = () => {
    // Resetear valores
    setHoras(0);
    setMinutos(30);
    onCancelar();
  };

  // Early return después de todos los hooks
  if (!mostrarModal) return null;

  // Tiempos sugeridos según el tipo de operación
  const tiemposSugeridos = [
    { label: '15 min', horas: 0, minutos: 15 },
    { label: '30 min', horas: 0, minutos: 30 },
    { label: '45 min', horas: 0, minutos: 45 },
    { label: '1 hora', horas: 1, minutos: 0 }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className={`p-4 border-b flex justify-between items-center ${
          tipoOperacion === 'congelamiento' ? 'bg-blue-50' : 'bg-orange-50'
        }`}>
          <div className="flex items-center gap-2">
            <Clock className={`w-5 h-5 ${
              tipoOperacion === 'congelamiento' ? 'text-blue-600' : 'text-orange-600'
            }`} />
            <h2 className={`text-lg font-semibold ${
              tipoOperacion === 'congelamiento' ? 'text-blue-800' : 'text-orange-800'
            }`}>
              {titulo}
            </h2>
          </div>
          <button
            onClick={handleCancelar}
            disabled={cargando}
            className={`text-gray-400 hover:text-gray-600 ${cargando ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 relative">
          {/* Overlay de carga */}
          {cargando && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-lg transition-opacity">
              <div className="flex flex-col items-center gap-3">
                <Loader className={`w-8 h-8 animate-spin ${
                  tipoOperacion === 'congelamiento' ? 'text-blue-600' : 'text-orange-600'
                }`} />
                <span className="text-sm font-medium text-gray-700">
                  Configurando temporizador...
                </span>
              </div>
            </div>
          )}

          <p className="text-gray-600 mb-6">{descripcion}</p>

          {/* Selector de tiempo personalizado */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Tiempo personalizado:
            </label>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Horas</label>
                <input
                  type="number"
                  min="0"
                  max="24"
                  value={horas}
                  onChange={(e) => setHoras(Math.max(0, parseInt(e.target.value) || 0))}
                  disabled={cargando}
                  className={`w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    cargando ? 'cursor-not-allowed opacity-50 bg-gray-100' : ''
                  }`}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Minutos</label>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={minutos}
                  onChange={(e) => setMinutos(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                  disabled={cargando}
                  className={`w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    cargando ? 'cursor-not-allowed opacity-50 bg-gray-100' : ''
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Tiempo total */}
          <div className={`p-3 rounded-md mb-6 ${
            tipoOperacion === 'congelamiento' ? 'bg-blue-50' : 'bg-orange-50'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Tiempo total:</span>
              <span className={`text-lg font-bold ${
                tipoOperacion === 'congelamiento' ? 'text-blue-600' : 'text-orange-600'
              }`}>
                {horas > 0 && `${horas}h `}{minutos}min
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
          <button
            onClick={handleCancelar}
            className="px-4 py-2 text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={(horas * 60) + minutos === 0 || cargando}
            className={`px-4 py-2 text-white rounded-md flex items-center gap-2 transition-all ${
              (horas * 60) + minutos === 0 || cargando
                ? 'opacity-50 cursor-not-allowed bg-gray-400'
                : tipoOperacion === 'congelamiento'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-orange-600 hover:bg-orange-700'
            }`}
          >
            {cargando ? (
              <>
                <Loader size={16} className="animate-spin" />
                Configurando...
              </>
            ) : (
              <>
                <Play size={16} />
                Iniciar Temporizador
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TimerModal;
