import React, { useState, useEffect } from 'react';
import { X, Scan, CheckCircle, AlertCircle, Clock } from 'lucide-react';

interface InspeccionScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanItem: (item: any) => void;
  itemsDisponibles: any[];
  itemsEscaneados?: any[];
  procesandoEscaneos?: boolean;
}

export const InspeccionScanModal: React.FC<InspeccionScanModalProps> = ({
  isOpen,
  onClose,
  onScanItem,
  itemsDisponibles,
  itemsEscaneados = [],
  procesandoEscaneos = false
}) => {
  const [rfidInput, setRfidInput] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [tipoMensaje, setTipoMensaje] = useState<'success' | 'error' | ''>('');
  const [modoEscaneoMasivo, setModoEscaneoMasivo] = useState(true);
  
  // Validación de longitud exacta 24 caracteres
  const rfidSanitizado = rfidInput.trim();
  const longitud = rfidSanitizado.length;
  const rfidValido24 = longitud === 24;

  useEffect(() => {
    if (isOpen) {
      // Limpiar estado al abrir el modal
      setRfidInput('');
      setMensaje('');
      setTipoMensaje('');
      
      // Focus en el input después de un pequeño delay
      setTimeout(() => {
        const input = document.getElementById('rfid-input');
        if (input) {
          input.focus();
        }
      }, 100);
    }
  }, [isOpen]);

  // Actualizar barra de progreso
  useEffect(() => {
    const progressBar = document.querySelector('.progress-bar');
    if (progressBar && itemsDisponibles.length > 0) {
      const percentage = (itemsEscaneados.length / itemsDisponibles.length) * 100;
      (progressBar as HTMLElement).style.width = `${percentage}%`;
    }
  }, [itemsEscaneados.length, itemsDisponibles.length]);

  const handleScan = () => {
    if (!rfidSanitizado) {
      setMensaje('Por favor ingresa un código RFID');
      setTipoMensaje('error');
      return;
    }
    if (!rfidValido24) {
      setMensaje('El código RFID debe tener exactamente 24 caracteres');
      setTipoMensaje('error');
      return;
    }

    // Buscar el item por RFID (coincidencia exacta)
    const itemEncontrado = itemsDisponibles.find(item => item.rfid === rfidSanitizado);

    if (itemEncontrado) {
      // Verificar si ya fue escaneado
      const yaEscaneado = itemsEscaneados.some(item => item.id === itemEncontrado.id);
      
      if (yaEscaneado) {
        setMensaje(`⚠️ Item ${itemEncontrado.nombre_unidad} ya fue escaneado`);
        setTipoMensaje('error');
      } else {
        setMensaje(`✅ Item encontrado: ${itemEncontrado.nombre_unidad}`);
        setTipoMensaje('success');
        
        // Llamar a la función de callback
        onScanItem(itemEncontrado);
      }
      
      // Limpiar input para siguiente escaneo
      setRfidInput('');
      
      // En modo masivo, no cerrar el modal
      if (!modoEscaneoMasivo) {
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        // Limpiar mensaje después de un momento
        setTimeout(() => {
          setMensaje('');
          setTipoMensaje('');
        }, 2000);
      }
    } else {
  setMensaje('❌ Item no encontrado o no disponible para inspección');
      setTipoMensaje('error');
      
      // Limpiar mensaje de error después de un momento
      setTimeout(() => {
        setMensaje('');
        setTipoMensaje('');
      }, 2000);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (rfidValido24) {
        handleScan();
      } else {
        setMensaje('El código RFID debe tener exactamente 24 caracteres');
        setTipoMensaje('error');
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">Escanear Item para Inspección</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="Cerrar modal de escaneo"
            aria-label="Cerrar modal de escaneo"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="mb-4">
            <label htmlFor="rfid-input" className="block text-sm font-medium text-gray-700 mb-2">
              Código RFID (24 caracteres)
            </label>
            <input
              id="rfid-input"
              type="text"
              value={rfidInput}
              onChange={(e) => setRfidInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Escanea el código RFID (24 caracteres)..."
              maxLength={24}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:border-transparent ${
                longitud === 0
                  ? 'border-gray-300 focus:ring-blue-500'
                  : rfidValido24
                    ? 'border-green-300 focus:ring-green-500'
                    : 'border-red-300 focus:ring-red-500'
              }`}
              autoComplete="off"
            />
            <div className="mt-1 text-xs">
              {longitud === 0 ? (
                <span className="text-gray-500">Debe tener exactamente 24 caracteres</span>
              ) : (
                <span className={rfidValido24 ? 'text-green-600' : longitud < 24 ? 'text-gray-600' : 'text-red-600'}>
                  {Math.min(longitud, 24)}/24 {longitud > 24 ? '(excede el límite)' : ''}
                </span>
              )}
            </div>
          </div>

          {/* Mensaje de resultado */}
          {mensaje && (
            <div className={`mb-4 p-3 rounded-md flex items-center gap-2 ${
              tipoMensaje === 'success' 
                ? 'bg-green-50 text-green-800 border border-green-200' 
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {tipoMensaje === 'success' ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <AlertCircle className="w-5 h-5" />
              )}
              <span className="text-sm">{mensaje}</span>
            </div>
          )}

          {/* Estadísticas de escaneo masivo */}
          <div className="mb-6 space-y-3">
            <div className="p-3 bg-blue-50 rounded-md">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-blue-800">
                  Escaneo Masivo Activo
                </p>
                {procesandoEscaneos && (
                  <div className="flex items-center gap-1 text-orange-600">
                    <Clock className="w-4 h-4 animate-spin" />
                    <span className="text-xs">Procesando...</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="text-center p-2 bg-white rounded border">
                  <div className="font-semibold text-blue-600">{itemsDisponibles.length}</div>
                  <div className="text-gray-600">Disponibles</div>
                </div>
                <div className="text-center p-2 bg-white rounded border">
                  <div className="font-semibold text-green-600">{itemsEscaneados.length}</div>
                  <div className="text-gray-600">Escaneados</div>
                </div>
                <div className="text-center p-2 bg-white rounded border">
                  <div className="font-semibold text-gray-600">{itemsDisponibles.length - itemsEscaneados.length}</div>
                  <div className="text-gray-600">Pendientes</div>
                </div>
              </div>
            </div>
            
            {/* Progreso visual */}
            {itemsDisponibles.length > 0 && (
              <div className="p-2 bg-gray-50 rounded-md">
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>Progreso</span>
                  <span>{Math.round((itemsEscaneados.length / itemsDisponibles.length) * 100)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full transition-all duration-300 progress-bar"></div>
                </div>
              </div>
            )}
          </div>

          {/* Botones */}
          <div className="flex gap-3">
            <button
              onClick={handleScan}
              disabled={!rfidValido24 || procesandoEscaneos}
              title={!rfidValido24 ? 'El RFID debe tener 24 caracteres' : undefined}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <Scan className="w-4 h-4" />
              Escanear
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
