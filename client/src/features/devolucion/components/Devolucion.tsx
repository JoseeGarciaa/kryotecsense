import React, { useState, useEffect, useMemo } from 'react';
import { Package, CheckCircle, AlertCircle, Search } from 'lucide-react';
import TimerModal from '../../operacion/components/TimerModal';
import { useDevolucion } from '../hooks/useDevolucion';
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

  // Modal de selección “Agregar Items” (reemplaza escaneo)
  const [mostrarModalSeleccion, setMostrarModalSeleccion] = useState(false);
  const [modalBusqueda, setModalBusqueda] = useState('');
  const [itemsSeleccionadosModal, setItemsSeleccionadosModal] = useState<number[]>([]);
  const [paginaActual, setPaginaActual] = useState(1);
  const itemsPorPagina = 5;
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<'Cube' | 'VIP' | 'TIC' | null>(null);
  const [seleccionados, setSeleccionados] = useState<Record<number, boolean>>({});
  const [mostrarModalTiempoInspeccion, setMostrarModalTiempoInspeccion] = useState(false);
  const [idsParaInspeccion, setIdsParaInspeccion] = useState<number[]>([]);
  const [nombresParaInspeccion, setNombresParaInspeccion] = useState<Record<number, string>>({});
  // Umbral de tiempo para decidir si puede regresar a Operación o debe ir a Inspección
  const [limiteHoras, setLimiteHoras] = useState<string>('');
  const [limiteMinutos, setLimiteMinutos] = useState<string>('');
  const [mostrarEditorLimite, setMostrarEditorLimite] = useState(false);
  const [editHoras, setEditHoras] = useState<string>('');
  const [editMinutos, setEditMinutos] = useState<string>('');

  // Persistencia simple del umbral
  useEffect(() => {
    try {
      const raw = localStorage.getItem('devolucionThreshold');
      if (raw) {
        const { h, m } = JSON.parse(raw) as { h?: string; m?: string };
        if (typeof h === 'string') setLimiteHoras(h);
        if (typeof m === 'string') setLimiteMinutos(m);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('devolucionThreshold', JSON.stringify({ h: limiteHoras, m: limiteMinutos }));
    } catch {}
  }, [limiteHoras, limiteMinutos]);

  const thresholdSecs = useMemo(() => {
    const h = parseInt(limiteHoras || '0', 10);
    const m = parseInt(limiteMinutos || '0', 10);
    const total = (Number.isNaN(h) ? 0 : h) * 3600 + (Number.isNaN(m) ? 0 : m) * 60;
    return total > 0 ? total : 0;
  }, [limiteHoras, limiteMinutos]);

  // Timers para mostrar la cuenta regresiva de Operación (96h)
  const { timers, formatearTiempo } = useTimerContext();

  // Mapa por ID de item con: segundos restantes, fecha fin e inicio configurado (minutos)
  // Incluye timers activos y, si faltan, reconstruye desde localStorage (ETA) para conservar visibilidad
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

    const infoPorId = new Map<number, { seconds: number; endTime: Date; initialMinutes: number }>();

    // 1) Timers de envío presentes (activos o pausados con tiempo restante)
    for (const t of timers) {
      if (t.tipoOperacion !== 'envio') continue;
      if (t.completado) continue; // si ya venció, no aporta tiempo restante
      const { id } = extractFromNombre(t.nombre);
      if (typeof id === 'number' && !Number.isNaN(id)) {
        const seconds = Math.max(0, t.tiempoRestanteSegundos || 0);
        if (seconds >= 0) {
          infoPorId.set(id, {
            seconds,
            endTime: t.fechaFin,
            initialMinutes: t.tiempoInicialMinutos
          });
        }
      }
    }

    // 2) Fallback desde localStorage (kryotec_items_envio) cuando no hay timer asociado
    try {
      const raw = localStorage.getItem('kryotec_items_envio');
      if (raw) {
        const lista = JSON.parse(raw);
        if (Array.isArray(lista)) {
          const ahoraMs = Date.now();
          for (const it of lista) {
            const id = Number(it?.id);
            if (!id || Number.isNaN(id)) continue;
            if (infoPorId.has(id)) continue; // ya cubierto por timer
            const etaStr = it?.fechaEstimadaLlegada;
            const minutosIniciales = Number(it?.tiempoEnvio);
            if (!etaStr || Number.isNaN(minutosIniciales)) continue;
            const etaMs = new Date(etaStr).getTime();
            if (!Number.isFinite(etaMs)) continue;
            const remainingSec = Math.floor((etaMs - ahoraMs) / 1000);
            // Incluir aunque esté en 0 para mostrar que terminó; evitar negativos
            const seconds = Math.max(0, remainingSec);
            infoPorId.set(id, {
              seconds,
              endTime: new Date(etaMs),
              initialMinutes: Math.max(0, minutosIniciales | 0)
            });
          }
        }
      }
    } catch {}

    return { infoPorId };
  }, [timers]);

  useEffect(() => {
    cargarItemsDevolucion();
  }, [cargarItemsDevolucion]);

  // Resetear página cuando cambien los items devueltos
  useEffect(() => {
    setPaginaActual(1);
  }, [itemsDevueltos.length]);

  // Derivados del modal
  const itemsFiltradosModal = useMemo(() => {
    const term = modalBusqueda.toLowerCase();
    return itemsDevolucion.filter((item) =>
      (typeof item.nombre_unidad === 'string' && item.nombre_unidad.toLowerCase().includes(term)) ||
      (typeof item.rfid === 'string' && item.rfid.toLowerCase().includes(term))
    );
  }, [itemsDevolucion, modalBusqueda]);
  const toggleSeleccionItemModal = (itemId: number) => {
    setItemsSeleccionadosModal(prev => prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]);
  };
  const toggleSeleccionTodosModal = () => {
    const ids = itemsFiltradosModal.map(i => i.id);
    const all = ids.length > 0 && ids.every(id => itemsSeleccionadosModal.includes(id));
    setItemsSeleccionadosModal(all ? [] : ids);
  };
  const confirmarSeleccionModal = async () => {
    if (itemsSeleccionadosModal.length === 0) return;
    try {
      await marcarItemsComoDevueltos(itemsSeleccionadosModal);
      setMostrarModalSeleccion(false);
      setItemsSeleccionadosModal([]);
      setModalBusqueda('');
    } catch (e) {
      console.error('Error devolviendo items seleccionados:', e);
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
            <li>Usar el botón "Agregar Items" para seleccionar y confirmar la devolución</li>
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
                {/* Botón Agregar Items (modal de selección) */}
                <button
                  onClick={() => setMostrarModalSeleccion(true)}
                  className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-3 sm:px-4 py-2 bg-blue-600 text-white text-xs sm:text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
                  title="Agregar items para devolver"
                >
                  <Package className="w-4 h-4" />
                  Agregar Items
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
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 bg-gray-50 border-b rounded-t-lg">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{categoriaSeleccionada} devueltos</span>
                    <span className="text-xs text-gray-500">{itemsDevueltosDeCategoria.length} items</span>
                  </div>
                  {itemsDevueltosDeCategoria.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Umbral de decisión con botón */}
                      <div className="flex items-center gap-2">
                        {thresholdSecs > 0 && (
                          <span className="text-[11px] bg-gray-100 text-gray-700 px-2 py-1 rounded">
                            Límite: {Math.floor(thresholdSecs/3600)}h {Math.floor((thresholdSecs%3600)/60)}m
                          </span>
                        )}
                        <button
                          className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-white"
                          onClick={() => {
                            setEditHoras(limiteHoras);
                            setEditMinutos(limiteMinutos);
                            setMostrarEditorLimite(v => !v);
                          }}
                          title={thresholdSecs > 0 ? 'Editar tiempo límite' : 'Establecer tiempo límite'}
                        >{thresholdSecs > 0 ? 'Editar tiempo' : 'Establecer tiempo'}</button>
                      </div>
                      {mostrarEditorLimite && (
                        <div className="flex items-end gap-2 p-2 border rounded bg-white shadow-sm">
                          <div className="flex flex-col">
                            <span className="text-[11px] text-gray-600">Tiempo límite</span>
                            <div className="flex gap-1">
                              <input
                                type="number"
                                min={0}
                                inputMode="numeric"
                                placeholder="Horas"
                                value={editHoras}
                                onChange={(e) => setEditHoras(e.target.value.replace(/[^0-9]/g, ''))}
                                className="w-16 px-2 py-1 border rounded text-xs"
                              />
                              <input
                                type="number"
                                min={0}
                                max={59}
                                inputMode="numeric"
                                placeholder="Minutos"
                                value={editMinutos}
                                onChange={(e) => setEditMinutos(e.target.value.replace(/[^0-9]/g, ''))}
                                className="w-20 px-2 py-1 border rounded text-xs"
                              />
                            </div>
                          </div>
                          <span className="text-[11px] text-gray-500 ml-1">Si falta menos, sólo Inspección</span>
                          <div className="flex items-center gap-1">
                            <button
                              className="px-2 py-1 text-xs rounded border border-green-300 text-green-700 hover:bg-green-50"
                              onClick={() => {
                                setLimiteHoras(editHoras);
                                setLimiteMinutos(editMinutos);
                                setMostrarEditorLimite(false);
                              }}
                            >Guardar</button>
                            <button
                              className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50"
                              onClick={() => setMostrarEditorLimite(false)}
                            >Cancelar</button>
                          </div>
                        </div>
                      )}
                      {/* Selección rápida */}
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
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[10px] sm:text-xs text-green-700 font-medium bg-green-100 px-2 py-0.5 rounded">Devuelto</span>
                          {(() => {
                            const info = infoPorId.get(item.id);
                            if (!info) return null;
                            // Mostrar tiempo configurado en Operación (ej: 96h) y el conteo regresivo restante
                            const horasIniciales = Math.floor(info.initialMinutes / 60);
                            const minutosIniciales = info.initialMinutes % 60;
                            const inicialLabel = horasIniciales > 0
                              ? `${horasIniciales}h${minutosIniciales ? ` ${minutosIniciales}m` : ''}`
                              : `${minutosIniciales}m`;
                            return (
                              <>
                                <span className="text-[10px] sm:text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded" title="Tiempo configurado en Operación">
                                  Envío: {inicialLabel}
                                </span>
                                <span className="text-[10px] sm:text-xs text-gray-700 font-semibold bg-gray-100 px-2 py-0.5 rounded" title="Tiempo restante del envío">
                                  ⏱ <InlineCountdown endTime={info.endTime} seconds={info.seconds} format={formatearTiempo} />
                                </span>
                              </>
                            );
                          })()}
                        </div>
                      </label>
                    ))
                  )}
                </div>
                {itemsDevueltosDeCategoria.length > 0 && (
                  <div className="p-3 border-t flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                    <div className="text-xs text-gray-600">
                      {Object.values(seleccionados).filter(Boolean).length} seleccionados
                    </div>
                    {(() => {
                      const selectedIds = Object.entries(seleccionados)
                        .filter(([, v]) => v)
                        .map(([k]) => Number(k));

                      // Regla 1: si algún seleccionado está vencido (<= 0s), NO puede regresar a Operación.
                      const hasExpired = selectedIds.some((id) => {
                        const info = infoPorId.get(id);
                        if (!info) return false; // si no hay info, no bloquear desde UI (se valida en backend/hook)
                        return (info.seconds ?? 0) <= 0;
                      });

                      // Regla 2: si hay límite configurado, bloquear si el restante es menor al límite
                      const violatesThreshold = thresholdSecs > 0 && selectedIds.some((id) => {
                        const info = infoPorId.get(id);
                        if (!info) return false;
                        return (info.seconds ?? 0) < thresholdSecs;
                      });

                      const disabled = selectedIds.length === 0 || hasExpired || violatesThreshold;
                      const title = hasExpired
                        ? 'No se puede regresar a Operación: tiempo de envío vencido. Debe ir a Inspección.'
                        : violatesThreshold
                          ? 'Algún item tiene tiempo restante menor al límite; debe ir a Inspección.'
                          : 'Regresar a Operación';

                      return (
                        <div className="flex gap-2">
                          <button
                            className={`px-3 py-2 text-xs sm:text-sm rounded-md border ${disabled ? 'border-gray-200 text-gray-400 cursor-not-allowed' : 'border-blue-300 text-blue-700 hover:bg-blue-50'}`}
                            title={title}
                            disabled={disabled}
                            onClick={async () => {
                              if (selectedIds.length === 0) return;
                              if (hasExpired) {
                                alert('No se puede regresar a Operación: hay items con tiempo de envío vencido. Envíalos a Inspección.');
                                return;
                              }
                              if (violatesThreshold) {
                                alert('No se puede regresar a Operación: hay items con tiempo restante menor al límite. Envíalos a Inspección.');
                                return;
                              }
                              const ok = window.confirm(`¿Regresar ${selectedIds.length} item(s) a Operación?`);
                              if (!ok) return;
                              const nombres: Record<number, string> = {};
                              itemsDevueltosDeCategoria.forEach((i) => {
                                if (selectedIds.includes(i.id)) nombres[i.id] = i.nombre_unidad;
                              });
                              await regresarItemsAOperacion(selectedIds, nombres);
                              setSeleccionados({});
                            }}
                          >Regresar a Operación</button>
                          <button
                            className="px-3 py-2 text-xs sm:text-sm rounded-md border border-purple-300 text-purple-700 hover:bg-purple-50"
                            onClick={() => {
                              if (selectedIds.length === 0) return;
                              const nombres: Record<number, string> = {};
                              itemsDevueltosDeCategoria.forEach((i) => {
                                if (selectedIds.includes(i.id)) nombres[i.id] = i.nombre_unidad;
                              });
                              setIdsParaInspeccion(selectedIds);
                              setNombresParaInspeccion(nombres);
                              setMostrarModalTiempoInspeccion(true);
                            }}
                          >Pasar a Inspección</button>
                        </div>
                      );
                    })()}
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

          {/* Modal de selección de Items para devolver */}
          {mostrarModalSeleccion && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
              <div className="bg-white rounded-lg shadow-xl w-[92vw] max-w-md sm:max-w-2xl md:max-w-4xl max-h-[88vh] overflow-hidden flex flex-col">
                <div className="p-4 sm:p-6 border-b border-gray-200 flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg sm:text-xl font-semibold text-gray-800">Seleccionar items para devolución</h2>
                    <p className="text-xs sm:text-sm text-gray-600 mt-1 sm:mt-2">Disponibles: {itemsDevolucion.length}</p>
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
                  {/* Búsqueda */}
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
                    <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                      <button onClick={toggleSeleccionTodosModal} className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded">
                        {itemsFiltradosModal.length > 0 && itemsFiltradosModal.every(i => itemsSeleccionadosModal.includes(i.id)) ?
                          `Quitar todos (${itemsFiltradosModal.length})` : `Seleccionar todos (${itemsFiltradosModal.length})`}
                      </button>
                      <button onClick={() => setItemsSeleccionadosModal([])} className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded">Limpiar selección</button>
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
                      itemsFiltradosModal.map((item) => {
                        const selected = itemsSeleccionadosModal.includes(item.id);
                        return (
                          <div
                            key={item.id}
                            onClick={() => toggleSeleccionItemModal(item.id)}
                            className={`p-3 border rounded cursor-pointer transition-all ${selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                          >
                            <div className="flex items-start gap-3">
                              <input type="checkbox" checked={selected} onChange={() => {}} className="mt-0.5 rounded" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`px-2 py-0.5 text-[11px] rounded ${
                                    item.categoria === 'TIC' ? 'bg-yellow-100 text-yellow-800' :
                                    item.categoria === 'VIP' ? 'bg-green-100 text-green-800' :
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
                    }}
                    className="px-4 py-2 text-sm text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmarSeleccionModal}
                    disabled={itemsSeleccionadosModal.length === 0}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    Confirmar devolución ({itemsSeleccionadosModal.length})
                  </button>
                </div>
              </div>
            </div>
          )}
    </div>
  );
};
