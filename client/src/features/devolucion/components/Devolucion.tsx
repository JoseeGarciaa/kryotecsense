import React, { useState, useEffect, useMemo } from 'react';
import { Package, Scan, CheckCircle, AlertCircle } from 'lucide-react';
import TimerModal from '../../operacion/components/TimerModal';
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
    marcarItemsComoDevueltos,
    regresarItemsAOperacion,
    pasarItemsAInspeccion
  } = useDevolucion();

  const [mostrarModal, setMostrarModal] = useState(false);
  const [paginaActual, setPaginaActual] = useState(1);
  const itemsPorPagina = 5;
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<'Cube' | 'VIP' | 'TIC' | null>(null);
  const [seleccionados, setSeleccionados] = useState<Record<number, boolean>>({});
  const [mostrarModalTiempoInspeccion, setMostrarModalTiempoInspeccion] = useState(false);
  const [idsParaInspeccion, setIdsParaInspeccion] = useState<number[]>([]);
  const [nombresParaInspeccion, setNombresParaInspeccion] = useState<Record<number, string>>({});

  // Timers para mostrar la cuenta regresiva de Operación (96h)
  const { timers, formatearTiempo } = useTimerContext();

  // Mapa de tiempo ACTIVO (segundos + fecha fin) únicamente por ID de item
  const { infoPorId } = useMemo(() => {
    const normalize = (s: string | null | undefined) => {
      if (!s) return '';
      try {
        return s
          .normalize('NFD')
          // Remover marcas diacríticas (combining marks) sin usar \p{...} por compatibilidad
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim();
      } catch {
        return String(s).toLowerCase().trim();
      }
    };

    const extractFromNombre = (nombre: string | null | undefined): { id?: number; base: string } => {
      if (!nombre) return { base: '' };
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

    for (const t of timers) {
      if (t.tipoOperacion === 'envio' && t.activo && !t.completado) {
        const data = { seconds: t.tiempoRestanteSegundos, endTime: t.fechaFin };
        const { id, base } = extractFromNombre(t.nombre);
        if (typeof id === 'number' && !Number.isNaN(id)) {
          infoPorId.set(id, data);
        }
      }
    }
    return { infoPorId };
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

  // Agrupar items por categoría (pendientes para devolver o ya devueltos, según tablero)
  const cubesPendientes = itemsDevolucion.filter(item => item.categoria === 'Cube');
  const vipsPendientes = itemsDevolucion.filter(item => item.categoria === 'VIP');
  const ticsPendientes = itemsDevolucion.filter(item => item.categoria === 'TIC');

  const cubesDevueltos = itemsDevueltos.filter(item => item.categoria === 'Cube');
  const vipsDevueltos = itemsDevueltos.filter(item => item.categoria === 'VIP');
  const ticsDevueltos = itemsDevueltos.filter(item => item.categoria === 'TIC');

  // Datos del panel de Items Devueltos (siempre visibles con conteo 0)
  const resumenDevueltos = [
    { key: 'Cube' as const, titulo: 'Cubes', color: 'text-blue-800', bg: 'bg-blue-50', count: cubesDevueltos.length },
    { key: 'VIP' as const, titulo: 'VIPs', color: 'text-green-800', bg: 'bg-green-50', count: vipsDevueltos.length },
    { key: 'TIC' as const, titulo: 'TICs', color: 'text-yellow-800', bg: 'bg-yellow-50', count: ticsDevueltos.length },
  ];

  const itemsDevueltosDeCategoria = useMemo(() => {
    if (categoriaSeleccionada === 'Cube') return cubesDevueltos;
    if (categoriaSeleccionada === 'VIP') return vipsDevueltos;
    if (categoriaSeleccionada === 'TIC') return ticsDevueltos;
    return [];
  }, [categoriaSeleccionada, cubesDevueltos, vipsDevueltos, ticsDevueltos]);

  const toggleSeleccion = (id: number) => {
    setSeleccionados(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const seleccionarTodos = (valor: boolean) => {
    const map: Record<number, boolean> = {};
    itemsDevueltosDeCategoria.forEach(i => { map[i.id] = valor; });
    setSeleccionados(map);
  };

  return (
  <div className="flex-1 overflow-hidden bg-white">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Gestión de Devolución</h1>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* Estados de carga y error sin cortar el flujo de hooks */}
        {cargando && (
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-center h-48">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Cargando items...</p>
              </div>
            </div>
          </div>
        )}
        {error && !cargando && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
              <p className="text-red-800">Error: {error}</p>
            </div>
          </div>
        )}

  {/* No mostrar el resto del contenido mientras carga o con error */}
  {(cargando || error) ? null : (
  <>
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
                            // Mostrar cuenta solo si hay cronómetro ACTIVO asociado por ID (evita confusiones por nombres repetidos)
                            const info = infoPorId.get(item.id);
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
                            const info = infoPorId.get(item.id);
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
                            const info = infoPorId.get(item.id);
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

  {/* Items Devueltos - Siempre visibles con conteo y navegables por categoría */}
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
          <div className="p-3 sm:p-6 space-y-4">
            {/* Resumen por categoría (clickeable) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
              {resumenDevueltos.map(card => (
                <button
                  key={card.key}
                  onClick={() => {
                    setCategoriaSeleccionada(prev => (prev === card.key ? null : card.key));
                    setSeleccionados({});
                  }}
                  className={`rounded-lg p-3 sm:p-4 text-center border transition-colors ${card.bg} ${categoriaSeleccionada === card.key ? 'ring-2 ring-offset-1 ring-green-400' : 'border-transparent hover:border-gray-200'}`}
                  title={`Ver ${card.titulo} devueltos`}
                >
                  <Package className={`h-8 w-8 mx-auto mb-2 ${card.color.replace('text-', 'text-')}`} />
                  <h4 className={`font-semibold ${card.color.replace('text-', 'text-')}`}>{card.titulo}</h4>
                  <p className={`text-2xl font-bold ${card.color}`}>{card.count}</p>
                </button>
              ))}
            </div>

            {/* Panel de la categoría seleccionada */}
            {categoriaSeleccionada && (
              <div className="mt-2 border rounded-lg">
                <div className="flex items-center justify-between p-3 bg-gray-50 border-b rounded-t-lg">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{categoriaSeleccionada} devueltos</span>
                    <span className="text-xs text-gray-500">{itemsDevueltosDeCategoria.length} items</span>
                  </div>
                  {itemsDevueltosDeCategoria.length > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-white"
                        onClick={() => seleccionarTodos(true)}
                      >Seleccionar todos</button>
                      <button
                        className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-white"
                        onClick={() => seleccionarTodos(false)}
                      >Limpiar</button>
                    </div>
                  )}
                </div>
                <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
                  {itemsDevueltosDeCategoria.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">No hay items devueltos en esta categoría</div>
                  ) : (
                    itemsDevueltosDeCategoria.map(item => (
                      <label key={item.id} className="flex items-center justify-between bg-green-50 border border-green-200 rounded p-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={!!seleccionados[item.id]}
                            onChange={() => toggleSeleccion(item.id)}
                          />
                          <div>
                            <div className="text-sm font-medium text-gray-900">{item.nombre_unidad}</div>
                            <div className="text-xs text-gray-600">Lote: {item.lote} • RFID: {item.rfid || 'N/A'}</div>
                          </div>
                        </div>
                        <span className="text-[10px] sm:text-xs text-green-700 font-medium bg-green-100 px-2 py-0.5 rounded">Devuelto</span>
                      </label>
                    ))
                  )}
                </div>
                {itemsDevueltosDeCategoria.length > 0 && (
                  <div className="p-3 border-t flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                    <div className="text-xs text-gray-600">
                      {Object.values(seleccionados).filter(Boolean).length} seleccionados
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="px-3 py-2 text-xs sm:text-sm rounded-md border border-blue-300 text-blue-700 hover:bg-blue-50"
                        onClick={async () => {
                          const ids = Object.entries(seleccionados).filter(([,v]) => v).map(([k]) => Number(k));
                          if (ids.length === 0) return;
                          const ok = window.confirm(`¿Regresar ${ids.length} item(s) a Operación?`);
                          if (!ok) return;
                          const nombres: Record<number,string> = {};
                          itemsDevueltosDeCategoria.forEach(i => { if (ids.includes(i.id)) nombres[i.id] = i.nombre_unidad; });
                          await regresarItemsAOperacion(ids, nombres);
                          setSeleccionados({});
                        }}
                      >Regresar a Operación</button>
                      <button
                        className="px-3 py-2 text-xs sm:text-sm rounded-md border border-purple-300 text-purple-700 hover:bg-purple-50"
                        onClick={() => {
                          const ids = Object.entries(seleccionados).filter(([,v]) => v).map(([k]) => Number(k));
                          if (ids.length === 0) return;
                          // Preparar datos y abrir modal estándar de tiempo (obligatorio)
                          const nombres: Record<number,string> = {};
                          itemsDevueltosDeCategoria.forEach(i => { if (ids.includes(i.id)) nombres[i.id] = i.nombre_unidad; });
                          setIdsParaInspeccion(ids);
                          setNombresParaInspeccion(nombres);
                          setMostrarModalTiempoInspeccion(true);
                        }}
                      >Pasar a Inspección</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
    </div>

  {/* Modal de tiempo para Inspección (estándar y obligatorio) */}
  <TimerModal
          mostrarModal={mostrarModalTiempoInspeccion}
          titulo="Tiempo de Inspección"
          descripcion="Define el tiempo de inspección para los items seleccionados. Este tiempo es obligatorio."
          tipoOperacion="inspeccion"
          initialMinutes={36 * 60}
          onCancelar={() => {
            setMostrarModalTiempoInspeccion(false);
          }}
          onConfirmar={async (tiempoMinutos) => {
            if (!idsParaInspeccion.length || tiempoMinutos <= 0) return;
            await pasarItemsAInspeccion(idsParaInspeccion, nombresParaInspeccion, tiempoMinutos);
            setSeleccionados({});
            setIdsParaInspeccion([]);
            setNombresParaInspeccion({});
            setMostrarModalTiempoInspeccion(false);
          }}
        />
  </>
  )}
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
