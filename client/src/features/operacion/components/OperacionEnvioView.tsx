import React, { useState, useEffect } from 'react';
import { Clock, Package, CheckCircle, Play, Pause } from 'lucide-react';
import { useEnvio } from '../hooks/useEnvio';
import { useTimerContext } from '../../../contexts/TimerContext';

interface OperacionEnvioViewProps {
  itemsListosParaEnvio: any[];
  onVolverAtras: () => void;
  onActualizarDatos: () => void;
}

const OperacionEnvioView: React.FC<OperacionEnvioViewProps> = ({
  itemsListosParaEnvio,
  onVolverAtras,
  onActualizarDatos
}) => {
  const {
    itemsEnEnvio,
    cargandoEnvio,
    iniciarEnvio,
    completarEnvio,
    cancelarEnvio,
    obtenerTiempoRestanteEnvio,
    obtenerEstadisticasEnvio
  } = useEnvio();

  const { timers, formatearTiempo } = useTimerContext();

  const [itemsSeleccionados, setItemsSeleccionados] = useState<number[]>([]);
  const [tiempoEnvioPersonalizado, setTiempoEnvioPersonalizado] = useState(120); // 2 horas por defecto
  const [mostrarModalEnvio, setMostrarModalEnvio] = useState(false);

  const estadisticas = obtenerEstadisticasEnvio();

  // Manejar selección de items
  const toggleSeleccionItem = (itemId: number) => {
    setItemsSeleccionados(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const seleccionarTodos = () => {
    const todosIds = itemsListosParaEnvio.map(item => item.id);
    setItemsSeleccionados(todosIds);
  };

  const limpiarSeleccion = () => {
    setItemsSeleccionados([]);
  };

  // Manejar inicio de envío
  const manejarIniciarEnvio = async () => {
    if (itemsSeleccionados.length === 0) {
      alert('⚠️ Selecciona al menos un item para enviar');
      return;
    }

    try {
      const itemsParaEnviar = itemsListosParaEnvio.filter(item => 
        itemsSeleccionados.includes(item.id)
      );

      await iniciarEnvio(itemsParaEnviar, tiempoEnvioPersonalizado);
      
      // Limpiar selección y cerrar modal
      setItemsSeleccionados([]);
      setMostrarModalEnvio(false);
      
      // Actualizar datos
      onActualizarDatos();
      
      alert(`✅ Envío iniciado para ${itemsParaEnviar.length} items`);
      
    } catch (error: any) {
      alert(`❌ Error iniciando envío: ${error.message}`);
    }
  };

  // Manejar completar envío
  const manejarCompletarEnvio = async (itemId: number) => {
    try {
      await completarEnvio(itemId);
      onActualizarDatos();
      alert('✅ Envío completado exitosamente');
    } catch (error: any) {
      alert(`❌ Error completando envío: ${error.message}`);
    }
  };

  // Manejar cancelar envío
  const manejarCancelarEnvio = async (itemId: number) => {
    const motivo = prompt('Motivo de cancelación:') || 'Cancelado por usuario';
    
    try {
      await cancelarEnvio(itemId, motivo);
      onActualizarDatos();
      alert('🚫 Envío cancelado');
    } catch (error: any) {
      alert(`❌ Error cancelando envío: ${error.message}`);
    }
  };

  // Obtener timer activo para un item
  const obtenerTimerItem = (itemId: number) => {
    const item = itemsEnEnvio.find(i => i.id === itemId);
    if (!item?.timerId) return null;
    
    return timers.find(t => t.id === item.timerId);
  };

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onVolverAtras}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Volver atrás"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Operación - Centro de Envíos
            </h2>
            <p className="text-gray-600">Gestiona el envío y seguimiento de credocubes</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-600">
            <span className="font-medium">En tránsito:</span> {estadisticas.enTransito} |{' '}
            <span className="font-medium">Entregados:</span> {estadisticas.entregados}
          </div>
        </div>
      </div>

      {/* Estadísticas rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <div className="flex items-center gap-2">
            <Package className="text-blue-600" size={20} />
            <div>
              <p className="text-sm text-blue-600 font-medium">Listos para Envío</p>
              <p className="text-2xl font-bold text-blue-800">{itemsListosParaEnvio.length}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <div>
              <p className="text-sm text-orange-600 font-medium">En Tránsito</p>
              <p className="text-2xl font-bold text-orange-800">{estadisticas.enTransito}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <div className="flex items-center gap-2">
            <CheckCircle className="text-green-600" size={20} />
            <div>
              <p className="text-sm text-green-600 font-medium">Entregados</p>
              <p className="text-2xl font-bold text-green-800">{estadisticas.entregados}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
          <div className="flex items-center gap-2">
            <Clock className="text-purple-600" size={20} />
            <div>
              <p className="text-sm text-purple-600 font-medium">Tiempo Promedio</p>
              <p className="text-2xl font-bold text-purple-800">
                {Math.round(estadisticas.tiempoPromedioEnvio)}m
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Sección: Items listos para envío */}
      {itemsListosParaEnvio.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="bg-blue-50 px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Package className="text-blue-600" size={20} />
                Items Listos para Envío ({itemsListosParaEnvio.length})
              </h3>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={seleccionarTodos}
                  className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                >
                  Seleccionar Todos
                </button>
                <button
                  onClick={limpiarSeleccion}
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                >
                  Limpiar
                </button>
                <button
                  onClick={() => setMostrarModalEnvio(true)}
                  disabled={itemsSeleccionados.length === 0 || cargandoEnvio}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Iniciar Envío ({itemsSeleccionados.length})
                </button>
              </div>
            </div>
          </div>
          
          <div className="divide-y divide-gray-200">
            {itemsListosParaEnvio.map(item => (
              <div key={item.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={itemsSeleccionados.includes(item.id)}
                      onChange={() => toggleSeleccionItem(item.id)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      title={`Seleccionar ${item.nombre_unidad}`}
                      aria-label={`Seleccionar ${item.nombre_unidad} para envío`}
                    />
                    <div>
                      <p className="font-medium text-gray-900">{item.nombre_unidad}</p>
                      <p className="text-sm text-gray-600">
                        RFID: {item.rfid} | Lote: {item.lote || 'Sin lote'} | 
                        Categoría: {item.categoria || 'credocube'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                      {item.sub_estado || 'Listo'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sección: Items en envío */}
      {itemsEnEnvio.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="bg-orange-50 px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Items en Envío ({itemsEnEnvio.length})
            </h3>
          </div>
          
          <div className="divide-y divide-gray-200">
            {itemsEnEnvio.map(item => {
              const timer = obtenerTimerItem(item.id);
              const tiempoRestante = timer ? formatearTiempo(timer.tiempoRestanteSegundos) : '00:00';
              
              return (
                <div key={item.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0">
                        {item.sub_estado === 'En transito' ? (
                          <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        ) : (
                          <CheckCircle className="text-green-600" size={20} />
                        )}
                      </div>
                      
                      <div>
                        <p className="font-medium text-gray-900">{item.nombre_unidad}</p>
                        <p className="text-sm text-gray-600">
                          RFID: {item.rfid} | Lote: {item.lote} | 
                          Tiempo estimado: {item.tiempoEnvio}m
                        </p>
                        {item.fechaInicioEnvio && (
                          <p className="text-xs text-gray-500">
                            Iniciado: {item.fechaInicioEnvio.toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      {/* Temporizador */}
                      {timer && item.sub_estado === 'En transito' && (
                        <div className="flex items-center gap-2 bg-orange-100 px-3 py-1 rounded-lg">
                          <Clock className="text-orange-600" size={16} />
                          <span className="font-mono text-orange-800 font-medium">
                            {tiempoRestante}
                          </span>
                        </div>
                      )}
                      
                      {/* Estado */}
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        item.sub_estado === 'En transito' 
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {item.sub_estado === 'En transito' ? 'En Tránsito' : 'Entregado'}
                      </span>
                      
                      {/* Acciones */}
                      {item.sub_estado === 'En transito' && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => manejarCompletarEnvio(item.id)}
                            className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                            title="Marcar como entregado"
                          >
                            <CheckCircle size={16} />
                          </button>
                          <button
                            onClick={() => manejarCancelarEnvio(item.id)}
                            className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                            title="Cancelar envío"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal de configuración de envío */}
      {mostrarModalEnvio && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Configurar Envío
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Items seleccionados: {itemsSeleccionados.length}
                </label>
                <div className="text-sm text-gray-600">
                  {itemsSeleccionados.map(id => {
                    const item = itemsListosParaEnvio.find(i => i.id === id);
                    return item?.nombre_unidad;
                  }).join(', ')}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tiempo estimado de envío (minutos)
                </label>
                <input
                  type="number"
                  value={tiempoEnvioPersonalizado}
                  onChange={(e) => setTiempoEnvioPersonalizado(Number(e.target.value))}
                  min="1"
                  max="1440"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  title="Tiempo estimado de envío en minutos"
                  placeholder="Ingrese tiempo en minutos"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Equivale a {Math.floor(tiempoEnvioPersonalizado / 60)}h {tiempoEnvioPersonalizado % 60}m
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={manejarIniciarEnvio}
                disabled={cargandoEnvio}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {cargandoEnvio ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Iniciando...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Iniciar Envío
                  </>
                )}
              </button>
              <button
                onClick={() => setMostrarModalEnvio(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mensaje cuando no hay items */}
      {itemsListosParaEnvio.length === 0 && itemsEnEnvio.length === 0 && (
        <div className="text-center py-12">
          <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No hay items para envío
          </h3>
          <p className="text-gray-600">
            Los items aparecerán aquí cuando estén listos desde acondicionamiento
          </p>
        </div>
      )}
    </div>
  );
};

export default OperacionEnvioView;
