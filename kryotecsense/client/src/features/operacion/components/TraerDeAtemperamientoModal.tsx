import React, { useState, useEffect } from 'react';
import { X, Package, Search, Loader } from 'lucide-react';

interface TraerDeAtemperamientoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (itemsSeleccionados: any[]) => void;
  inventarioCompleto: any[];
}

const TraerDeAtemperamientoModal: React.FC<TraerDeAtemperamientoModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  inventarioCompleto
}) => {
  const [busqueda, setBusqueda] = useState('');
  const [itemsSeleccionados, setItemsSeleccionados] = useState<any[]>([]);
  const [filtroCategoria, setFiltroCategoria] = useState('TODOS');
  const [cargandoMovimiento, setCargandoMovimiento] = useState(false);

  // Filtrar items que están en atemperamiento con sub_estado "Atemperado"
  const itemsEnAtemperamiento = inventarioCompleto?.filter(item => 
    item.estado === 'Atemperamiento' && item.sub_estado === 'Atemperado'
  ) || [];

  // Aplicar filtros de búsqueda y categoría
  const itemsFiltrados = itemsEnAtemperamiento.filter(item => {
    const coincideBusqueda = !busqueda || 
  (typeof item.nombre_unidad === 'string' && item.nombre_unidad.toLowerCase().includes(busqueda.toLowerCase())) ||
  (typeof item.rfid === 'string' && item.rfid.toLowerCase().includes(busqueda.toLowerCase())) ||
  (typeof item.lote === 'string' && item.lote.toLowerCase().includes(busqueda.toLowerCase()));

    const coincideCategoria = filtroCategoria === 'TODOS' || 
      item.categoria?.toUpperCase() === filtroCategoria ||
  (typeof item.nombre_unidad === 'string' && item.nombre_unidad.toUpperCase().includes(filtroCategoria));

    return coincideBusqueda && coincideCategoria;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (itemsSeleccionados.length === 0) {
      alert('⚠️ Selecciona al menos un item para traer a acondicionamiento');
      return;
    }

    setCargandoMovimiento(true);
    
    try {
      await onConfirm(itemsSeleccionados);
      
      // Limpiar selección solo si fue exitoso
      setItemsSeleccionados([]);
      setBusqueda('');
      setFiltroCategoria('TODOS');
    } catch (error) {
      console.error('Error moviendo items a acondicionamiento:', error);
    } finally {
      setCargandoMovimiento(false);
    }
  };

  const toggleSeleccion = (item: any) => {
    const yaSeleccionado = itemsSeleccionados.find(selected => selected.id === item.id);
    
    if (yaSeleccionado) {
      setItemsSeleccionados(itemsSeleccionados.filter(selected => selected.id !== item.id));
    } else {
      setItemsSeleccionados([...itemsSeleccionados, item]);
    }
  };

  const seleccionarTodos = () => {
    setItemsSeleccionados(itemsFiltrados);
  };

  const limpiarSeleccion = () => {
    setItemsSeleccionados([]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden relative">
        {/* Overlay de carga */}
        {cargandoMovimiento && (
          <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center z-10">
            <div className="text-center">
              <Loader className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
              <p className="text-lg font-semibold text-gray-800 mb-2">
                Moviendo items a acondicionamiento...
              </p>
              <p className="text-sm text-gray-600">
                Procesando {itemsSeleccionados.length} item(s)
              </p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <Package className="w-6 h-6 text-green-600" />
            <h2 className="text-xl font-semibold text-gray-800">
              Traer Items de Atemperamiento a Acondicionamiento
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Controles */}
        <div className="p-6 border-b bg-gray-50">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Búsqueda */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Buscar por nombre, RFID o lote..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Filtro por categoría */}
            <div className="sm:w-48">
              <select
                value={filtroCategoria}
                onChange={(e) => setFiltroCategoria(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="TODOS">Todas las categorías</option>
                <option value="TIC">TIC</option>
                <option value="VIP">VIP</option>
                <option value="Cube">Cube</option>
              </select>
            </div>
          </div>

          {/* Controles de selección */}
          <div className="mt-4 flex items-center gap-4">
            <button
              type="button"
              onClick={seleccionarTodos}
              className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
            >
              Seleccionar todos ({itemsFiltrados.length})
            </button>
            <button
              type="button"
              onClick={limpiarSeleccion}
              className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
            >
              Limpiar selección
            </button>
            <span className="text-sm text-gray-600">
              {itemsSeleccionados.length} seleccionado(s)
            </span>
          </div>
        </div>

        {/* Lista de items */}
        <div className="flex-1 overflow-y-auto p-6" style={{ maxHeight: '400px' }}>
          {itemsFiltrados.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">
                {itemsEnAtemperamiento.length === 0 
                  ? 'No hay items atemperados disponibles' 
                  : 'No se encontraron items con los filtros aplicados'
                }
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {itemsFiltrados.map((item) => {
                const isSelected = itemsSeleccionados.find(selected => selected.id === item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleSeleccion(item)}
                    className={`
                      border rounded-lg p-4 cursor-pointer transition-all
                      ${isSelected 
                        ? 'border-green-500 bg-green-50 shadow-md' 
                        : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                      }
                    `}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <div className={`
                            w-4 h-4 border-2 rounded transition-all
                            ${isSelected 
                              ? 'bg-green-500 border-green-500' 
                              : 'border-gray-300'
                            }
                          `}>
                            {isSelected && (
                              <div className="w-full h-full flex items-center justify-center">
                                <div className="w-2 h-2 bg-white rounded-full"></div>
                              </div>
                            )}
                          </div>
                          <span className={`
                            inline-block px-2 py-1 text-xs font-medium rounded
                            ${item.categoria === 'TIC' ? 'bg-green-100 text-green-800' :
                              item.categoria === 'VIP' ? 'bg-purple-100 text-purple-800' :
                              item.categoria === 'CAJA' ? 'bg-orange-100 text-orange-800' :
                              'bg-gray-100 text-gray-800'
                            }
                          `}>
                            {item.categoria || 'N/A'}
                          </span>
                          <span className="font-semibold text-gray-900">
                            {item.nombre_unidad}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
                          <span>RFID: {item.rfid}</span>
                          {item.lote && <span>Lote: {item.lote}</span>}
                          <span className="text-green-600">Estado: {item.estado}</span>
                          <span className="text-blue-600">Sub-estado: {item.sub_estado}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {itemsSeleccionados.length > 0 && (
              <span>
                {itemsSeleccionados.length} item(s) seleccionado(s) para mover a acondicionamiento
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={cargandoMovimiento}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={itemsSeleccionados.length === 0 || cargandoMovimiento}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cargandoMovimiento ? (
                <>
                  <Loader className="w-4 h-4 animate-spin inline mr-2" />
                  Procesando...
                </>
              ) : (
                `Traer a Acondicionamiento (${itemsSeleccionados.length})`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TraerDeAtemperamientoModal;
