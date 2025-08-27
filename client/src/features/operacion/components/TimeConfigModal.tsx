import React, { useState } from 'react';
import { X, Clock } from 'lucide-react';

interface TimeConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (horas: number, minutos: number) => void;
  itemName?: string;
}

const TimeConfigModal: React.FC<TimeConfigModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  itemName = 'TIC'
}) => {
  const [horas, setHoras] = useState(0);
  const [minutos, setMinutos] = useState(30);

  const handleConfirm = () => {
    if (horas === 0 && minutos === 0) {
      alert('⚠️ Debe configurar al menos 1 minuto');
      return;
    }
    onConfirm(horas, minutos);
    onClose();
    // Resetear valores
    setHoras(0);
    setMinutos(30);
  };

  const handleCancel = () => {
    onClose();
    // Resetear valores
    setHoras(0);
    setMinutos(30);
  };

  // Early return después de todos los hooks
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-96 max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-orange-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Configurar Cronómetro
            </h3>
          </div>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            title="Cerrar modal"
            aria-label="Cerrar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="mb-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Configurar tiempo de pre-acondicionamiento para: <span className="font-semibold">{itemName}</span>
          </p>

          {/* Time Inputs */}
          <div className="grid grid-cols-2 gap-4">
            {/* Horas */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Horas
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="48"
                  value={horas}
                  onChange={(e) => setHoras(Math.max(0, Math.min(48, parseInt(e.target.value) || 0)))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                           focus:ring-2 focus:ring-orange-500 focus:border-orange-500
                           text-center text-lg font-mono"
                  title="Configurar horas"
                  placeholder="0"
                  aria-label="Horas para el cronómetro"
                />
                <span className="absolute right-3 top-2 text-sm text-gray-500 dark:text-gray-400">h</span>
              </div>
            </div>

            {/* Minutos */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Minutos
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={minutos}
                  onChange={(e) => setMinutos(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                           focus:ring-2 focus:ring-orange-500 focus:border-orange-500
                           text-center text-lg font-mono"
                  title="Configurar minutos"
                  placeholder="30"
                  aria-label="Minutos para el cronómetro"
                />
                <span className="absolute right-3 top-2 text-sm text-gray-500 dark:text-gray-400">m</span>
              </div>
            </div>
          </div>

          {/* Quick Presets */}
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Presets comunes:
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setHoras(0); setMinutos(30); }}
                className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 
                         rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                30 min
              </button>
              <button
                onClick={() => { setHoras(1); setMinutos(0); }}
                className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 
                         rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                1 hora
              </button>
              <button
                onClick={() => { setHoras(2); setMinutos(0); }}
                className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 
                         rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                2 horas
              </button>
              <button
                onClick={() => { setHoras(4); setMinutos(0); }}
                className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 
                         rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                4 horas
              </button>
            </div>
          </div>

          {/* Preview */}
          <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-md">
            <p className="text-sm text-orange-800 dark:text-orange-200">
              <Clock className="inline h-4 w-4 mr-1" />
              Tiempo configurado: <span className="font-semibold">
                {horas > 0 ? `${horas}h ` : ''}{minutos}m
              </span>
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleCancel}
            className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 
                     rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 
                     transition-colors font-medium"
          >
            Iniciar Cronómetro
          </button>
        </div>
      </div>
    </div>
  );
};

export default TimeConfigModal;
