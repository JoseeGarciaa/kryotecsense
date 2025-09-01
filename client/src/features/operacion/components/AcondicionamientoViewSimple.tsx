import React, { useEffect, useState } from 'react';
import { Plus, Package, Search, Loader, Scan } from 'lucide-react';
import { useOperaciones } from '../hooks/useOperaciones';
import { apiServiceClient } from '../../../api/apiClient';
import RfidScanModal from './RfidScanModal';
import { useTimerContext } from '../../../contexts/TimerContext';

interface AcondicionamientoViewSimpleProps {
  isOpen: boolean;
  onClose: () => void;
}

const AcondicionamientoViewSimple: React.FC<AcondicionamientoViewSimpleProps> = ({ isOpen, onClose }) => {
  const { inventarioCompleto, cambiarEstadoItem, actualizarColumnasDesdeBackend } = useOperaciones();
  const { timers, eliminarTimer } = useTimerContext();
  
  const [mostrarModalTraerEnsamblaje, setMostrarModalTraerEnsamblaje] = useState(false);
  const [mostrarModalTraerDespacho, setMostrarModalTraerDespacho] = useState(false);
  const [busquedaEnsamblaje, setBusquedaEnsamblaje] = useState('');
  const [busquedaListaDespacho, setBusquedaListaDespacho] = useState('');
  const [cargandoActualizacion, setCargandoActualizacion] = useState(false);
  const [cargandoEnsamblaje, setCargandoEnsamblaje] = useState(false);
  const [cargandoDespacho, setCargandoDespacho] = useState(false);

  // Obtener items por sub-estado
  const itemsEnsamblaje = inventarioCompleto?.filter(item => 
    item.estado === 'Acondicionamiento' && item.sub_estado === 'Ensamblaje'
  ) || [];
  
  const itemsListaDespacho = inventarioCompleto?.filter(item => 
    item.estado === 'Acondicionamiento' && item.sub_estado === 'Lista para Despacho'
  ) || [];

  // Utilidad: normalizar texto (quitar acentos, minúsculas y trim)
  const norm = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  // Filtrar items disponibles para Ensamblaje: desde Bodega y desde Pre-acondicionamiento → Atemperamiento (excluyendo Congelación)
  const itemsDisponibles = inventarioCompleto?.filter(item => {
    const e = norm(item.estado);
    const s = norm((item as any).sub_estado);
    const enBodega = e.includes('bodega');
    const esPreAcond = e.includes('pre') && e.includes('acond');
    const esAtemperamiento = s.includes('atemper'); // 'atemperamiento' o 'atemperado'
    const esCongelacion = e.includes('congel') || s.includes('congel');
    return (enBodega || (esPreAcond && esAtemperamiento)) && !esCongelacion;
  }) || [];

  // Filtrar items disponibles específicamente para Lista para Despacho (solo de Ensamblaje)
  const itemsDisponiblesParaDespacho = inventarioCompleto?.filter(item => 
    item.estado === 'Acondicionamiento' && item.sub_estado === 'Ensamblaje'
  ) || [];

  // Normalizar: en Ensamblaje todos los lotes deben ser null
  useEffect(() => {
    const normalizar = async () => {
      try {
        const conLote = itemsEnsamblaje.filter((it: any) => it.lote);
        if (conLote.length === 0) return;
        setCargandoActualizacion(true);
        await Promise.all(
          conLote.map((item: any) => {
            const actualizacionItem = {
              modelo_id: item.modelo_id,
              nombre_unidad: item.nombre_unidad,
              rfid: item.rfid,
              lote: null,
              estado: item.estado,
              sub_estado: item.sub_estado,
              validacion_limpieza: item.validacion_limpieza || null,
              validacion_goteo: item.validacion_goteo || null,
              validacion_desinfeccion: item.validacion_desinfeccion || null,
              categoria: item.categoria || null
            };
            return apiServiceClient.put(`/inventory/inventario/${item.id}`, actualizacionItem);
          })
        );
        await actualizarColumnasDesdeBackend();
      } catch (e) {
        console.warn('No se pudo normalizar lotes en Ensamblaje:', e);
      } finally {
        setCargandoActualizacion(false);
      }
    };

    if (isOpen && itemsEnsamblaje.length > 0) {
      normalizar();
    }
  }, [isOpen, itemsEnsamblaje, actualizarColumnasDesdeBackend]);

  // Función para cancelar cronómetros de items movidos
  const cancelarCronometrosDeItems = (itemsMovidos: any[]) => {
    try {
      itemsMovidos.forEach(item => {
        // Buscar timer por RFID del item
        const timerAsociado = timers.find(timer => timer.nombre === item.rfid);
        if (timerAsociado) {
          console.log(`🔄 Cancelando cronómetro para ${item.rfid}`);
          try {
            eliminarTimer(timerAsociado.id);
          } catch (timerError) {
            console.warn(`⚠️ Error cancelando cronómetro para ${item.rfid}:`, timerError);
          }
        }
      });
    } catch (error) {
      console.warn('⚠️ Error general cancelando cronómetros:', error);
    }
  };

  // Filtrar por búsqueda
  const itemsEnsamblajeFiltrados = itemsEnsamblaje.filter(item =>
    item.nombre_unidad?.toLowerCase().includes(busquedaEnsamblaje.toLowerCase()) ||
    item.rfid?.toLowerCase().includes(busquedaEnsamblaje.toLowerCase()) ||
    item.lote?.toLowerCase().includes(busquedaEnsamblaje.toLowerCase())
  );

  const itemsListaDespachoFiltrados = itemsListaDespacho.filter(item =>
    item.nombre_unidad?.toLowerCase().includes(busquedaListaDespacho.toLowerCase()) ||
    item.rfid?.toLowerCase().includes(busquedaListaDespacho.toLowerCase()) ||
    item.lote?.toLowerCase().includes(busquedaListaDespacho.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="flex-1 overflow-hidden bg-white">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Acondicionamiento</h1>
          {cargandoActualizacion && (
            <div className="flex items-center gap-2 text-blue-600">
              <Loader className="w-4 h-4 animate-spin" />
              <span className="text-sm">Actualizando datos...</span>
            </div>
          )}
        </div>
      </div>

      {/* Contenido principal */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        
        {/* Sección Ensamblaje */}
        <div className="bg-white rounded-lg border border-red-200 overflow-hidden">
          <div className="bg-red-50 border-b border-red-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-red-800">Items en Ensamblaje</h2>
                <p className="text-sm text-red-600">({itemsEnsamblaje.length} de {itemsEnsamblaje.length})</p>
              </div>
              <button
                onClick={() => setMostrarModalTraerEnsamblaje(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Agregar Items
              </button>
            </div>
          </div>

          {/* Búsqueda Ensamblaje */}
          <div className="p-4 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar por RFID, nombre o lote..."
                value={busquedaEnsamblaje}
                onChange={(e) => setBusquedaEnsamblaje(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Tabla Ensamblaje */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">RFID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NOMBRE</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">LOTE</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ESTADO</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CATEGORÍA</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {itemsEnsamblajeFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center">
                      <div className="text-gray-500">
                        <Package className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                        <p>No hay items en ensamblaje</p>
                        <p className="text-sm">Agregue items usando el botón de arriba</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  itemsEnsamblajeFiltrados.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.rfid}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.nombre_unidad}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.lote || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                          {item.sub_estado}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          item.categoria === 'TIC' ? 'bg-green-100 text-green-800' :
                          item.categoria === 'VIP' ? 'bg-purple-100 text-purple-800' :
                          item.categoria === 'Cube' ? 'bg-blue-100 text-blue-800' :
                          'bg-orange-100 text-orange-800'
                        }`}>
                          {item.categoria}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sección Lista para Despacho */}
        <div className="bg-white rounded-lg border border-green-200 overflow-hidden">
          <div className="bg-green-50 border-b border-green-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-green-800">Items Lista para Despacho</h2>
                <p className="text-sm text-green-600">({itemsListaDespacho.length} de {itemsListaDespacho.length})</p>
              </div>
              <button
                onClick={() => setMostrarModalTraerDespacho(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-md hover:bg-orange-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Agregar Items
              </button>
            </div>
          </div>

          {/* Búsqueda Lista Despacho */}
          <div className="p-4 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar por RFID, nombre o lote..."
                value={busquedaListaDespacho}
                onChange={(e) => setBusquedaListaDespacho(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Tabla Lista Despacho */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">RFID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NOMBRE</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">LOTE</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ESTADO</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CATEGORÍA</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {itemsListaDespachoFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center">
                      <div className="text-gray-500">
                        <Package className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                        <p>No hay items listos para despacho</p>
                        <p className="text-sm">Agregue items usando el botón de arriba</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  itemsListaDespachoFiltrados.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.rfid}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.nombre_unidad}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.lote || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                          {item.sub_estado}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          item.categoria === 'TIC' ? 'bg-green-100 text-green-800' :
                          item.categoria === 'VIP' ? 'bg-purple-100 text-purple-800' :
                          item.categoria === 'Cube' ? 'bg-blue-100 text-blue-800' :
                          'bg-orange-100 text-orange-800'
                        }`}>
                          {item.categoria}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modales para agregar items */}
      {mostrarModalTraerEnsamblaje && (
        <AgregarItemsModal
          isOpen={mostrarModalTraerEnsamblaje}
          onClose={() => setMostrarModalTraerEnsamblaje(false)}
          itemsDisponibles={itemsDisponibles} // Bodega o Pre-acond → Atemperamiento (sin Congelación)
          subEstadoDestino="Ensamblaje"
          cargando={cargandoEnsamblaje}
          onConfirm={async (items, subEstado) => {
            try {
              setCargandoEnsamblaje(true);
              setCargandoActualizacion(true);
              console.log(`🔄 Moviendo ${items.length} items a ${subEstado}...`);
              
              // Cancelar cronómetros de los items que se van a mover
              cancelarCronometrosDeItems(items);
              
              const promesas = items.map(async (item) => {
                // Ajuste: al mover a Ensamblaje, los lotes quedan nulos
                const actualizacionItem = {
                  modelo_id: item.modelo_id,
                  nombre_unidad: item.nombre_unidad,
                  rfid: item.rfid,
                  lote: null,
                  estado: 'Acondicionamiento',
                  sub_estado: subEstado,
                  validacion_limpieza: item.validacion_limpieza || null,
                  validacion_goteo: item.validacion_goteo || null,
                  validacion_desinfeccion: item.validacion_desinfeccion || null,
                  categoria: item.categoria || null
                };
                
                // Usar PUT en lugar de PATCH, igual que el modal de bodega
                return apiServiceClient.put(`/inventory/inventario/${item.id}`, actualizacionItem);
              });
              
              await Promise.all(promesas);
              console.log(`✅ ${items.length} items movidos exitosamente a ${subEstado}`);
              
              // Actualizar datos - manejar errores de actualización por separado
              try {
                await actualizarColumnasDesdeBackend();
                console.log(`🔄 Datos actualizados automáticamente`);
              } catch (updateError) {
                console.warn('⚠️ Error actualizando datos (items ya fueron movidos):', updateError);
                // No lanzar error aquí ya que los items se movieron exitosamente
              }
              
              setMostrarModalTraerEnsamblaje(false);
            } catch (error) {
              console.error('❌ Error moviendo items:', error);
              const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
              alert(`Error al mover items: ${errorMessage}`);
            } finally {
              setCargandoEnsamblaje(false);
              setCargandoActualizacion(false);
            }
          }}
        />
      )}

      {mostrarModalTraerDespacho && (
        <AgregarItemsModal
          isOpen={mostrarModalTraerDespacho}
          onClose={() => setMostrarModalTraerDespacho(false)}
          itemsDisponibles={itemsDisponiblesParaDespacho} // Solo items de Ensamblaje para Lista para Despacho
          subEstadoDestino="Lista para Despacho"
          cargando={cargandoDespacho}
          onConfirm={async (items, subEstado) => {
            try {
              setCargandoDespacho(true);
              setCargandoActualizacion(true);
              console.log(`🔄 Moviendo ${items.length} items de Ensamblaje a ${subEstado}...`);
              
              // Cancelar cronómetros de los items que se van a mover
              cancelarCronometrosDeItems(items);
              
              const promesas = items.map(async (item) => {
                // Usar la misma lógica que el modal de bodega
                const actualizacionItem = {
                  modelo_id: item.modelo_id,
                  nombre_unidad: item.nombre_unidad,
                  rfid: item.rfid,
                  lote: item.lote || null,
                  estado: 'Acondicionamiento',
                  sub_estado: subEstado,
                  validacion_limpieza: item.validacion_limpieza || null,
                  validacion_goteo: item.validacion_goteo || null,
                  validacion_desinfeccion: item.validacion_desinfeccion || null,
                  categoria: item.categoria || null
                };
                
                // Usar PUT en lugar de PATCH, igual que el modal de bodega
                return apiServiceClient.put(`/inventory/inventario/${item.id}`, actualizacionItem);
              });
              
              await Promise.all(promesas);
              console.log(`✅ ${items.length} items movidos exitosamente de Ensamblaje a ${subEstado}`);
              
              // Actualizar datos - manejar errores de actualización por separado
              try {
                await actualizarColumnasDesdeBackend();
                console.log(`🔄 Datos actualizados automáticamente`);
              } catch (updateError) {
                console.warn('⚠️ Error actualizando datos (items ya fueron movidos):', updateError);
                // No lanzar error aquí ya que los items se movieron exitosamente
              }
              
              setMostrarModalTraerDespacho(false);
            } catch (error) {
              console.error('❌ Error moviendo items:', error);
              const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
              alert(`Error al mover items: ${errorMessage}`);
            } finally {
              setCargandoDespacho(false);
              setCargandoActualizacion(false);
            }
          }}
        />
      )}
    </div>
  );
};

// Modal simple para agregar items
interface AgregarItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemsDisponibles: any[];
  onConfirm: (items: any[], subEstado: string) => void;
  subEstadoDestino: string; // Nuevo prop para especificar el sub-estado destino
  cargando?: boolean; // Estado de carga para mostrar en el botón
}

const AgregarItemsModal: React.FC<AgregarItemsModalProps> = ({ 
  isOpen, 
  onClose, 
  itemsDisponibles, 
  onConfirm, 
  subEstadoDestino,
  cargando = false
}) => {
  const [itemsSeleccionados, setItemsSeleccionados] = useState<any[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('TODOS');
  const [mostrarEscanerRfid, setMostrarEscanerRfid] = useState(false);
  const [rfidInput, setRfidInput] = useState('');
  const [rfidsEscaneados, setRfidsEscaneados] = useState<string[]>([]);

  // Función para manejar auto-procesamiento de RFIDs de 24 caracteres
  const procesarRfid = (rfid: string) => {
    if (!rfid.trim()) return;

    const itemEncontrado = itemsDisponibles.find(item => 
      item.rfid === rfid.trim() || item.nombre_unidad === rfid.trim()
    );

    if (itemEncontrado) {
      if (!rfidsEscaneados.includes(rfid.trim())) {
        setRfidsEscaneados(prev => [...prev, rfid.trim()]);
        console.log(`✅ RFID ${rfid.trim()} auto-procesado`);
      } else {
        console.log(`ℹ️ RFID ${rfid.trim()} ya está en la lista`);
      }
    } else {
      console.log(`❌ RFID ${rfid.trim()} no encontrado en items disponibles`);
    }
  };

  // Función para manejar cambios en el input de RFID con auto-procesamiento
  const handleRfidChange = (value: string) => {
    setRfidInput(value);
    
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
      
      // Procesar cada código
      codigosCompletos.forEach(codigo => {
        procesarRfid(codigo);
      });
      
      // Limpiar el input después de procesar
      setRfidInput('');
      
      if (codigosCompletos.length > 0) {
        console.log(`🔄 Auto-procesados ${codigosCompletos.length} códigos de 24 caracteres`);
      }
    }
  };

  const itemsFiltrados = itemsDisponibles.filter(item => {
    const coincideBusqueda = !busqueda || 
      item.nombre_unidad?.toLowerCase().includes(busqueda.toLowerCase()) ||
      item.rfid?.toLowerCase().includes(busqueda.toLowerCase()) ||
      item.lote?.toLowerCase().includes(busqueda.toLowerCase());

    const coincideCategoria = filtroCategoria === 'TODOS' || item.categoria === filtroCategoria;

    return coincideBusqueda && coincideCategoria;
  });

  // Funciones para manejar el escáner RFID
  const manejarEscanearRfid = () => {
    if (!rfidInput.trim()) return;

    const itemEncontrado = itemsDisponibles.find(item => 
      item.rfid === rfidInput.trim() || item.nombre_unidad === rfidInput.trim()
    );

    if (itemEncontrado) {
      // Verificar si ya está en la lista de RFIDs escaneados
      if (!rfidsEscaneados.includes(rfidInput.trim())) {
        setRfidsEscaneados(prev => [...prev, rfidInput.trim()]);
        setRfidInput('');
        console.log(`✅ RFID ${rfidInput.trim()} agregado`);
      } else {
        console.log(`ℹ️ RFID ${rfidInput.trim()} ya está en la lista`);
      }
    } else {
      alert(`❌ No se encontró ningún item disponible con RFID: ${rfidInput.trim()}`);
    }
  };

  const confirmarEscaneoRfid = async (rfids: string[]) => {
    try {
      // Encontrar todos los items correspondientes a los RFIDs escaneados
      const itemsEncontrados = rfids.map(rfid => 
        itemsDisponibles.find(item => item.rfid === rfid || item.nombre_unidad === rfid)
      ).filter(Boolean);

      // Agregar a la selección
      setItemsSeleccionados(prev => {
        const nuevosItems = itemsEncontrados.filter(item => 
          !prev.find(selected => selected.id === item.id)
        );
        return [...prev, ...nuevosItems];
      });

      // Limpiar estados del escáner
      setRfidsEscaneados([]);
      setRfidInput('');
      setMostrarEscanerRfid(false);
      
      return true;
    } catch (error) {
      console.error('Error confirmando escaneo RFID:', error);
      return false;
    }
  };

  const cancelarEscaneoRfid = () => {
    setRfidsEscaneados([]);
    setRfidInput('');
    setMostrarEscanerRfid(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-lg shadow-xl w-[92vw] max-w-md sm:max-w-2xl md:max-w-4xl max-h-[88vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-3 sm:p-4 border-b">
          <h2 className="text-base sm:text-lg font-semibold">Agregar Items a {subEstadoDestino}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-lg leading-none">×</button>
        </div>

        <div className="p-3 sm:p-4 border-b bg-gray-50">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mb-2 sm:mb-3">
            <div className="sm:flex-1">
              <input
                type="text"
                placeholder="Buscar por nombre, RFID o lote..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={filtroCategoria}
                onChange={(e) => setFiltroCategoria(e.target.value)}
                className="px-3 py-2 border rounded-md text-sm"
              >
                <option value="TODOS">Todas las categorías</option>
                <option value="TIC">TIC</option>
                <option value="VIP">VIP</option>
                <option value="Cube">Cube</option>
              </select>
              <button
                onClick={() => setMostrarEscanerRfid(true)}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2 transition-colors"
              >
                <Scan className="w-4 h-4" />
                Escanear RFID
              </button>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
            <button
              onClick={() => setItemsSeleccionados(itemsFiltrados)}
              className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded"
            >
              Seleccionar todos ({itemsFiltrados.length})
            </button>
            <button
              onClick={() => setItemsSeleccionados([])}
              className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded"
            >
              Limpiar selección
            </button>
            <span className="text-gray-600">{itemsSeleccionados.length} seleccionado(s)</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {itemsFiltrados.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              No hay items disponibles para mover a acondicionamiento
            </div>
          ) : (
            <div className="space-y-2">
              {itemsFiltrados.map((item) => {
                const isSelected = itemsSeleccionados.find(s => s.id === item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (isSelected) {
                        setItemsSeleccionados(prev => prev.filter(s => s.id !== item.id));
                      } else {
                        setItemsSeleccionados(prev => [...prev, item]);
                      }
                    }}
                    className={`p-3 border rounded cursor-pointer transition-all ${
                      isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={!!isSelected}
                        onChange={() => {}}
                        className="mt-0.5 rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 text-[11px] rounded ${
                            item.categoria === 'TIC' ? 'bg-green-100 text-green-800' :
                            item.categoria === 'VIP' ? 'bg-purple-100 text-purple-800' :
                            item.categoria === 'Cube' ? 'bg-blue-100 text-blue-800' :
                            'bg-orange-100 text-orange-800'
                          }`}>
                            {item.categoria}
                          </span>
                          <span className="font-medium text-sm truncate" title={item.nombre_unidad}>{item.nombre_unidad}</span>
                        </div>
                        <div className="text-xs text-gray-600 mt-1 break-words">
                          <span className="mr-2">RFID: {item.rfid}</span>
                          {item.lote && <span className="mr-2">Lote: {item.lote}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-3 sm:p-4 border-t bg-gray-50 flex flex-col sm:flex-row sm:justify-between gap-2 sm:gap-3 items-stretch sm:items-center">
          <div className="text-xs sm:text-sm text-gray-600">
            {itemsSeleccionados.length > 0 && (
              <span>{itemsSeleccionados.length} item(s) se moverán a {subEstadoDestino}</span>
            )}
          </div>
          <div className="flex gap-2 sm:gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => onConfirm(itemsSeleccionados, subEstadoDestino)}
              disabled={itemsSeleccionados.length === 0 || cargando}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {cargando && (
                <Loader className="w-4 h-4 animate-spin" />
              )}
              {cargando ? 
                `Moviendo...` : 
                `Mover a ${subEstadoDestino} (${itemsSeleccionados.length})`
              }
            </button>
          </div>
        </div>
      </div>

      {/* Modal del escáner RFID */}
      {mostrarEscanerRfid && (
        <RfidScanModal
          mostrarModal={mostrarEscanerRfid}
          rfidInput={rfidInput}
          rfidsEscaneados={rfidsEscaneados}
          onRfidInputChange={handleRfidChange}
          onEscanearRfid={manejarEscanearRfid}
          onConfirmar={confirmarEscaneoRfid}
          onCancelar={cancelarEscaneoRfid}
          titulo={`Escanear RFID para ${subEstadoDestino}`}
          descripcion={`Escanea los RFIDs de los items que quieres mover a ${subEstadoDestino}`}
          onEliminarRfid={(rfid) => setRfidsEscaneados(prev => prev.filter(r => r !== rfid))}
        />
      )}
    </div>
  );
};

export default AcondicionamientoViewSimple;
