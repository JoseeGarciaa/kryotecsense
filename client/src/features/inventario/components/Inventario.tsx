import React, { useState, useEffect } from 'react';
import { Search, Loader, Edit, Trash2 } from 'lucide-react';
import { apiServiceClient } from '../../../api/apiClient';
import { Credocube } from '../../shared/types';
import EditarCredocubeModal from './EditarCredocubeModal';

const Inventario: React.FC = () => {
  const [inventario, setInventario] = useState<Credocube[]>([]);
  const [inventarioFiltrado, setInventarioFiltrado] = useState<Credocube[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditarModalOpen, setIsEditarModalOpen] = useState(false);
  const [credocubeSeleccionado, setCredocubeSeleccionado] = useState<Credocube | null>(null);
  const [terminoBusqueda, setTerminoBusqueda] = useState('');
  const [paginaActual, setPaginaActual] = useState(1);
  const [itemsSeleccionados, setItemsSeleccionados] = useState<Set<number>>(new Set());
  const [mostrarConfirmacionEliminacion, setMostrarConfirmacionEliminacion] = useState(false);
  const [eliminandoItems, setEliminandoItems] = useState(false);
  const registrosPorPagina = 100;

  const fetchInventario = async () => {
    try {
      setCargando(true);
      const response = await apiServiceClient.get('/inventory/inventario/');
      console.log('Datos de inventario recibidos de la API:', response.data);
      const datos = Array.isArray(response.data) ? response.data : [];
      setInventario(datos);
      setInventarioFiltrado(datos);
      setError(null);
    } catch (err) {
      setError('No se pudieron cargar los datos del inventario.');
      console.error(err);
    } finally {
      setCargando(false);
    }
  };

  // Función de búsqueda con truncamiento a 24 caracteres
  const manejarBusqueda = (termino: string) => {
    // Truncar a 24 caracteres máximo
    const terminoTruncado = termino.slice(0, 24);
    setTerminoBusqueda(terminoTruncado);
    setPaginaActual(1); // Resetear a la primera página
    
    if (!terminoTruncado.trim()) {
      setInventarioFiltrado(inventario);
      return;
    }

    const terminoLower = terminoTruncado.toLowerCase();
    const resultados = inventario.filter((item: Credocube) => 
      item.nombre_unidad?.toLowerCase().includes(terminoLower) ||
      item.rfid?.toLowerCase().includes(terminoLower) ||
      item.lote?.toLowerCase().includes(terminoLower) ||
      item.estado?.toLowerCase().includes(terminoLower)
    );
    
    setInventarioFiltrado(resultados);
  };

  // Funciones de selección múltiple
  const toggleSeleccionItem = (id: number) => {
    const nuevasSelecciones = new Set(itemsSeleccionados);
    if (nuevasSelecciones.has(id)) {
      nuevasSelecciones.delete(id);
    } else {
      nuevasSelecciones.add(id);
    }
    setItemsSeleccionados(nuevasSelecciones);
  };

  const seleccionarTodos = () => {
    const todosLosIds = new Set(registrosActuales.map((item: Credocube) => item.id));
    setItemsSeleccionados(todosLosIds);
  };

  const limpiarSeleccion = () => {
    setItemsSeleccionados(new Set());
  };

  const eliminarSeleccionados = async () => {
    if (itemsSeleccionados.size === 0) return;
    
    setEliminandoItems(true);
    
    try {
      // Eliminar cada item seleccionado con mejor manejo de errores
      const resultados = await Promise.allSettled(
        Array.from(itemsSeleccionados).map(async (id) => {
          try {
            await apiServiceClient.delete(`/inventory/inventario/${id}`);
            return { id, success: true };
          } catch (error) {
            console.error(`Error eliminando item ${id}:`, error);
            return { id, success: false, error };
          }
        })
      );
      
      // Analizar resultados
      const exitosos = resultados.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const fallidos = resultados.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;
      
      if (exitosos > 0) {
        // Limpiar selecciones y recargar inventario
        setItemsSeleccionados(new Set());
        setMostrarConfirmacionEliminacion(false);
        setError(null);
        await fetchInventario();
        
        if (fallidos > 0) {
          setError(`Se eliminaron ${exitosos} items. ${fallidos} items no pudieron ser eliminados.`);
        }
      } else {
        setError('No se pudo eliminar ningún item. Verifique que los items no estén siendo utilizados en procesos activos.');
      }
      
    } catch (err) {
      console.error('Error eliminando items:', err);
      setError('Error al eliminar los items seleccionados. Por favor, inténtelo de nuevo.');
      // Mantener el modal abierto en caso de error para que el usuario pueda intentar de nuevo
    } finally {
      setEliminandoItems(false);
    }
  };

  // Cálculos de paginación
  const indiceInicio = (paginaActual - 1) * registrosPorPagina;
  const indiceFin = indiceInicio + registrosPorPagina;
  const registrosActuales = inventarioFiltrado.slice(indiceInicio, indiceFin);
  const totalPaginas = Math.ceil(inventarioFiltrado.length / registrosPorPagina);

  const irAPagina = (pagina: number) => {
    setPaginaActual(pagina);
  };

  const handleEditar = (credocube: Credocube) => {
    setCredocubeSeleccionado(credocube);
    setIsEditarModalOpen(true);
  };

  const handleEliminar = async (credocube: Credocube) => {
    if (window.confirm(`¿Está seguro de que desea eliminar el credocube "${credocube.nombre_unidad}"?`)) {
      try {
        await apiServiceClient.delete(`/inventory/inventario/${credocube.id}`);
        fetchInventario(); // Recargar la lista
      } catch (err) {
        console.error('Error eliminando credocube:', err);
        setError('Error al eliminar el credocube. Por favor, inténtelo de nuevo.');
      }
    }
  };

  useEffect(() => {
    fetchInventario();
  }, []);

  const getEstadoColor = (estado: string) => {
    switch (estado.toLowerCase()) {
      case 'en bodega':
      
        return 'bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200';
      case 'pre-acondicionamiento':
        return 'bg-primary-600 text-white dark:bg-primary-700 dark:text-white';
      case 'acondicionamiento':
        return 'bg-primary-500 text-white dark:bg-primary-600 dark:text-white';
      case 'operación':
        return 'bg-primary-400 text-primary-900 dark:bg-primary-500 dark:text-primary-100';
      case 'devolución':
        return 'bg-primary-700 text-white dark:bg-primary-800 dark:text-white';
      case 'inspección':
        return 'bg-primary-300 text-primary-800 dark:bg-primary-400 dark:text-primary-900';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">Inventario</h1>
          <p className="text-gray-600 dark:text-gray-400">Gestión de credocubes y componentes RFID</p>
        </div>
      </div>

      {/* Búsqueda */}
      <div className="bg-light-card dark:bg-dark-card p-4 rounded-lg border border-light-border dark:border-dark-border">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input 
              type="text" 
              value={terminoBusqueda}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => manejarBusqueda(e.target.value)}
              placeholder="Buscar por nombre, RFID, lote o estado..." 
              className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" 
              maxLength={24}
            />
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {terminoBusqueda.length}/24 caracteres
            </div>
          </div>
          
          {/* Controles de selección múltiple */}
          {itemsSeleccionados.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {itemsSeleccionados.size} seleccionado{itemsSeleccionados.size !== 1 ? 's' : ''}
              </span>
              <button
                onClick={limpiarSeleccion}
                className="px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
              >
                Limpiar
              </button>
              <button
                onClick={() => setMostrarConfirmacionEliminacion(true)}
                className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              >
                Eliminar
              </button>
            </div>
          )}
        </div>
        
        {terminoBusqueda && (
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {inventarioFiltrado.length} resultado{inventarioFiltrado.length !== 1 ? 's' : ''} encontrado{inventarioFiltrado.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Tabla de Inventario */}
      <div className="bg-light-card dark:bg-dark-card p-4 rounded-lg border border-light-border dark:border-dark-border overflow-x-auto w-full">
        {cargando ? (
          <div className="flex justify-center items-center p-8">
            <Loader className="w-8 h-8 animate-spin text-primary-600 dark:text-primary-400" />
            <p className="ml-4 text-gray-600 dark:text-gray-400">Cargando inventario...</p>
          </div>
        ) : error ? (
          <div className="text-center p-8 text-red-600">
            {error}
          </div>
        ) : (
          <table className="min-w-full text-sm text-left text-gray-500 dark:text-gray-400 table-fixed">
            <thead className="text-xs text-light-text uppercase bg-primary-50 dark:bg-primary-900 dark:text-dark-text">
              <tr>
                <th scope="col" className="px-3 py-3 w-12">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={registrosActuales.length > 0 && registrosActuales.every((item: Credocube) => itemsSeleccionados.has(item.id))}
                      onChange={() => {
                        if (registrosActuales.every((item: Credocube) => itemsSeleccionados.has(item.id))) {
                          limpiarSeleccion();
                        } else {
                          seleccionarTodos();
                        }
                      }}
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                    />
                  </div>
                </th>
                <th scope="col" className="px-3 py-3 w-32">Nombre Unidad</th>
                <th scope="col" className="px-3 py-3 w-24">Modelo ID</th>
                <th scope="col" className="px-3 py-3 w-24">RFID</th>
                <th scope="col" className="px-3 py-3 w-24">Lote</th>
                <th scope="col" className="px-3 py-3 w-40">Estado</th>
                <th scope="col" className="px-3 py-3 w-24">Sub-Estado</th>
                <th scope="col" className="px-3 py-3 w-24">Categoría</th>
                <th scope="col" className="px-3 py-3 w-32">Última Actualización</th>
                <th scope="col" className="px-3 py-3 w-24">Validación Limpieza</th>
                <th scope="col" className="px-3 py-3 w-24">Validación Goteo</th>
                <th scope="col" className="px-3 py-3 w-24">Validación Desinfección</th>
                <th scope="col" className="px-3 py-3 w-32">Fecha Ingreso</th>
                <th scope="col" className="px-3 py-3 w-24">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {registrosActuales.map((item: Credocube) => (
                <tr key={item.id} className="bg-light-card border-b dark:bg-dark-card dark:border-dark-border hover:bg-primary-50 dark:hover:bg-primary-900">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={itemsSeleccionados.has(item.id)}
                      onChange={() => toggleSeleccionItem(item.id)}
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                    />
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">{item.nombre_unidad}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{item.modelo_id}</td>
                  <td className="px-3 py-3 font-mono text-xs whitespace-nowrap">{item.rfid}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{item.lote || 'N/A'}</td>
                  <td className="px-3 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getEstadoColor(item.estado)}`}>
                      {item.estado}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">{item.sub_estado || 'N/A'}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{item.categoria || 'N/A'}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{item.ultima_actualizacion ? new Date(item.ultima_actualizacion).toLocaleString() : 'N/A'}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{item.validacion_limpieza || 'N/A'}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{item.validacion_goteo || 'N/A'}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{item.validacion_desinfeccion || 'N/A'}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{item.fecha_ingreso ? new Date(item.fecha_ingreso).toLocaleString() : 'N/A'}</td>
                  <td className="px-3 py-3 flex space-x-2">
                    <button 
                      title="Editar" 
                      onClick={() => handleEditar(item)}
                      className="text-primary-500 hover:text-primary-700 dark:text-primary-500 dark:hover:text-primary-400"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button 
                      title="Eliminar" 
                      onClick={() => handleEliminar(item)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        
        {/* Paginación */}
        {!cargando && !error && totalPaginas > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Mostrando {indiceInicio + 1} a {Math.min(indiceFin, inventarioFiltrado.length)} de {inventarioFiltrado.length} registros
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => irAPagina(paginaActual - 1)}
                disabled={paginaActual === 1}
                className="px-3 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary-50 dark:hover:bg-primary-900 border-light-border dark:border-dark-border text-light-text dark:text-dark-text"
              >
                ‹
              </button>
              
              {/* Números de página */}
              {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
                let numeroPagina;
                if (totalPaginas <= 5) {
                  numeroPagina = i + 1;
                } else if (paginaActual <= 3) {
                  numeroPagina = i + 1;
                } else if (paginaActual >= totalPaginas - 2) {
                  numeroPagina = totalPaginas - 4 + i;
                } else {
                  numeroPagina = paginaActual - 2 + i;
                }
                
                return (
                  <button
                    key={numeroPagina}
                    onClick={() => irAPagina(numeroPagina)}
                    className={`px-3 py-2 border rounded-lg ${
                      paginaActual === numeroPagina
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'hover:bg-primary-50 dark:hover:bg-primary-900 border-light-border dark:border-dark-border text-light-text dark:text-dark-text'
                    }`}
                  >
                    {numeroPagina}
                  </button>
                );
              })}
              
              <button
                onClick={() => irAPagina(paginaActual + 1)}
                disabled={paginaActual === totalPaginas}
                className="px-3 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary-50 dark:hover:bg-primary-900 border-light-border dark:border-dark-border text-light-text dark:text-dark-text"
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>

      {isEditarModalOpen && credocubeSeleccionado && (
        <EditarCredocubeModal 
          credocube={credocubeSeleccionado} 
          onClose={() => {
            setIsEditarModalOpen(false);
            setCredocubeSeleccionado(null);
          }} 
          onSuccess={() => {
            fetchInventario();
            setIsEditarModalOpen(false);
            setCredocubeSeleccionado(null);
          }} 
        />
      )}

      {/* Modal de confirmación para eliminación múltiple */}
      {mostrarConfirmacionEliminacion && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Confirmar eliminación múltiple
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              ¿Está seguro de que desea eliminar {itemsSeleccionados.size} registro{itemsSeleccionados.size !== 1 ? 's' : ''} seleccionado{itemsSeleccionados.size !== 1 ? 's' : ''}? Esta acción no se puede deshacer.
            </p>
            
            {/* Mostrar error si existe */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}
            
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setMostrarConfirmacionEliminacion(false);
                  setError(null); // Limpiar error al cancelar
                }}
                disabled={eliminandoItems}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                onClick={eliminarSeleccionados}
                disabled={eliminandoItems}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {eliminandoItems && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                )}
                {eliminandoItems ? 'Eliminando...' : `Eliminar ${itemsSeleccionados.size} registro${itemsSeleccionados.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventario;
