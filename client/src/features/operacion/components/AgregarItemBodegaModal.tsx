import React, { useState, useEffect } from 'react';
import { X, Package, Search, Loader } from 'lucide-react';

interface AgregarItemBodegaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (itemsSeleccionados: any[]) => void;
  inventarioCompleto: any[];
}

const AgregarItemBodegaModal: React.FC<AgregarItemBodegaModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  inventarioCompleto
}) => {
  const [busqueda, setBusqueda] = useState('');
  const [itemsSeleccionados, setItemsSeleccionados] = useState<any[]>([]);
  const [filtroCategoria, setFiltroCategoria] = useState('TODOS');
  const [cargandoMovimiento, setCargandoMovimiento] = useState(false);

  // Filtrar items que NO están en bodega (solo mostrar items en otras fases)
  const itemsDisponibles = inventarioCompleto?.filter(item => 
    item.estado !== 'En bodega'
  ) || [];

  // Aplicar filtros de búsqueda y categoría
  const itemsFiltrados = itemsDisponibles.filter(item => {
    const coincideBusqueda = !busqueda || 
      item.nombre_unidad?.toLowerCase().includes(busqueda.toLowerCase()) ||
      item.rfid?.toLowerCase().includes(busqueda.toLowerCase()) ||
      item.lote?.toLowerCase().includes(busqueda.toLowerCase());

    const coincideCategoria = filtroCategoria === 'TODOS' || 
      item.categoria?.toUpperCase() === filtroCategoria.toUpperCase() ||
      item.nombre_unidad?.toUpperCase().includes(filtroCategoria.toUpperCase());

    return coincideBusqueda && coincideCategoria;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (itemsSeleccionados.length === 0) {
      alert('⚠️ Selecciona al menos un item para mover a bodega');
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
      console.error('Error en movimiento a bodega:', error);
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

  // Early return después de todos los hooks
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
                Moviendo items a bodega...
              </p>
              <p className="text-sm text-gray-600">
                Procesando {itemsSeleccionados.length} item(s)
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Package className="text-blue-600" size={20} />
            <h3 className="text-lg font-semibold text-gray-800">
              Mover Items a Bodega
            </h3>
            <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded-full text-sm font-medium">
              {itemsDisponibles.length} en otras fases
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col h-full max-h-[calc(90vh-80px)]">
          {/* Filtros */}
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <div className="flex flex-wrap gap-4 items-center">
              {/* Búsqueda */}
              <div className="flex-1 min-w-64">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="text"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar por nombre, RFID o lote..."
                    maxLength={24}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Filtro de categoría */}
              <div>
                <select
                  value={filtroCategoria}
                  onChange={(e) => setFiltroCategoria(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="TODOS">Todas las categorías</option>
                  <option value="TIC">TICs</option>
                  <option value="VIP">VIPs</option>
                  <option value="Cube">Cubes</option>
                </select>
              </div>

              {/* Controles de selección */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={seleccionarTodos}
                  className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
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
              </div>
            </div>

            {itemsSeleccionados.length > 0 && (
              <div className="mt-2 text-sm text-green-600">
                ✓ {itemsSeleccionados.length} item(s) seleccionado(s)
              </div>
            )}
          </div>

          {/* Lista de items */}
          <div className="flex-1 overflow-y-auto p-4">
            {itemsFiltrados.length === 0 ? (
              <div className="text-center py-12">
                <Package className="mx-auto text-gray-400 mb-4" size={48} />
                <h3 className="text-lg font-medium text-gray-600 mb-2">
                  No hay items para mover a bodega
                </h3>
                <p className="text-gray-500">
                  {itemsDisponibles.length === 0 
                    ? 'Todos los items ya están en bodega'
                    : 'No se encontraron items con los filtros aplicados'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {itemsFiltrados.map((item) => {
                  const estaSeleccionado = itemsSeleccionados.find(selected => selected.id === item.id);
                  
                  return (
                    <div
                      key={item.id}
                      onClick={() => toggleSeleccion(item)}
                      className={`p-3 border rounded-lg cursor-pointer transition-all ${
                        estaSeleccionado
                          ? 'border-blue-500 bg-blue-50 shadow-md'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                          item.categoria?.toUpperCase() === 'TIC' || item.nombre_unidad?.toUpperCase().includes('TIC') ? 'bg-blue-100 text-blue-700' :
                          item.categoria?.toUpperCase() === 'VIP' || item.nombre_unidad?.toUpperCase().includes('VIP') ? 'bg-purple-100 text-purple-700' :
                          item.categoria?.toUpperCase() === 'CAJA' || item.nombre_unidad?.toUpperCase().includes('CAJA') ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {item.categoria || 
                           (item.nombre_unidad?.toUpperCase().includes('TIC') ? 'TIC' :
                            item.nombre_unidad?.toUpperCase().includes('VIP') ? 'VIP' :
                            item.nombre_unidad?.toUpperCase().includes('CAJA') ? 'CAJA' : 'ITEM')}
                        </span>
                        
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                          estaSeleccionado ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                        }`}>
                          {estaSeleccionado && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      </div>
                      
                      <h4 className="font-medium text-gray-800 mb-1">
                        {item.nombre_unidad}
                      </h4>
                      
                      <div className="text-sm text-gray-600 space-y-1">
                        <div>RFID: <span className="font-mono">{item.rfid}</span></div>
                        {item.lote && <div>Lote: {item.lote}</div>}
                        <div>Estado: <span className="font-medium">{item.estado}</span></div>
                        {item.sub_estado && <div>Sub-estado: {item.sub_estado}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Botones */}
          <div className="flex gap-2 p-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={itemsSeleccionados.length === 0 || cargandoMovimiento}
              className="flex-1 px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-md transition-colors flex items-center justify-center gap-2"
            >
              {cargandoMovimiento ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Moviendo...
                </>
              ) : (
                `Mover a Bodega (${itemsSeleccionados.length})`
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AgregarItemBodegaModal;
