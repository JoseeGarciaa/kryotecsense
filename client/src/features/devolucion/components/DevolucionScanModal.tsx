import React, { useState, useEffect, useRef } from 'react';
import { X, Scan, CheckCircle, AlertTriangle, Package } from 'lucide-react';

interface DevolucionScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemsPendientes: any[];
  onConfirmar: (itemsEscaneados: any[]) => Promise<void>;
}

export const DevolucionScanModal: React.FC<DevolucionScanModalProps> = ({
  isOpen,
  onClose,
  itemsPendientes,
  onConfirmar
}) => {
  const [codigoEscaneado, setCodigoEscaneado] = useState('');
  const [itemsEscaneados, setItemsEscaneados] = useState<any[]>([]);
  const [modoEscaneo, setModoEscaneo] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Enfocar input cuando se abre el modal
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Limpiar estado cuando se cierra el modal
  useEffect(() => {
    if (!isOpen) {
      setCodigoEscaneado('');
      setItemsEscaneados([]);
      setModoEscaneo(true);
      setProcesando(false);
      setError(null);
    }
  }, [isOpen]);

  const handleEscanearCodigo = (codigo: string) => {
    if (!codigo.trim()) return;

    setError(null);

    // Buscar item en la lista de pendientes
    const itemEncontrado = itemsPendientes.find(item => 
      item.rfid === codigo || 
      item.nombre_unidad.toLowerCase().includes(codigo.toLowerCase()) ||
      item.id.toString() === codigo
    );

    if (!itemEncontrado) {
      setError(`Item no encontrado: ${codigo}`);
      setCodigoEscaneado('');
      return;
    }

    // Verificar si ya fue escaneado
    const yaEscaneado = itemsEscaneados.find(item => item.id === itemEncontrado.id);
    if (yaEscaneado) {
      setError(`Item ya escaneado: ${itemEncontrado.nombre_unidad}`);
      setCodigoEscaneado('');
      return;
    }

    // Agregar item a la lista de escaneados
    setItemsEscaneados(prev => [...prev, itemEncontrado]);
    setCodigoEscaneado('');
    
    console.log(`✅ Item escaneado: ${itemEncontrado.nombre_unidad}`);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleEscanearCodigo(codigoEscaneado);
    }
  };

  const handleRemoverItem = (index: number) => {
    setItemsEscaneados(prev => prev.filter((_, i) => i !== index));
    setError(null);
  };

  const handleConfirmar = async () => {
    if (itemsEscaneados.length === 0) {
      setError('Debe escanear al menos un item');
      return;
    }

    try {
      setProcesando(true);
      setError(null);
      
      await onConfirmar(itemsEscaneados);
      onClose();
    } catch (error) {
      console.error('Error confirmando devolución:', error);
      setError('Error al procesar la devolución');
    } finally {
      setProcesando(false);
    }
  };

  const handleEscanearTodos = () => {
    setItemsEscaneados([...itemsPendientes]);
    setError(null);
    console.log(`✅ Todos los items agregados: ${itemsPendientes.length}`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-lg shadow-xl w-[92vw] max-w-md sm:max-w-2xl md:max-w-3xl max-h-[88vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-blue-50 border-b border-blue-200 px-3 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-start sm:items-center gap-2 sm:gap-3">
            <Scan className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 flex-shrink-0" />
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-blue-900">Escanear Items para Devolución</h2>
              <p className="text-xs sm:text-sm text-blue-600">Escanee los items que desea marcar como devueltos</p>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Cerrar modal"
            aria-label="Cerrar"
            className="text-gray-400 hover:text-gray-600 self-end sm:self-auto"
          >
            <X className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        </div>

        <div className="p-3 sm:p-6 overflow-y-auto flex-1">
          {/* Input de escaneo */}
          <div className="mb-4 sm:mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
              <label className="text-sm font-medium text-gray-700">Código RFID o Nombre del Item:</label>
              <div>
                <button
                  onClick={() => setModoEscaneo(!modoEscaneo)}
                  title={modoEscaneo ? 'Detener escaneo' : 'Iniciar escaneo'}
                  className="inline-flex items-center justify-center px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
                >
                  <Scan className="h-4 w-4 mr-2" />
                  {modoEscaneo ? 'Escanear' : 'Pausado'}
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <input
                ref={inputRef}
                type="text"
                value={codigoEscaneado}
                onChange={(e) => setCodigoEscaneado(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Escanee o escriba el código del item..."
                className="w-full sm:flex-1 px-3 sm:px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                disabled={procesando}
              />
              <button
                onClick={() => handleEscanearCodigo(codigoEscaneado)}
                disabled={!codigoEscaneado.trim() || procesando}
                className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                Agregar
              </button>
            </div>

            {/* Botón para escanear todos */}
            <div className="mt-3">
              <button
                onClick={handleEscanearTodos}
                disabled={procesando}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
              >
                <Package className="h-4 w-4" />
                <span>Agregar todos los pendientes ({itemsPendientes.length})</span>
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
              <span className="text-red-800 text-sm">{error}</span>
            </div>
          )}

          {/* Lista de items escaneados */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-2 sm:mb-3">
              Items Escaneados ({itemsEscaneados.length})
            </h3>
            
            {itemsEscaneados.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Scan className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-50" />
                <p>No hay items escaneados</p>
                <p className="text-xs sm:text-sm">Use la pistola RFID o escriba el código manualmente</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {itemsEscaneados.map((item, index) => (
                  <div key={`${item.id}-${index}`} className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-md">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="font-medium text-gray-900">{item.nombre_unidad}</span>
                      <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs">
                        {item.categoria}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemoverItem(index)}
                      title="Remover item"
                      className="text-gray-400 hover:text-red-600 p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-3 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-t gap-2">
          <div className="text-xs sm:text-sm text-gray-600">
            {itemsEscaneados.length} de {itemsPendientes.length} items escaneados
          </div>
          <div className="flex gap-2 sm:gap-3">
            <button
              onClick={onClose}
              disabled={procesando}
              className="px-3 sm:px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmar}
              disabled={itemsEscaneados.length === 0 || procesando}
              className="w-full sm:w-auto px-4 sm:px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {procesando ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Procesando...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" />
                  <span>Confirmar</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
