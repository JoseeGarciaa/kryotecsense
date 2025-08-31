import React, { useState, useEffect, useMemo } from 'react';
import { Package, Scan, CheckCircle, AlertCircle } from 'lucide-react';
import { useDevolucion } from '../hooks/useDevolucion';
import { DevolucionScanModal } from './DevolucionScanModal';
import { useTimerContext } from '../../../contexts/TimerContext';
import InlineCountdown from '../../../shared/components/InlineCountdown';

export const Devolucion: React.FC = () => {
  const {
    itemsDevolucion,
    itemsDevueltos,
    cargando,
    error,
    cargarItemsDevolucion,
    marcarComoDevuelto,
    marcarItemsComoDevueltos
  } = useDevolucion();

  const [mostrarModal, setMostrarModal] = useState(false);
  const [paginaActual, setPaginaActual] = useState(1);
  const itemsPorPagina = 5;

  // Timers para mostrar la cuenta regresiva de Operación (96h)
  const { timers, formatearTiempo } = useTimerContext();

  // Mapa a info de tiempo (segundos + fecha fin) para InlineCountdown, tolerante a "Envio/Envío" y variaciones
  const { infoPorId, infoPorNombre } = useMemo(() => {
    const normalize = (s: string) =>
      s
        ?.normalize('NFD')
        // Remover marcas diacríticas (combining marks) sin usar \p{...} por compatibilidad
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim() ?? '';

    const extractFromNombre = (nombre: string): { id?: number; base: string } => {
      // Normalizar para comparar sin acentos y en minúsculas
      const n = normalize(nombre);
      // Acepta "envio" con o sin #ID y guión: "envio #123 - foo" | "envio foo"
      const re = /^envio\s+(?:#(\d+)\s*-\s*)?(.*)$/i;
      const m = n.match(re);
      if (m) {
        const id = m[1] ? Number(m[1]) : undefined;
        const base = (m[2] || '').trim();
        return { id, base };
      }
      return { base: n };
    };

    const infoPorId = new Map<number, { seconds: number; endTime: Date }>();
    const infoPorNombre = new Map<string, { seconds: number; endTime: Date }>();

    for (const t of timers) {
      if (t.tipoOperacion === 'envio' && t.activo && !t.completado) {
        const data = { seconds: t.tiempoRestanteSegundos, endTime: t.fechaFin };
  const { id, base } = extractFromNombre(t.nombre);
        if (typeof id === 'number' && !Number.isNaN(id)) {
          infoPorId.set(id, data);
        }
  const normBase = normalize(base);
        if (normBase) infoPorNombre.set(normBase, data);
        // También indexar por el nombre completo normalizado como respaldo
  const normFull = normalize(t.nombre);
        if (normFull && !infoPorNombre.has(normFull)) infoPorNombre.set(normFull, data);
      }
    }
    return { infoPorId, infoPorNombre };
  }, [timers]);

  useEffect(() => {
    cargarItemsDevolucion();
  }, [cargarItemsDevolucion]);

  // Resetear página cuando cambien los items devueltos
  useEffect(() => {
    setPaginaActual(1);
  }, [itemsDevueltos.length]);

  const handleScanItem = (item: any) => {
    console.log('Escaneando item:', item);
    setMostrarModal(true);
  };

  const handleConfirmarDevolucion = async (itemsEscaneados: any[]) => {
    try {
      // Procesar todos los items en lote (una sola operación)
      const itemIds = itemsEscaneados.map(item => item.id);
      await marcarItemsComoDevueltos(itemIds);
      setMostrarModal(false);
      // No necesitamos recargar aquí, el hook ya lo hace
    } catch (error) {
      console.error('Error al confirmar devolución:', error);
    }
  };

  if (cargando) {
    return (
  <div className="flex-1 overflow-hidden bg-white">
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Devolución</h1>
        </div>
        <div className="flex-1 overflow-auto p-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Cargando items...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
  <div className="flex-1 overflow-hidden bg-white">
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Devolución</h1>
        </div>
        <div className="flex-1 overflow-auto p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
              <p className="text-red-800">Error: {error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Agrupar items por categoría
  const cubesPendientes = itemsDevolucion.filter(item => item.categoria === 'Cube');
  const vipsPendientes = itemsDevolucion.filter(item => item.categoria === 'VIP');
  const ticsPendientes = itemsDevolucion.filter(item => item.categoria === 'TIC');

  const cubesDevueltos = itemsDevueltos.filter(item => item.categoria === 'Cube');
  const vipsDevueltos = itemsDevueltos.filter(item => item.categoria === 'VIP');
  const ticsDevueltos = itemsDevueltos.filter(item => item.categoria === 'TIC');

  return (
  <div className="flex-1 overflow-hidden bg-white">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Gestión de Devolución</h1>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* Instrucciones */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4">
          <h2 className="text-base sm:text-lg font-semibold text-blue-900 mb-2">Proceso de Devolución</h2>
          <ol className="list-decimal list-inside space-y-1 text-blue-800 text-sm">
            <li>Los items completados en operación aparecen automáticamente como pendientes de devolución</li>
            <li>Separar físicamente los Cubes, VIPs y TICs que han llegado a bodega</li>
            <li>Usar el botón "Escanear Items" para confirmar la devolución</li>
          </ol>
        </div>

        {/* Items Pendientes de Devolución - Agrupados por Categoría */}
        <div className="bg-white rounded-lg border border-orange-200 overflow-hidden">
          <div className="bg-orange-50 border-b border-orange-200 px-3 sm:px-6 py-3 sm:py-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-orange-800">Items Pendientes de Devolución</h2>
                <p className="text-xs sm:text-sm text-orange-600">({itemsDevolucion.length} items listos para devolver)</p>
              </div>
              {/* Botones de acción para items pendientes */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                {/* Botón de escaneo RFID - Siempre visible */}
                <button
                  onClick={() => setMostrarModal(true)}
                  className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-3 sm:px-4 py-2 bg-blue-600 text-white text-xs sm:text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
                  title="Escanear items para devolver"
                >
                  <Scan className="w-4 h-4" />
                  Escanear Items
                </button>
                
                {/* Botón para devolver todos los items en lote - Solo cuando hay items */}
                {itemsDevolucion.length > 0 && (
                  <button
                    onClick={() => {
                      const confirmacion = window.confirm(
                        `¿Estás seguro de que quieres devolver todos los ${itemsDevolucion.length} items?\n\n` +
                        `Esto marcará todos los items como devueltos sin necesidad de escanear individualmente.\n\n` +
                        `¿Continuar?`
                      );
                      
                      if (confirmacion) {
                        const itemIds = itemsDevolucion.map(item => item.id);
                        marcarItemsComoDevueltos(itemIds);
                      }
                    }}
                    className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-3 sm:px-4 py-2 bg-green-600 text-white text-xs sm:text-sm font-medium rounded-md hover:bg-green-700 transition-colors"
                    title="Devolver todos los items en lote"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Devolver Todos
                  </button>
                )}
              </div>
            </div>
          </div>

          {itemsDevolucion.length === 0 ? (
            <div className="p-4 sm:p-6">
              <div className="text-center py-8 text-gray-500">
                <Package className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-50" />
                <p>No hay items pendientes de devolución</p>
              </div>
            </div>
          ) : (
            <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
              {/* Cubes */}
              {cubesPendientes.length > 0 && (
                <div className="bg-blue-50 rounded-lg border border-blue-200 overflow-hidden">
                  <div className="bg-blue-100 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-blue-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Package className="h-5 w-5 text-blue-600" />
                        <h3 className="font-semibold text-blue-900">Cubes</h3>
                        <span className="bg-blue-200 text-blue-800 px-2 py-0.5 rounded text-xs sm:text-sm font-medium">
                          {cubesPendientes.length}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 sm:p-4 space-y-2">
                    {cubesPendientes.map((item) => (
                      <div key={item.id} className="bg-white rounded-lg p-3 flex items-center justify-between border border-blue-200">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <Package className="h-4 w-4 text-blue-600" />
                          <div>
                            <h4 className="text-sm font-medium text-gray-900">{item.nombre_unidad}</h4>
                            <p className="text-xs text-gray-600 break-all">Lote: {item.lote} • RFID: {item.rfid || 'N/A'}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[10px] sm:text-xs text-blue-600 font-medium bg-blue-100 px-2 py-0.5 rounded">Pendiente</span>
                          {(() => {
                            const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
                            const info = infoPorId.get(item.id) 
                              || infoPorNombre.get(normalize(item.nombre_unidad))
                              || (item.rfid ? infoPorNombre.get(normalize(item.rfid)) : undefined);
                            if (!info) return null;
                            return (
                              <span className="text-[10px] sm:text-xs text-gray-700 font-semibold bg-gray-100 px-2 py-0.5 rounded" title="Tiempo restante de operación (96h)">
                                ⏱ <InlineCountdown endTime={info.endTime} seconds={info.seconds} format={formatearTiempo} />
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* VIPs */}
              {vipsPendientes.length > 0 && (
                <div className="bg-green-50 rounded-lg border border-green-200 overflow-hidden">
                  <div className="bg-green-100 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-green-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Package className="h-5 w-5 text-green-600" />
                        <h3 className="font-semibold text-green-900">VIPs</h3>
                        <span className="bg-green-200 text-green-800 px-2 py-0.5 rounded text-xs sm:text-sm font-medium">
                          {vipsPendientes.length}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 sm:p-4 space-y-2">
                    {vipsPendientes.map((item) => (
                      <div key={item.id} className="bg-white rounded-lg p-3 flex items-center justify-between border border-green-200">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <Package className="h-4 w-4 text-green-600" />
                          <div>
                            <h4 className="text-sm font-medium text-gray-900">{item.nombre_unidad}</h4>
                            <p className="text-xs text-gray-600 break-all">Lote: {item.lote} • RFID: {item.rfid || 'N/A'}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[10px] sm:text-xs text-green-600 font-medium bg-green-100 px-2 py-0.5 rounded">Pendiente</span>
                          {(() => {
                            const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
                            const info = infoPorId.get(item.id) 
                              || infoPorNombre.get(normalize(item.nombre_unidad))
                              || (item.rfid ? infoPorNombre.get(normalize(item.rfid)) : undefined);
                            if (!info) return null;
                            return (
                              <span className="text-[10px] sm:text-xs text-gray-700 font-semibold bg-gray-100 px-2 py-0.5 rounded" title="Tiempo restante de operación (96h)">
                                ⏱ <InlineCountdown endTime={info.endTime} seconds={info.seconds} format={formatearTiempo} />
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TICs */}
              {ticsPendientes.length > 0 && (
                <div className="bg-yellow-50 rounded-lg border border-yellow-200 overflow-hidden">
                  <div className="bg-yellow-100 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-yellow-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Package className="h-5 w-5 text-yellow-600" />
                        <h3 className="font-semibold text-yellow-900">TICs</h3>
                        <span className="bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded text-xs sm:text-sm font-medium">
                          {ticsPendientes.length}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 sm:p-4 space-y-2">
                    {ticsPendientes.map((item) => (
                      <div key={item.id} className="bg-white rounded-lg p-3 flex items-center justify-between border border-yellow-200">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <Package className="h-4 w-4 text-yellow-600" />
                          <div>
                            <h4 className="text-sm font-medium text-gray-900">{item.nombre_unidad}</h4>
                            <p className="text-xs text-gray-600 break-all">Lote: {item.lote} • RFID: {item.rfid || 'N/A'}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[10px] sm:text-xs text-yellow-600 font-medium bg-yellow-100 px-2 py-0.5 rounded">Pendiente</span>
                          {(() => {
                            const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '',).toLowerCase().trim();
                            const info = infoPorId.get(item.id) 
                              || infoPorNombre.get(normalize(item.nombre_unidad))
                              || (item.rfid ? infoPorNombre.get(normalize(item.rfid)) : undefined);
                            if (!info) return null;
                            return (
                              <span className="text-[10px] sm:text-xs text-gray-700 font-semibold bg-gray-100 px-2 py-0.5 rounded" title="Tiempo restante de operación (96h)">
                                ⏱ <InlineCountdown endTime={info.endTime} seconds={info.seconds} format={formatearTiempo} />
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Items Devueltos */}
        <div className="bg-white rounded-lg shadow border border-gray-200">
          <div className="bg-green-50 border-b border-green-200 px-4 sm:px-6 py-3 sm:py-4">
            <h3 className="text-base sm:text-lg font-semibold text-green-800 flex items-center">
              <CheckCircle className="h-5 w-5 mr-2" />
              Items Devueltos
              <span className="ml-2 bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs sm:text-sm">
                {itemsDevueltos.length}
              </span>
            </h3>
          </div>
          <div className="p-3 sm:p-6">
            {itemsDevueltos.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No hay items devueltos</p>
              </div>
            ) : (
              <>
                {/* Resumen agrupado por categoría */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
                  <div className="bg-blue-50 rounded-lg p-3 sm:p-4 text-center">
                    <Package className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                    <h4 className="font-semibold text-blue-900">Cubes</h4>
                    <p className="text-2xl font-bold text-blue-800">
                      {itemsDevueltos.filter(item => item.categoria === 'Cube').length}
                    </p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 sm:p-4 text-center">
                    <Package className="h-8 w-8 text-green-600 mx-auto mb-2" />
                    <h4 className="font-semibold text-green-900">VIPs</h4>
                    <p className="text-2xl font-bold text-green-800">
                      {itemsDevueltos.filter(item => item.categoria === 'VIP').length}
                    </p>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-3 sm:p-4 text-center">
                    <Package className="h-8 w-8 text-yellow-600 mx-auto mb-2" />
                    <h4 className="font-semibold text-yellow-900">TICs</h4>
                    <p className="text-2xl font-bold text-yellow-800">
                      {itemsDevueltos.filter(item => item.categoria === 'TIC').length}
                    </p>
                  </div>
                </div>
                
                {/* Lista paginada de items devueltos */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <h4 className="font-medium text-gray-900">Items devueltos:</h4>
                    <span className="text-xs sm:text-sm text-gray-500">
                      {itemsDevueltos.length} total{itemsDevueltos.length !== 1 ? 'es' : ''}
                    </span>
                  </div>
                  
                  {(() => {
                    const totalPaginas = Math.ceil(itemsDevueltos.length / itemsPorPagina);
                    const indiceInicio = (paginaActual - 1) * itemsPorPagina;
                    const indiceFin = indiceInicio + itemsPorPagina;
                    const itemsPaginaActual = itemsDevueltos.slice(indiceInicio, indiceFin);
                    
                    return (
                      <>
                        {itemsPaginaActual.map((item) => {
                          // Timer visible también en devueltos
                          const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
                          const info = infoPorId.get(item.id) 
                            || infoPorNombre.get(normalize(item.nombre_unidad))
                            || (item.rfid ? infoPorNombre.get(normalize(item.rfid)) : undefined);
                          const secs = info?.seconds ?? 0;
                          const puedeRegresarAOpe = secs >= 48*3600; // 48h

                          return (
                            <div key={item.id} className="bg-green-50 rounded-lg p-3 flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <CheckCircle className="h-4 w-4 text-green-600" />
                                <div>
                                  <h4 className="text-sm font-medium text-gray-900">{item.nombre_unidad}</h4>
                                  <p className="text-xs text-gray-600">{item.categoria} • Lote: {item.lote}</p>
                                  <div className="mt-1 flex items-center gap-2">
                                    <span className="text-[10px] sm:text-xs text-green-700 font-medium bg-green-100 px-2 py-0.5 rounded">Devuelto</span>
                                    {info && (
                                      <span className="text-[10px] sm:text-xs text-gray-700 font-semibold bg-gray-100 px-2 py-0.5 rounded" title="Tiempo de operación restante">
                                        ⏱ <InlineCountdown endTime={info.endTime} seconds={info.seconds} format={formatearTiempo} />
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                <button
                                  disabled={!puedeRegresarAOpe}
                                  title={puedeRegresarAOpe ? 'Regresar a Operación (continúa el tiempo)' : 'Disponible cuando queden ≥ 48h'}
                                  className={`px-3 py-1 text-xs rounded-md border ${puedeRegresarAOpe ? 'border-blue-300 text-blue-700 hover:bg-blue-50' : 'border-gray-200 text-gray-400 cursor-not-allowed'}`}
                                  onClick={() => {
                  if (!puedeRegresarAOpe) return;
                  const ok = window.confirm(`¿Regresar "${item.nombre_unidad}" a Operación?\n\nEl cronómetro continuará desde el tiempo actual.`);
                  if (!ok) return;
                  // Emitir evento para mover a operación; dejamos el timer activo
                  window.dispatchEvent(new CustomEvent('devolucion:regresar-operacion', { detail: { id: item.id, nombre: item.nombre_unidad } }));
                                  }}
                                >
                                  Regresar a Operación
                                </button>
                                <button
                                  className="px-3 py-1 text-xs rounded-md border border-purple-300 text-purple-700 hover:bg-purple-50"
                                  title="Pasar a Inspección (cancela el tiempo)"
                                  onClick={() => {
                  const ok = window.confirm(`¿Pasar "${item.nombre_unidad}" a Inspección?\n\nEsto cancelará el cronómetro de operación.`);
                  if (!ok) return;
                  window.dispatchEvent(new CustomEvent('devolucion:pasar-inspeccion', { detail: { id: item.id, nombre: item.nombre_unidad } }));
                                  }}
                                >
                                  Pasar a Inspección
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        
                        {/* Paginación */}
                        {totalPaginas > 1 && (
                          <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
                            <div className="text-sm text-gray-500">
                              Mostrando {indiceInicio + 1} a {Math.min(indiceFin, itemsDevueltos.length)} de {itemsDevueltos.length} items
                            </div>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => setPaginaActual(prev => Math.max(prev - 1, 1))}
                                disabled={paginaActual === 1}
                                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                ‹ Anterior
                              </button>
                              
                              <div className="flex items-center space-x-1">
                                {Array.from({ length: totalPaginas }, (_, i) => i + 1).map(numeroPagina => {
                                  // Mostrar solo algunas páginas alrededor de la actual
                                  if (
                                    numeroPagina === 1 ||
                                    numeroPagina === totalPaginas ||
                                    (numeroPagina >= paginaActual - 1 && numeroPagina <= paginaActual + 1)
                                  ) {
                                    return (
                                      <button
                                        key={numeroPagina}
                                        onClick={() => setPaginaActual(numeroPagina)}
                                        className={`px-3 py-1 text-sm border rounded-md ${
                                          paginaActual === numeroPagina
                                            ? 'bg-blue-600 text-white border-blue-600'
                                            : 'border-gray-300 hover:bg-white'
                                        }`}
                                      >
                                        {numeroPagina}
                                      </button>
                                    );
                                  } else if (
                                    numeroPagina === paginaActual - 2 ||
                                    numeroPagina === paginaActual + 2
                                  ) {
                                    return <span key={numeroPagina} className="px-2 text-gray-400">…</span>;
                                  }
                                  return null;
                                })}
                              </div>
                              
                              <button
                                onClick={() => setPaginaActual(prev => Math.min(prev + 1, totalPaginas))}
                                disabled={paginaActual === totalPaginas}
                                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Siguiente ›
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modal de escaneo */}
      {mostrarModal && (
        <DevolucionScanModal
          isOpen={mostrarModal}
          onClose={() => setMostrarModal(false)}
          itemsPendientes={itemsDevolucion}
          onConfirmar={handleConfirmarDevolucion}
        />
      )}
    </div>
  );
};
