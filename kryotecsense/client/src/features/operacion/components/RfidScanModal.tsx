import React from 'react';

interface RfidScanModalProps {
  mostrarModal: boolean;
  rfidInput: string;
  rfidsEscaneados: string[];
  onRfidInputChange: (value: string) => void;
  onEscanearRfid: () => void;
  onConfirmar: (rfids: string[], subEstado?: string) => Promise<boolean>;
  onCancelar: () => void;
  titulo?: string;
  descripcion?: string;
  onEliminarRfid?: (rfid: string) => void;
  subEstado?: string;
}

const RfidScanModal: React.FC<RfidScanModalProps> = ({
  mostrarModal,
  rfidInput,
  rfidsEscaneados,
  onRfidInputChange,
  onEscanearRfid,
  onConfirmar,
  onCancelar,
  titulo = 'Escanear TICs para Pre-acondicionamiento',
  descripcion = 'Escanea los TICs o ingresa los códigos manualmente y presiona Enter después de cada uno.',
  onEliminarRfid,
  subEstado = 'Congelación'
}) => {
  // Early return después de las props
  if (!mostrarModal) return null;

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      // Validar que el RFID sea válido (no vacío y solo contenga dígitos)
      if (rfidInput.trim() && /^\d+$/.test(rfidInput.trim())) {
        onEscanearRfid();
      } else if (rfidInput.trim()) {
        // Si hay texto pero no es válido, mostrar alerta
        alert('⚠️ RFID inválido. Solo se permiten dígitos.');
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-96 max-w-md">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
          {titulo}
        </h3>
        
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {descripcion}
        </p>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Escanear RFID (presiona Enter después de cada escaneo)
          </label>
          <input
            type="text"
            value={rfidInput}
            onChange={(e) => onRfidInputChange(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Escanea el RFID aquí..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
            autoFocus
          />
        </div>
        
        {rfidsEscaneados.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              TICs Escaneados ({rfidsEscaneados.length}):
            </h4>
            <div className="max-h-32 overflow-y-auto bg-gray-50 dark:bg-gray-700 rounded p-2">
              {rfidsEscaneados.map((rfid, index) => (
                <div key={index} className="flex justify-between items-center text-sm text-gray-600 dark:text-gray-400 py-1">
                  <span>{index + 1}. {rfid}</span>
                  {onEliminarRfid && (
                    <button 
                      onClick={() => onEliminarRfid(rfid)}
                      className="text-red-500 hover:text-red-700 text-xs"
                      title="Eliminar"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="flex justify-end space-x-2 mt-4">
          <button
            onClick={onCancelar}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirmar(rfidsEscaneados, subEstado)}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600"
            disabled={rfidsEscaneados.length === 0}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

export default RfidScanModal;
