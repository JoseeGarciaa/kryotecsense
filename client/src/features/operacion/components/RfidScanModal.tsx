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
  onProcesarRfidIndividual?: (rfid: string) => void; // Nueva prop para procesar RFID individual
}

const RfidScanModal: React.FC<RfidScanModalProps> = ({
  mostrarModal,
  rfidInput,
  rfidsEscaneados,
  onRfidInputChange,
  onEscanearRfid,
  onConfirmar,
  onCancelar,
  titulo = 'Escanear TICs para Congelamiento',
  descripcion = '⚠️ IMPORTANTE: Solo se permiten TICs en Pre acondicionamiento. Los VIPs y CUBEs serán rechazados automáticamente.',
  onEliminarRfid,
  subEstado = 'Congelamiento',
  onProcesarRfidIndividual
}) => {
  // Early return después de las props
  if (!mostrarModal) return null;

  // Manejar cambio en el input con auto-procesamiento a 24 caracteres
  const handleRfidChange = (value: string) => {
    onRfidInputChange(value);
    
    // Auto-procesar cada 24 caracteres
    if (value.length > 0 && value.length % 24 === 0) {
      // Extraer códigos de 24 caracteres
      const codigosCompletos = [];
      for (let i = 0; i < value.length; i += 24) {
        const codigo = value.substring(i, i + 24);
        if (codigo.length === 24) {
          codigosCompletos.push(codigo);
        }
      }
      
      // Procesar cada código usando la función del padre
      codigosCompletos.forEach(codigo => {
        if (onProcesarRfidIndividual) {
          onProcesarRfidIndividual(codigo);
        }
      });
      
      // Limpiar el input después de procesar
      onRfidInputChange('');
      
      if (codigosCompletos.length > 0) {
        console.log(`🔄 Auto-procesados ${codigosCompletos.length} códigos de 24 caracteres`);
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const trimmed = rfidInput.trim();
      // Validar que el RFID sea exactamente 24 caracteres y alfanumérico
      if (trimmed) {
        if (trimmed.length !== 24) {
          alert('⚠️ Cada RFID debe tener exactamente 24 caracteres.');
          return;
        }
        if (!/^[a-zA-Z0-9]+$/.test(trimmed)) {
          alert('⚠️ RFID inválido. Solo se permiten dígitos y letras.');
          return;
        }
        onEscanearRfid();
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
            Escanear RFID (exactamente 24 caracteres; auto-procesa múltiples escaneos)
          </label>
          <input
            type="text"
            value={rfidInput}
            onChange={(e) => handleRfidChange(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Escanea RFIDs de 24 caracteres (auto-procesa en bloques de 24)..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
            maxLength={24}
            autoFocus
            autoComplete="off"
          />
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 space-y-1">
            <p>
              Escaneados: <span className="font-medium text-green-600">{rfidsEscaneados.length}</span> TICs
            </p>
            <p className="text-blue-600">
              🚀 Auto-procesamiento: se procesan automáticamente los bloques completos de 24 caracteres
            </p>
            <p className="text-orange-600">
              ⚠️ Solo TICs: Se filtran automáticamente VIPs y Cajas
            </p>
          </div>
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
            Confirmar ({rfidsEscaneados.length} TICs)
          </button>
        </div>
      </div>
    </div>
  );
};

export default RfidScanModal;
