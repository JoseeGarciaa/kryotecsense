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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-blue-50 border-b border-blue-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Scan className="h-6 w-6 text-blue-600" />
            <div>
              <h2 className="text-lg font-semibold text-blue-900">Escanear Items para Devolución</h2>
              <p className="text-sm text-blue-600">Escanee los items que desea marcar como devueltos</p>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Cerrar modal"
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Input de escaneo */}
          <div className="mb-6">
            <div className="flex items-center space-x-3 mb-3">
              <label className="text-sm font-medium text-gray-700">
                Código RFID o Nombre del Item:
              </label>
              <button
                onClick={() => setModoEscaneo(!modoEscaneo)}
                title={modoEscaneo ? 'Detener escaneo' : 'Iniciar escaneo'}
                className="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                <Scan className="h-5 w-5" />
              </button>
            </div>
            
            <div className="flex space-x-3">
              <input
                ref={inputRef}
                type="text"
                value={codigoEscaneado}
                onChange={(e) => setCodigoEscaneado(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Escanee o escriba el código del item..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={procesando}
              />
              <button
                onClick={() => handleEscanearCodigo(codigoEscaneado)}
                disabled={!codigoEscaneado.trim() || procesando}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Agregar
              </button>
            </div>

            {/* Botón para escanear todos */}
            <div className="mt-3">
              <button
                onClick={handleEscanearTodos}
                disabled={procesando}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                <Package className="h-4 w-4" />
                <span>Agregar Todos los Items Pendientes ({itemsPendientes.length})</span>
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
              <span className="text-red-800 text-sm">{error}</span>
            </div>
          )}

          {/* Lista de items escaneados */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              Items Escaneados ({itemsEscaneados.length})
            </h3>
            
            {itemsEscaneados.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Scan className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No hay items escaneados</p>
                <p className="text-sm">Use la pistola RFID o escriba el código manualmente</p>
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
        <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t">
          <div className="text-sm text-gray-600">
            {itemsEscaneados.length} de {itemsPendientes.length} items escaneados
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              disabled={procesando}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmar}
              disabled={itemsEscaneados.length === 0 || procesando}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {procesando ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Procesando...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" />
                  <span>Confirmar Devolución</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
