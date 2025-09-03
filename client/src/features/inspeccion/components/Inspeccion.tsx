import React, { useState, useEffect, useMemo } from 'react';
import { Package, CheckCircle, AlertCircle, Clock, Settings, Shield, Scan, Search } from 'lucide-react';
import { useInspeccion, ItemInspeccion } from '../hooks/useInspeccion';
import { InspeccionScanModal } from './InspeccionScanModal';
import { useTimerContext } from '../../../contexts/TimerContext';
import { useDevolucion } from '../../devolucion/hooks/useDevolucion';

export const Inspeccion: React.FC = () => {
  const {
    itemsParaInspeccion,
    itemsInspeccionados,
    cargando,
    error,
    cargarItemsParaInspeccion,
    actualizarValidaciones,
    completarInspeccion,
    completarInspeccionEnLote,
    completarInspeccionPorEscaneo,
    // Estados y funciones para escaneo masivo
    itemsEscaneados,
    procesandoEscaneos,
    colaEscaneos,
    procesarColaEscaneos
  } = useInspeccion();

  const [paginaActual, setPaginaActual] = useState(1);
  const [mostrarModalEscaneo, setMostrarModalEscaneo] = useState(false);
  const itemsPorPagina = 5;

  // Datos de la fase anterior (Devolución) para "Agregar Items"
  const {
    itemsDevueltos,
    cargarItemsDevolucion,
    pasarItemsAInspeccion
  } = useDevolucion();

  const [mostrarModalSeleccion, setMostrarModalSeleccion] = useState(false);
  const [modalBusqueda, setModalBusqueda] = useState('');
  const [horasInspeccion, setHorasInspeccion] = useState<string>('');
  const [minutosInspeccion, setMinutosInspeccion] = useState<string>('');
  const [itemsSeleccionadosModal, setItemsSeleccionadosModal] = useState<number[]>([]);

  // Items elegibles desde la fase previa: en Devolución y marcados como Devuelto
  const itemsPreviosElegibles = useMemo(() => {
    return (itemsDevueltos || []).map((i: any) => i);
  }, [itemsDevueltos]);

  const itemsFiltradosModal = useMemo(() => {
    const term = modalBusqueda.toLowerCase();
    return itemsPreviosElegibles.filter((item: any) =>
      (typeof item.nombre_unidad === 'string' && item.nombre_unidad.toLowerCase().includes(term)) ||
      (typeof item.rfid === 'string' && item.rfid.toLowerCase().includes(term))
    );
  }, [itemsPreviosElegibles, modalBusqueda]);

  // Timers de inspección (36h) para mostrar el tiempo restante por item
  const { timers, formatearTiempo } = useTimerContext();
  const { tiempoPorId, tiempoPorNombre, vencidoPorId } = useMemo(() => {
    const porId = new Map<number, string>();
    const porNombre = new Map<string, string>();
    const expirado = new Map<number, boolean>();

    const normalize = (s: string | null | undefined) => (s ?? '')
      .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    for (const t of timers) {
      if (t.tipoOperacion !== 'inspeccion') continue;
      const label = t.completado ? 'Vencido' : formatearTiempo(t.tiempoRestanteSegundos);
      // Intentar extraer el ID desde el nombre: "Inspección #<id> -"
      const m = t.nombre.match(/^Inspección\s+#(\d+)\s+-/);
      if (m) {
        const id = Number(m[1]);
        porId.set(id, label);
        expirado.set(id, !!t.completado);
      }
      // Fallback por nombre normalizado (por si no coincide el patrón)
      const n = t.nombre.split('-').slice(1).join('-').trim();
      if (n) porNombre.set(normalize(n), label);
    }

    return { tiempoPorId: porId, tiempoPorNombre: porNombre, vencidoPorId: expirado };
  }, [timers, formatearTiempo]);

  useEffect(() => {
    cargarItemsParaInspeccion();
  }, [cargarItemsParaInspeccion]);

  // Cargar también la fase previa cuando abrimos el modal
  useEffect(() => {
    if (mostrarModalSeleccion) {
      try { cargarItemsDevolucion(); } catch {}
    }
  }, [mostrarModalSeleccion, cargarItemsDevolucion]);

  // Resetear página cuando cambien los items inspeccionados
  useEffect(() => {
    setPaginaActual(1);
  }, [itemsInspeccionados.length]);

  // Agrupar items por categoría
  const cubesParaInspeccion = itemsParaInspeccion.filter(item => item.categoria === 'Cube');
  const vipsParaInspeccion = itemsParaInspeccion.filter(item => item.categoria === 'VIP');
  const ticsParaInspeccion = itemsParaInspeccion.filter(item => item.categoria === 'TIC');

  // Items inspeccionados paginados
  const totalPaginas = Math.ceil(itemsInspeccionados.length / itemsPorPagina);
  const indiceInicio = (paginaActual - 1) * itemsPorPagina;
  const indiceFin = indiceInicio + itemsPorPagina;
  const itemsInspeccionadosPaginados = itemsInspeccionados.slice(indiceInicio, indiceFin);

  // Función para manejar cambios en validaciones
  const handleValidacionChange = (itemId: number, tipo: 'limpieza' | 'goteo' | 'desinfeccion', valor: boolean) => {
    actualizarValidaciones(itemId, { [tipo]: valor });
  };

  // Función para verificar si un item está listo para inspección
  const isItemListoParaInspeccion = (item: ItemInspeccion) => {
    const { limpieza, goteo, desinfeccion } = item.validaciones!;
    return limpieza && goteo && desinfeccion;
  };

  // Función para completar inspección de un item
  const handleCompletarInspeccion = async (itemId: number) => {
    try {
      await completarInspeccion(itemId);
    } catch (error) {
      console.error('Error completando inspección:', error);
    }
  };

  // Función para completar todas las inspecciones válidas
  const handleCompletarTodasLasInspecciones = async () => {
    const itemsListos = itemsParaInspeccion.filter(isItemListoParaInspeccion);
    
    if (itemsListos.length === 0) {
      alert('No hay items listos para completar inspección. Asegúrate de que todas las validaciones estén marcadas.');
      return;
    }

    const confirmacion = window.confirm(
      `¿Estás seguro de que quieres completar la inspección de ${itemsListos.length} items?\n\n` +
      `Esto marcará todos los items validados como inspeccionados.\n\n` +
      `¿Continuar?`
    );
    
    if (confirmacion) {
      try {
        const itemIds = itemsListos.map(item => item.id);
        await completarInspeccionEnLote(itemIds);
        alert(`✅ ${itemsListos.length} items inspeccionados exitosamente`);
      } catch (error) {
        alert(`❌ Error al completar algunas inspecciones`);
      }
    }
  };

  // Función para manejar el escaneo de items
  const handleScanItem = async (item: any) => {
    try {
      console.log(`🔍 Procesando escaneo para item ${item.nombre_unidad}...`);
      
      // Usar la función especializada para escaneo que no requiere validaciones previas
      await completarInspeccionPorEscaneo(item.id);
      
      console.log(`✅ Item ${item.nombre_unidad} inspeccionado exitosamente mediante escaneo`);
    } catch (error) {
      console.error('Error al procesar item escaneado:', error);
      // Mostrar error al usuario
      alert(`❌ Error al procesar item ${item.nombre_unidad}: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  };

  // Componente para renderizar un item de inspección
  const ItemInspeccionCard: React.FC<{ item: ItemInspeccion }> = ({ item }) => {
    const { limpieza, goteo, desinfeccion } = item.validaciones!;
    const isCompleto = limpieza && goteo && desinfeccion;

    // Obtener tiempo restante del cronómetro de inspección (si existe)
    const normalize = (s: string | null | undefined) => (s ?? '')
      .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
    const claveNombre = normalize(item.nombre_unidad);
    const etiquetaTiempo = tiempoPorId.get(item.id) || tiempoPorNombre.get(claveNombre);
    const estaVencido = vencidoPorId.get(item.id) === true;

    const getCategoriaColor = (categoria: string) => {
      switch (categoria) {
        case 'Cube': return 'bg-blue-50 border-blue-200 text-blue-800';
        case 'VIP': return 'bg-purple-50 border-purple-200 text-purple-800';
        case 'TIC': return 'bg-yellow-50 border-yellow-200 text-yellow-800';
  default: return 'bg-white border-gray-200 text-gray-800';
      }
    };

  return (
      <div className={`bg-white rounded-lg p-4 border-2 ${isCompleto ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <Package className="h-5 w-5 text-gray-600" />
            <div>
              <h4 className="text-sm font-medium text-gray-900">{item.nombre_unidad}</h4>
              <p className="text-xs text-gray-600">Lote: {item.lote} • RFID: {item.rfid}</p>
              {etiquetaTiempo && (
                <p className={`text-xs flex items-center gap-1 ${estaVencido ? 'text-red-600' : 'text-blue-600'}`}>
                  <Clock className="h-3 w-3" />
                  {estaVencido ? `Vencido` : `Restante: ${etiquetaTiempo}`}
                </p>
              )}
            </div>
          </div>
          <span className={`px-2 py-1 rounded text-xs font-medium border ${getCategoriaColor(item.categoria)}`}>
            {item.categoria}
          </span>
        </div>

        {/* Validaciones */}
        <div className="space-y-2 mb-3">
          {/* Limpieza */}
          <div className="flex items-center justify-between select-none">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-gray-700">Limpieza</span>
            </div>
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={limpieza}
                onChange={(e) => handleValidacionChange(item.id, 'limpieza', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">Hecho</span>
            </label>
          </div>

          {/* Prueba de Goteo */}
          <div className="flex items-center justify-between select-none">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-green-500" />
              <span className="text-sm text-gray-700">Prueba de Goteo</span>
            </div>
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={goteo}
                onChange={(e) => handleValidacionChange(item.id, 'goteo', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span className="ml-2 text-sm text-gray-700">Hecho</span>
            </label>
          </div>

          {/* Desinfección */}
          <div className="flex items-center justify-between select-none">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-purple-500" />
              <span className="text-sm text-gray-700">Desinfección</span>
            </div>
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={desinfeccion}
                onChange={(e) => handleValidacionChange(item.id, 'desinfeccion', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <span className="ml-2 text-sm text-gray-700">Hecho</span>
            </label>
          </div>
        </div>

        {/* Botón de completar inspección */}
        <button
          onClick={() => handleCompletarInspeccion(item.id)}
          disabled={!isCompleto}
          className={`w-full py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            isCompleto
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-white text-gray-500 cursor-not-allowed'
          }`}
        >
          {isCompleto ? (
            <>
              <CheckCircle className="w-4 h-4 inline mr-2" />
              Completar Inspección
            </>
          ) : (
            'Completar todas las validaciones'
          )}
        </button>
      </div>
    );
  };

  if (cargando) {
    return (
  <div className="flex-1 overflow-hidden bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando items para inspección...</p>
        </div>
      </div>
    );
  }

  return (
  <div className="flex-1 overflow-hidden bg-white">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Inspección</h1>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Instrucciones */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-blue-900 mb-2">Proceso de Inspección</h2>
          <ol className="list-decimal list-inside space-y-1 text-blue-800">
            <li>Los items aparecerán aquí solo cuando en Devolución se elija “Pasar a Inspección”.</li>
            <li>Realizar validación: limpieza, prueba de goteo y desinfección.</li>
            <li>Marcar cada validación completada con los checkboxes.</li>
            <li>Una vez completadas todas las validaciones, finalizar la inspección.</li>
          </ol>
        </div>

        {/* Items Pendientes de Inspección - Agrupados por Categoría */}
        <div className="bg-white rounded-lg border border-orange-200 overflow-hidden">
          <div className="bg-orange-50 border-b border-orange-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-orange-800">Items Pendientes de Inspección</h2>
                <p className="text-sm text-orange-600">({itemsParaInspeccion.length} items para inspeccionar)</p>
              </div>
              {/* Botones de acción para inspección */}
              <div className="flex items-center gap-2">
                {/* Agregar Items desde la fase previa (Devolución) */}
                <button
                  onClick={() => setMostrarModalSeleccion(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
                  title="Agregar items desde Devolución"
                >
                  <Package className="w-4 h-4" />
                  Agregar Items
                </button>
                {/* Botón de escaneo RFID - Siempre visible */}
                <button
                  onClick={() => setMostrarModalEscaneo(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
                  title="Escanear items para inspección masiva"
                >
                  <Scan className="w-4 h-4" />
                  Escaneo Masivo
                  {itemsEscaneados.length > 0 && (
                    <span className="bg-blue-800 text-xs px-2 py-0.5 rounded-full">
                      {itemsEscaneados.length}
                    </span>
                  )}
                </button>
                
                {/* Botón para procesar cola de escaneos */}
                {colaEscaneos.length > 0 && (
                  <button
                    onClick={procesarColaEscaneos}
                    disabled={procesandoEscaneos}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-md hover:bg-orange-700 disabled:bg-orange-400 transition-colors"
                    title={`Procesar ${colaEscaneos.length} items escaneados`}
                  >
                    {procesandoEscaneos ? (
                      <Clock className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )}
                    {procesandoEscaneos ? 'Procesando...' : `Procesar ${colaEscaneos.length}`}
                  </button>
                )}
                
                {/* Botón para completar todas las inspecciones válidas - Solo cuando hay items válidos */}
                {itemsParaInspeccion.some(isItemListoParaInspeccion) && (
                  <button
                    onClick={handleCompletarTodasLasInspecciones}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors"
                    title="Completar todas las inspecciones válidas"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Completar Todas las Válidas
                  </button>
                )}
              </div>
            </div>
          </div>

          {itemsParaInspeccion.length === 0 ? (
            <div className="p-6">
              <div className="text-center py-8 text-gray-500">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No hay items pendientes de inspección</p>
                <p className="text-sm text-gray-400 mt-1">
                  Los items aparecerán aquí cuando en Devolución se decida “Pasar a Inspección”.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Cubes */}
              {cubesParaInspeccion.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-blue-600" />
                    <h3 className="font-semibold text-blue-900">Cubes</h3>
                    <span className="bg-blue-200 text-blue-800 px-2 py-1 rounded text-sm font-medium">
                      {cubesParaInspeccion.length}
                    </span>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {cubesParaInspeccion.map((item) => (
                      <ItemInspeccionCard key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              )}

              {/* VIPs */}
              {vipsParaInspeccion.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-purple-600" />
                    <h3 className="font-semibold text-purple-900">VIPs</h3>
                    <span className="bg-purple-200 text-purple-800 px-2 py-1 rounded text-sm font-medium">
                      {vipsParaInspeccion.length}
                    </span>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {vipsParaInspeccion.map((item) => (
                      <ItemInspeccionCard key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              )}

              {/* TICs */}
              {ticsParaInspeccion.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-yellow-600" />
                    <h3 className="font-semibold text-yellow-900">TICs</h3>
                    <span className="bg-yellow-200 text-yellow-800 px-2 py-1 rounded text-sm font-medium">
                      {ticsParaInspeccion.length}
                    </span>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {ticsParaInspeccion.map((item) => (
                      <ItemInspeccionCard key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Items Inspeccionados */}
        <div className="bg-white rounded-lg shadow border border-gray-200">
          <div className="bg-green-50 border-b border-green-200 px-6 py-4">
            <h3 className="text-lg font-semibold text-green-800 flex items-center">
              <CheckCircle className="h-5 w-5 mr-2" />
              Items Inspeccionados
              <span className="ml-2 bg-green-100 text-green-800 px-2 py-1 rounded text-sm">
                {itemsInspeccionados.length}
              </span>
            </h3>
          </div>
          <div className="p-6">
            {itemsInspeccionados.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No hay items inspeccionados</p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {itemsInspeccionadosPaginados.map((item) => (
                    <div key={item.id} className="bg-green-50 rounded-lg p-3 flex items-center justify-between border border-green-200">
                      <div className="flex items-center space-x-3">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        <div>
                          <h4 className="text-sm font-medium text-gray-900">{item.nombre_unidad}</h4>
                          <p className="text-xs text-gray-600">Lote: {item.lote} • RFID: {item.rfid}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-green-600 font-medium bg-green-100 px-2 py-1 rounded">
                          {item.categoria}
                        </span>
                        <span className="text-xs text-green-600 font-medium bg-green-100 px-2 py-1 rounded">
                          Inspeccionado
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Paginación para items inspeccionados */}
                {totalPaginas > 1 && (
                  <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
                    <div className="text-sm text-gray-700">
                      Mostrando {indiceInicio + 1} a {Math.min(indiceFin, itemsInspeccionados.length)} de {itemsInspeccionados.length} items
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPaginaActual(prev => Math.max(1, prev - 1))}
                        disabled={paginaActual === 1}
                        className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Anterior
                      </button>
                      <span className="text-sm text-gray-600">
                        Página {paginaActual} de {totalPaginas}
                      </span>
                      <button
                        onClick={() => setPaginaActual(prev => Math.min(totalPaginas, prev + 1))}
                        disabled={paginaActual === totalPaginas}
                        className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
              <p className="text-red-800">{error}</p>
            </div>
          </div>
        )}
      </div>

      {/* Modal de escaneo RFID */}
      <InspeccionScanModal
        isOpen={mostrarModalEscaneo}
        onClose={() => setMostrarModalEscaneo(false)}
        onScanItem={handleScanItem}
        itemsDisponibles={itemsParaInspeccion}
        itemsEscaneados={itemsEscaneados}
        procesandoEscaneos={procesandoEscaneos}
      />

      {/* Modal de Selección de Items desde Devolución (mismo diseño que otros) */}
      {mostrarModalSeleccion && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl w-[92vw] max-w-md sm:max-w-2xl md:max-w-4xl max-h-[88vh] overflow-hidden flex flex-col">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-gray-800">Seleccionar items para Inspección</h2>
                <p className="text-xs sm:text-sm text-gray-600 mt-1 sm:mt-2">Disponibles: {itemsPreviosElegibles.length}</p>
              </div>
              <button
                onClick={() => {
                  setMostrarModalSeleccion(false);
                  setItemsSeleccionadosModal([]);
                  setModalBusqueda('');
                }}
                aria-label="Cerrar"
                className="text-gray-500 hover:text-gray-700 p-1 -mt-1"
                title="Cerrar"
              >
                <span className="text-xl leading-none">×</span>
              </button>
            </div>
            <div className="p-4 sm:p-6 flex flex-col gap-4 sm:gap-6 flex-1 overflow-y-auto">
              {/* Búsqueda y tiempo */}
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Buscar por RFID o nombre..."
                    value={modalBusqueda}
                    onChange={(e) => setModalBusqueda(e.target.value)}
                    maxLength={24}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-600 mb-1">Tiempo de inspección (obligatorio)</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={0}
                        placeholder="Horas"
                        value={horasInspeccion}
                        onChange={(e) => setHorasInspeccion(e.target.value.replace(/[^0-9]/g, ''))}
                        className="w-24 px-3 py-2 border rounded-md text-sm"
                      />
                      <input
                        type="number"
                        min={0}
                        max={59}
                        placeholder="Minutos"
                        value={minutosInspeccion}
                        onChange={(e) => setMinutosInspeccion(e.target.value.replace(/[^0-9]/g, ''))}
                        className="w-28 px-3 py-2 border rounded-md text-sm"
                      />
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">Debes ingresar horas y/o minutos para crear el cronómetro de inspección.</div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                  <button
                    onClick={() => setItemsSeleccionadosModal(itemsFiltradosModal.map((i: any) => i.id))}
                    className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded"
                  >
                    Seleccionar todos ({itemsFiltradosModal.length})
                  </button>
                  <button
                    onClick={() => setItemsSeleccionadosModal([])}
                    className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded"
                  >
                    Limpiar selección
                  </button>
                  <span className="text-gray-600">{itemsSeleccionadosModal.length} seleccionado(s)</span>
                </div>
              </div>

              {/* Lista */}
              <div className="space-y-2 max-h-[50vh] sm:max-h-[55vh] overflow-y-auto pr-1">
                {itemsFiltradosModal.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    <Package className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-gray-400" />
                    <p>No hay items que coincidan con la búsqueda</p>
                  </div>
                ) : (
                  itemsFiltradosModal.map((item: any) => {
                    const selected = itemsSeleccionadosModal.includes(item.id);
                    return (
                      <div
                        key={item.id}
                        onClick={() => setItemsSeleccionadosModal(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])}
                        className={`p-3 border rounded cursor-pointer transition-all ${selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                      >
                        <div className="flex items-start gap-3">
                          <input type="checkbox" checked={selected} onChange={() => {}} className="mt-0.5 rounded" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`px-2 py-0.5 text-[11px] rounded ${
                                item.categoria === 'TIC' ? 'bg-yellow-100 text-yellow-800' :
                                item.categoria === 'VIP' ? 'bg-purple-100 text-purple-800' :
                                item.categoria === 'Cube' ? 'bg-blue-100 text-blue-800' :
                                'bg-orange-100 text-orange-800'
                              }`}>
                                {item.categoria}
                              </span>
                              <span className="font-medium text-sm truncate" title={item.nombre_unidad}>{item.nombre_unidad}</span>
                            </div>
                            <div className="text-xs text-gray-600 mt-1 break-words">
                              <span className="mr-2">RFID: {item.rfid || 'N/A'}</span>
                              {item.lote && <span className="mr-2">Lote: {item.lote}</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 sm:p-6 border-t border-gray-200 flex items-center justify-end gap-2 sm:gap-3">
              <button
                onClick={() => {
                  setMostrarModalSeleccion(false);
                  setItemsSeleccionadosModal([]);
                  setModalBusqueda('');
                  setHorasInspeccion('');
                  setMinutosInspeccion('');
                }}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  if (itemsSeleccionadosModal.length === 0) return;
                  const h = parseInt(horasInspeccion || '0', 10);
                  const m = parseInt(minutosInspeccion || '0', 10);
                  const totalMin = (Number.isNaN(h) ? 0 : h) * 60 + (Number.isNaN(m) ? 0 : m);
                  if (totalMin <= 0) { alert('Debes ingresar un tiempo de inspección.'); return; }
                  const nombres: Record<number,string> = {};
                  itemsPreviosElegibles.forEach((i: any) => { if (itemsSeleccionadosModal.includes(i.id)) nombres[i.id] = i.nombre_unidad; });
                  await pasarItemsAInspeccion(itemsSeleccionadosModal, nombres, totalMin);
                  await cargarItemsParaInspeccion();
                  setMostrarModalSeleccion(false);
                  setItemsSeleccionadosModal([]);
                  setModalBusqueda('');
                  setHorasInspeccion('');
                  setMinutosInspeccion('');
                }}
                disabled={itemsSeleccionadosModal.length === 0 || ((parseInt(horasInspeccion || '0', 10) * 60 + parseInt(minutosInspeccion || '0', 10)) <= 0)}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                Pasar a Inspección ({itemsSeleccionadosModal.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
