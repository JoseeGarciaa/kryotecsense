import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Package, Search, Loader, Scan, Play, Pause, Edit, Trash2, X, CheckCircle, Menu, Activity } from 'lucide-react';
import { useOperaciones } from '../hooks/useOperaciones';
import { apiServiceClient } from '../../../api/apiClient';
import RfidScanModal from './RfidScanModal';
import { useTimerContext } from '../../../contexts/TimerContext';
import InlineCountdown from '../../../shared/components/InlineCountdown';
import TimerModal from './TimerModal';

interface AcondicionamientoViewSimpleProps {
  isOpen: boolean;
  onClose: () => void;
}

const AcondicionamientoViewSimple: React.FC<AcondicionamientoViewSimpleProps> = ({ isOpen, onClose }) => {
  const { inventarioCompleto: inventarioCompletoData, cambiarEstadoItem, actualizarColumnasDesdeBackend } = useOperaciones(); // renombrado para claridad
  const { timers, eliminarTimer, crearTimer, formatearTiempo, forzarSincronizacion, isConnected, pausarTimer, reanudarTimer } = useTimerContext();
  
  const [mostrarModalTraerEnsamblaje, setMostrarModalTraerEnsamblaje] = useState(false);
  const [mostrarModalTraerDespacho, setMostrarModalTraerDespacho] = useState(false);
  const [busquedaEnsamblaje, setBusquedaEnsamblaje] = useState('');
  const [busquedaListaDespacho, setBusquedaListaDespacho] = useState('');
  const [cargandoActualizacion, setCargandoActualizacion] = useState(false);
  const [cargandoEnsamblaje, setCargandoEnsamblaje] = useState(false);
  const [cargandoDespacho, setCargandoDespacho] = useState(false);
  // Estado para configurar timer por item
  const [mostrarTimerModal, setMostrarTimerModal] = useState(false);
  const [itemParaTemporizador, setItemParaTemporizador] = useState<any | null>(null);
  const [destinoTimer, setDestinoTimer] = useState<'Ensamblaje' | 'Despacho' | null>(null);
  const [cargandoTimer, setCargandoTimer] = useState(false);
  // (Eliminado) Toggle 'Solo completados' para Lista para Despacho
  // Batch timers
  const [mostrarBatchTimerModal, setMostrarBatchTimerModal] = useState(false);
  const [batchModoDespacho, setBatchModoDespacho] = useState(false); // false = Ensamblaje, true = Despacho
  const [cargandoBatch, setCargandoBatch] = useState(false);
  const [cargandoBatchDespacho, setCargandoBatchDespacho] = useState(false);
  const [cargandoCompletarBatch, setCargandoCompletarBatch] = useState(false);
  const [cargandoCompletarBatchDespacho, setCargandoCompletarBatchDespacho] = useState(false);
  // Vista global (tabla / lotes agrupados por lote)
  const [vistaGlobal, setVistaGlobal] = useState<'tabla' | 'lotes'>('tabla');

  // Ref para evitar normalizar varias veces mismos IDs y saturar red
  const idsNormalizadosRef = useRef<Set<number>>(new Set());

  // Helper: procesar tareas en lotes para limitar concurrencia (evita ERR_INSUFFICIENT_RESOURCES)
  const procesarEnLotes = async <T,>(tareas: (() => Promise<T>)[], batchSize = 5): Promise<T[]> => {
    const resultados: T[] = [];
    for (let i = 0; i < tareas.length; i += batchSize) {
      const lote = tareas.slice(i, i + batchSize);
      const res = await Promise.allSettled(lote.map(fn => fn()));
      res.forEach(r => {
        if (r.status === 'fulfilled') resultados.push(r.value);
        // Si rejected, se ignora a nivel lote (ya se registrará en PUT individual si corresponde)
      });
    }
    return resultados;
  };

  // Acción rápida: completar desde Ensamblaje -> mover a Lista para Despacho
  const completarDesdeEnsamblaje = async (item: any) => {
    try {
      const ok = window.confirm(`¿Mover "${item.nombre_unidad}" a Lista para Despacho?`);
      if (!ok) return;
      // Actualizar estado del item
      await cambiarEstadoItem(item.id, 'Acondicionamiento', 'Lista para Despacho');
      // Cancelar cronómetros relacionados (si existieran)
      try {
        const relacionados = timers.filter(t => t.tipoOperacion === 'envio' && (t.nombre || '').includes(`#${item.id} -`));
        relacionados.forEach(t => eliminarTimer(t.id));
      } catch {}
      // Refrescar datos y sincronizar
      try { await actualizarColumnasDesdeBackend(); } catch {}
      try { if (isConnected) forzarSincronizacion(); } catch {}
    } catch (e) {
      console.error('Error completando desde Ensamblaje:', e);
      alert('No se pudo mover el item a Lista para Despacho.');
    }
  };

  // Obtener items por sub-estado
  const itemsEnsamblaje = inventarioCompletoData?.filter((item: any) => 
    item.estado === 'Acondicionamiento' && item.sub_estado === 'Ensamblaje'
  ) || [];
  
  const itemsListaDespacho = inventarioCompletoData?.filter((item: any) => 
    item.estado === 'Acondicionamiento' && (item.sub_estado === 'Despacho' || item.sub_estado === 'Despachado')
  ) || [];

  // Próximo código incremental de CAJA (formato CJ-0001) basado en lotes existentes usados como caja
  const nextCajaId = useMemo(() => {
  const todos = [...itemsEnsamblaje, ...itemsListaDespacho, ...(inventarioCompletoData||[])];
    let max = 0;
    for (const it of todos) {
      const m = /^CJ-(\d{4,})$/.exec(it?.lote || '');
      if (m) {
        const n = parseInt(m[1], 10);
        if (!Number.isNaN(n) && n > max) max = n;
      }
    }
    return `CJ-${String(max + 1).padStart(4, '0')}`;
  }, [itemsEnsamblaje, itemsListaDespacho, inventarioCompletoData]);

  // Helper para recalcular justo antes de confirmar (evita duplicados si otro cliente creó una caja mientras el modal estaba abierto)
  const getNextCajaId = () => {
  const todos = [...itemsEnsamblaje, ...itemsListaDespacho, ...(inventarioCompletoData||[])];
    let max = 0;
    for (const it of todos) {
      const m = /^CJ-(\d{4,})$/.exec(it?.lote || '');
      if (m) {
        const n = parseInt(m[1], 10);
        if (!Number.isNaN(n) && n > max) max = n;
      }
    }
    return `CJ-${String(max + 1).padStart(4, '0')}`;
  };

  // Elegibles para batch (sin cronómetro de envío activo/completado en Ensamblaje)
  const nombresBatch = useMemo(() => {
    return itemsEnsamblaje
  .filter((item: any) => {
        const nombreBase = `#${item.id} -`;
        const tiene = timers.some(t => t.tipoOperacion === 'envio' && (t.nombre || '').includes(nombreBase) && !/(\(\s*despacho\s*\))/i.test(t.nombre || ''));
        return !tiene; // solo los que no tienen
      })
  .map((item: any) => `Envío #${item.id} - ${item.nombre_unidad}`);
  }, [itemsEnsamblaje, timers]);
  const hayElegiblesBatch = nombresBatch.length > 0;
  // Elegibles batch despacho (sin cronómetro en despacho)
  const nombresBatchDespacho = useMemo(() => {
    return itemsListaDespacho
  .filter((item: any) => {
        const base = `#${item.id} -`;
        return !timers.some(t => t.tipoOperacion === 'envio' && (t.nombre||'').includes(base) && /(\(\s*despacho\s*\))/i.test(t.nombre||''));
      })
  .map((item: any) => `Envío (Despacho) #${item.id} - ${item.nombre_unidad}`);
  }, [itemsListaDespacho, timers]);
  const hayElegiblesBatchDespacho = nombresBatchDespacho.length > 0;

  // Timers activos para completar en Ensamblaje (no despacho)
  const timersActivosEnsamblaje = useMemo(() => timers.filter(t => t.tipoOperacion==='envio' && t.activo && !t.completado && !/(\(\s*despacho\s*\))/i.test(t.nombre||'')), [timers]);
  const timersActivosDespacho = useMemo(() => timers.filter(t => t.tipoOperacion==='envio' && t.activo && !t.completado && /(\(\s*despacho\s*\))/i.test(t.nombre||'')), [timers]);

  const completarTimersLocal = (lista: typeof timers) => {
    const ahora = Date.now();
    return lista.map(t => ({ ...t, tiempoRestanteSegundos: 0, activo: false, completado: true, fechaFin: new Date(ahora) }));
  };

  const completarTodosEnsamblaje = async () => { /* función legacy eliminada (no forzado local) */ };

  const completarTodosDespacho = async () => { /* función legacy eliminada */ };

  // Ref para no repetir actualizaciones a 'Ensamblado'
  const idsMarcadosEnsambladoRef = useRef<Set<number>>(new Set());
  // Ref para no repetir actualizaciones a 'Despachado'
  const idsMarcadosDespachadoRef = useRef<Set<number>>(new Set());

  // Efecto: cuando un cronómetro de Ensamblaje (no Despacho) se completa, mover sub_estado a 'Ensamblado'
  useEffect(() => {
    const candidatos = timers.filter(t => t.tipoOperacion === 'envio' && t.completado && !/\(\s*despacho\s*\)/i.test(t.nombre||''));
    if (!candidatos.length) return;
    candidatos.forEach(t => {
      const match = /#(\d+)\s*-/.exec(t.nombre || '');
      if (!match) return;
      const id = parseInt(match[1], 10);
      if (!id || idsMarcadosEnsambladoRef.current.has(id)) return;
      const item = (inventarioCompletoData || []).find((it:any) => it.id === id);
      if (!item) return;
      if (item.sub_estado !== 'Ensamblaje') return; // sólo si aún está en Ensamblaje
      idsMarcadosEnsambladoRef.current.add(id);
      // Actualizar backend
      const payload = {
        modelo_id: item.modelo_id,
        nombre_unidad: item.nombre_unidad,
        rfid: item.rfid,
        lote: item.lote || null,
        estado: 'Acondicionamiento',
        sub_estado: 'Ensamblado',
        validacion_limpieza: item.validacion_limpieza || null,
        validacion_goteo: item.validacion_goteo || null,
        validacion_desinfeccion: item.validacion_desinfeccion || null,
        categoria: item.categoria || null
      };
      apiServiceClient.put(`/inventory/inventario/${item.id}`, payload)
        .then(() => {
          // Refrescar datos después de un pequeño delay para batch
          setTimeout(() => { try { actualizarColumnasDesdeBackend(); } catch {} }, 150);
        })
        .catch(() => {
          // Si falla, permitir reintento en el próximo efecto
          idsMarcadosEnsambladoRef.current.delete(id);
        });
    });
  }, [timers, inventarioCompletoData, actualizarColumnasDesdeBackend]);

  // Efecto: cuando un cronómetro de Despacho se completa, mover sub_estado 'Despacho' -> 'Despachado'
  useEffect(() => {
    const candidatos = timers.filter(t => t.tipoOperacion === 'envio' && t.completado && /\(\s*despacho\s*\)/i.test(t.nombre||''));
    if (!candidatos.length) return;
    candidatos.forEach(t => {
      const match = /#(\d+)\s*-/.exec(t.nombre || '');
      if (!match) return;
      const id = parseInt(match[1], 10);
      if (!id || idsMarcadosDespachadoRef.current.has(id)) return;
      const item = (inventarioCompletoData || []).find((it:any) => it.id === id);
      if (!item) return;
      if (item.sub_estado !== 'Despacho') return; // sólo si aún está en Despacho
      idsMarcadosDespachadoRef.current.add(id);
      const payload = {
        modelo_id: item.modelo_id,
        nombre_unidad: item.nombre_unidad,
        rfid: item.rfid,
        lote: item.lote || null,
        estado: 'Acondicionamiento',
        sub_estado: 'Despachado',
        validacion_limpieza: item.validacion_limpieza || null,
        validacion_goteo: item.validacion_goteo || null,
        validacion_desinfeccion: item.validacion_desinfeccion || null,
        categoria: item.categoria || null
      };
      apiServiceClient.put(`/inventory/inventario/${item.id}`, payload)
        .then(() => {
          setTimeout(() => { try { actualizarColumnasDesdeBackend(); } catch {} }, 150);
        })
        .catch(() => {
          idsMarcadosDespachadoRef.current.delete(id);
        });
    });
  }, [timers, inventarioCompletoData, actualizarColumnasDesdeBackend]);

  // Utilidad: normalizar texto (quitar acentos, minúsculas y trim)
  const norm = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  // Filtrar items disponibles para Ensamblaje: TICs que vengan de la fase anterior
  // Reglas actualizadas:
  //  - Incluir TICs en Pre acondicionamiento con sub_estado Atemperamiento (independiente del estado del timer)
  //  - También incluir si están en Bodega (fallback)
  //  - Excluir cualquier estado relacionado con Congelamiento
  // Solo mostrar TICs ya ATEMPERADOS (no VIP/Cube) en la lista de Ensamblaje.
  const itemsDisponibles = (inventarioCompletoData || []).filter(item => {
    const e = norm(item.estado);
    const s = norm((item as any).sub_estado);
    const categoria = norm((item as any).categoria);
    const esPreAcond = e.includes('pre') && e.includes('acond');
    const esAtemperadoFinal = s.includes('atemperado'); // SOLO cuando ya está atemperado (no 'atemperamiento')
    const esEnAtemperamiento = s.includes('atemperamiento');
    const esCongelacion = e.includes('congel') || s.includes('congel');
    const enBodega = e.includes('bodega');
    if (esCongelacion) return false;

    if (categoria === 'tic') {
      // Mostrar TICs con sub_estado final Atemperado (aunque el timer ya no exista) – requisito
      if (!esAtemperadoFinal) return false;
      const origenValido = esPreAcond || enBodega || esEnAtemperamiento;
      return origenValido;
    }
    // Ocultar VIP y Cube de la lista (se agregarán solo vía escaneo si vienen de bodega)
    return false; // no mostrar otras categorías
  });

  // Filtrar items disponibles específicamente para Lista para Despacho (solo de Ensamblaje)
  // Placeholder; se define después de construir índices de timers
  let itemsDisponiblesParaDespacho: any[] = [];

  // Índices de timers de envío (activos y completados) para lookup rápido por id y nombre normalizado
  const { activosPorId, activosPorNombre, completadosPorId, completadosPorNombre } = useMemo(() => {
    const normalize = (s: string) =>
      s
        ?.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim() ?? '';
    const extractFromNombre = (nombre: string): { id?: number; base: string } => {
      const n = normalize(nombre);
      // Permitir variantes como:
      //  - "envio #123 - nombre"
      //  - "envio (despacho) #123 - nombre"
      //  - "envio nombre" (sin id)
      const re = /^envio(?:\s*\([^)]*\))?\s+(?:#(\d+)\s*-\s*)?(.*)$/i;
      const m = n.match(re);
      if (m) {
        const id = m[1] ? Number(m[1]) : undefined;
        const base = (m[2] || '').trim();
        return { id, base };
      }
      // Fallback: intentar encontrar '#id - resto' en cualquier parte
      const m2 = n.match(/#(\d+)\s*-\s*(.*)$/);
      if (m2) {
        const id = Number(m2[1]);
        const base = (m2[2] || '').trim();
        return { id, base };
      }
      return { base: n };
    };
    const activosPorId = new Map<number, any>();
    const activosPorNombre = new Map<string, any>();
    const completadosPorId = new Map<number, any>();
    const completadosPorNombre = new Map<string, any>();
    for (const t of timers) {
      if (t.tipoOperacion !== 'envio') continue;
      const { id, base } = extractFromNombre(t.nombre || '');
      const normBase = normalize(base);
      const normFull = normalize(t.nombre || '');
      const targetIdMap = t.completado ? completadosPorId : activosPorId;
      const targetNameMap = t.completado ? completadosPorNombre : activosPorNombre;
      if (typeof id === 'number' && !Number.isNaN(id)) targetIdMap.set(id, t);
      if (normBase) targetNameMap.set(normBase, t);
      if (normFull && !targetNameMap.has(normFull)) targetNameMap.set(normFull, t);
    }
    return { activosPorId, activosPorNombre, completadosPorId, completadosPorNombre };
  }, [timers]);

  // Mostrar en el modal solo items en Ensamblaje cuyo cronómetro de envío (no 'Despacho') esté COMPLETO
  itemsDisponiblesParaDespacho = useMemo(() => {
  const base = (inventarioCompletoData || []).filter((item: any) =>
      item.estado === 'Acondicionamiento' && item.sub_estado === 'Ensamblaje'
    );

  return base.filter((item: any) => {
      const nombreBase = `#${item.id} -`;
      // Timer de Ensamblaje: etiqueta 'Envío #...'; excluir '(Despacho)'
      const timerActivo = timers.find(
        t => t.tipoOperacion === 'envio'
          && t.activo && !t.completado
          && (t.nombre || '').includes(nombreBase)
          && !/(\s*\(\s*despacho\s*\))/i.test(t.nombre || '')
      );
      const timerCompletado = timers.find(
        t => t.tipoOperacion === 'envio'
          && t.completado
          && (t.nombre || '').includes(nombreBase)
          && !/(\s*\(\s*despacho\s*\))/i.test(t.nombre || '')
      );
      if (timerCompletado) return true;
      if (timerActivo && (timerActivo.tiempoRestanteSegundos ?? 0) <= 0) return true; // llegó a cero
      return false;
    });
  }, [inventarioCompletoData, timers]);

  // (Eliminado) Filtro de 'solo completados' para Lista para Despacho

  // Refuerzo de sincronización al montar para minimizar “—” por desfase
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        if (isConnected) {
          forzarSincronizacion();
        }
      } catch {}
    }, 300);
    return () => clearTimeout(id);
  }, [forzarSincronizacion, isConnected]);

  // Normalizar: en Ensamblaje todos los lotes deben ser null
  useEffect(() => {
    const normalizar = async () => {
      try {
        const conLote = itemsEnsamblaje.filter((it: any) => it.lote && !idsNormalizadosRef.current.has(it.id));
        if (conLote.length === 0) return;
        setCargandoActualizacion(true);
        const tareas = conLote.map((item: any) => () => {
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
          return apiServiceClient.put(`/inventory/inventario/${item.id}`, actualizacionItem)
            .then(r => { idsNormalizadosRef.current.add(item.id); return r; })
            .catch(err => { /* Silenciado: error individual */ return null as any; });
        });
        await procesarEnLotes(tareas, 4);
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
        // Cancelar SOLO timers de envío asociados al item
        const relacionados = timers.filter(t => {
          if (t.tipoOperacion !== 'envio') return false;
          const nombre = (t.nombre || '');
          return (
            nombre.includes(`#${item.id} -`) ||
            nombre === String(item.id) ||
            nombre === item.nombre_unidad ||
            nombre === item.rfid
          );
        });
        if (relacionados.length > 0) {
      // Silenciado: cancelación de cronómetros relacionados
          relacionados.forEach(t => {
            try { eliminarTimer(t.id); } catch (timerError) {
        // Silenciado: error al cancelar cronómetro
            }
          });
        }
      });
    } catch (error) {
    // Silenciado: error general cancelando cronómetros
    }
  };

  // Abrir modal de tiempo para un item específico
  const abrirTemporizadorParaItem = (item: any, destino: 'Ensamblaje' | 'Despacho') => {
    try { if (isConnected) forzarSincronizacion(); } catch {}
    setItemParaTemporizador(item);
    setDestinoTimer(destino);
    setMostrarTimerModal(true);
  };

  // Confirmar tiempo y crear/actualizar el timer de envío
  const confirmarTemporizador = async (minutos: number) => {
    if (!itemParaTemporizador || !destinoTimer) return;
    setCargandoTimer(true);
    try {
      // Eliminar timers de envío existentes del mismo item
      try {
        const relacionados = timers.filter(t => t.tipoOperacion === 'envio' && (t.nombre || '').includes(`#${itemParaTemporizador.id} -`));
        relacionados.forEach(t => eliminarTimer(t.id));
      } catch {}

  const label = destinoTimer === 'Despacho'
        ? `Envío (Despacho) #${itemParaTemporizador.id} - ${itemParaTemporizador.nombre_unidad}`
        : `Envío #${itemParaTemporizador.id} - ${itemParaTemporizador.nombre_unidad}`;
      try {
        crearTimer(label, 'envio', minutos);
      } catch (e) {
        console.warn('No se pudo crear temporizador:', e);
      }
      try { forzarSincronizacion(); } catch {}
    } finally {
      setCargandoTimer(false);
      setMostrarTimerModal(false);
      setItemParaTemporizador(null);
      setDestinoTimer(null);
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

  // ===== Helpers de render para cronómetros (extraídos del código inline) =====
  const renderTimerEnsamblaje = (item: any) => {
    const nombreBase = `#${item.id} -`;
    const timerActivo = timers.find(t => t.tipoOperacion === 'envio' && t.activo && !t.completado && (t.nombre || '').includes(nombreBase) && !/\(\s*despacho\s*\)/i.test(t.nombre || ''));
    const timerCompletado = timers.find(t => t.tipoOperacion === 'envio' && t.completado && (t.nombre || '').includes(nombreBase) && !/\(\s*despacho\s*\)/i.test(t.nombre || ''));
  const mostrarCompleto = !!timerCompletado || (timerActivo && (timerActivo.tiempoRestanteSegundos ?? 0) <= 0);
    if (mostrarCompleto) {
  const minutos = timerCompletado ? timerCompletado.tiempoInicialMinutos : (timerActivo ? timerActivo.tiempoInicialMinutos : 0);
      return (
        <div className="flex flex-col items-center space-y-1 py-1 max-w-24">
          <span className="text-green-600 text-xs font-medium flex items-center gap-1">
            <CheckCircle className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">Completo</span>
          </span>
          <div className="text-xs text-gray-500 text-center truncate">{minutos}min</div>
        </div>
      );
    }
    if (!timerActivo) {
      return (
        <div className="flex flex-col items-center space-y-1 py-1 max-w-20">
          <span className="text-gray-400 text-xs text-center">Sin cronómetro</span>
          <button
            onClick={() => abrirTemporizadorParaItem(item, 'Ensamblaje')}
            className="flex items-center justify-center p-1.5 bg-green-100 hover:bg-green-200 text-green-700 rounded text-xs transition-colors"
            title="Iniciar cronómetro"
          >
            <Play className="w-3 h-3" />
          </button>
        </div>
      );
    }
    const esUrgente = timerActivo.tiempoRestanteSegundos < 300;
    return (
      <div className="flex flex-col items-center space-y-1 py-1 max-w-20">
        <div className="flex items-center justify-center">
          <span className={`font-mono text-xs font-medium truncate ${esUrgente ? 'text-red-600' : 'text-indigo-600'}`}>
            <InlineCountdown endTime={timerActivo.fechaFin} paused={!timerActivo.activo} format={formatearTiempo} />
          </span>
        </div>
  {!timerActivo.activo && <span className="text-xs text-gray-500">(pausado)</span>}
      </div>
    );
  };

  const renderTimerDespacho = (item: any) => {
    const nombreBase = `#${item.id} -`;
    const timerActivo = timers.find(t => t.tipoOperacion === 'envio' && t.activo && !t.completado && (t.nombre || '').includes(nombreBase) && /\(\s*despacho\s*\)/i.test(t.nombre || ''));
    const timerCompletado = timers.find(t => t.tipoOperacion === 'envio' && t.completado && (t.nombre || '').includes(nombreBase) && /\(\s*despacho\s*\)/i.test(t.nombre || ''));
    const mostrarCompleto = !!timerCompletado || (timerActivo && (timerActivo.tiempoRestanteSegundos ?? 0) <= 0);
    if (mostrarCompleto) {
      const minutos = timerCompletado ? timerCompletado.tiempoInicialMinutos : (timerActivo ? timerActivo.tiempoInicialMinutos : 0);
      return (
        <div className="flex flex-col items-center space-y-1 py-1 max-w-24">
          <span className="text-green-600 text-xs font-medium flex items-center gap-1">
            <CheckCircle className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">Completo</span>
          </span>
          <div className="text-xs text-gray-500 text-center truncate">{minutos}min</div>
        </div>
      );
    }
    if (!timerActivo) {
      return (
        <div className="flex flex-col items-center space-y-1 py-1 max-w-20">
          <span className="text-gray-400 text-xs text-center">Sin cronómetro</span>
          <button
            onClick={() => abrirTemporizadorParaItem(item, 'Despacho')}
            className="flex items-center justify-center p-1.5 bg-green-100 hover:bg-green-200 text-green-700 rounded text-xs transition-colors"
            title="Iniciar cronómetro"
          >
            <Play className="w-3 h-3" />
          </button>
        </div>
      );
    }
    const esUrgente = timerActivo.tiempoRestanteSegundos < 300;
    return (
      <div className="flex flex-col items-center space-y-1 py-1 max-w-20">
        <div className="flex items-center justify-center">
          <span className={`font-mono text-xs font-medium truncate ${esUrgente ? 'text-red-600' : 'text-indigo-600'}`}>
            <InlineCountdown endTime={timerActivo.fechaFin} paused={!timerActivo.activo} format={formatearTiempo} />
          </span>
        </div>
  {!timerActivo.activo && <span className="text-xs text-gray-500">(pausado)</span>}
      </div>
    );
  };

  // ===== Agrupación por lote (solo si vistaGlobal === 'lotes') =====
  interface GrupoLote { lote: string; items: any[]; count: number; }
  const gruposEnsamblaje = useMemo<GrupoLote[]>(() => {
    if (vistaGlobal !== 'lotes') return [];
    const map = new Map<string, any[]>();
    itemsEnsamblajeFiltrados.forEach(it => { const k = it.lote || 'SIN CAJA'; if (!map.has(k)) map.set(k, []); map.get(k)!.push(it); });
    return Array.from(map.entries()).map(([lote, items]) => ({ lote, items, count: items.length })).sort((a,b)=>a.lote.localeCompare(b.lote));
  }, [vistaGlobal, itemsEnsamblajeFiltrados]);
  const gruposDespacho = useMemo<GrupoLote[]>(() => {
    if (vistaGlobal !== 'lotes') return [];
    const map = new Map<string, any[]>();
    itemsListaDespachoFiltrados.forEach(it => { const k = it.lote || 'SIN CAJA'; if (!map.has(k)) map.set(k, []); map.get(k)!.push(it); });
    return Array.from(map.entries()).map(([lote, items]) => ({ lote, items, count: items.length })).sort((a,b)=>a.lote.localeCompare(b.lote));
  }, [vistaGlobal, itemsListaDespachoFiltrados]);

  const renderGrupo = (grupo: GrupoLote, despacho=false) => (
    <div key={(despacho?'D-':'E-')+grupo.lote} className={`rounded-xl border shadow-sm overflow-hidden ${despacho? 'bg-gradient-to-br from-green-50 to-green-100/40 border-green-200':'bg-gradient-to-br from-red-50 to-red-100/40 border-red-200'}`}>
      <div className={`px-4 py-3 flex items-center justify-between ${despacho? 'bg-green-600':'bg-red-600'} text-white`}> 
        <div className="flex flex-col">
          <span className="text-sm font-semibold">Caja {grupo.lote}</span>
          <span className="text-[11px] tracking-wide opacity-90">{grupo.count} Item{grupo.count!==1?'s':''}</span>
        </div>
        <Activity className="w-5 h-5 opacity-90" />
      </div>
      <div className="divide-y divide-white/60">
        {grupo.items.map(item => (
          <div key={item.id} className="flex items-center justify-between px-3 py-2 backdrop-blur-sm bg-white/40 hover:bg-white/70 transition-colors text-xs">
            <div className="flex flex-col mr-2 min-w-0">
              <span className="font-medium truncate" title={item.nombre_unidad}>{item.nombre_unidad}</span>
              <div className="text-[10px] text-gray-600 truncate" title={item.rfid}>{item.rfid}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`hidden sm:inline px-2 py-0.5 rounded-full text-[10px] font-medium ${despacho?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{despacho? 'Lista para Despacho':'Ensamblaje'}</span>
              {despacho? renderTimerDespacho(item) : renderTimerEnsamblaje(item)}
            </div>
          </div>
        ))}
        {!grupo.items.length && <div className="px-4 py-4 text-[11px] text-center text-gray-500">Sin items</div>}
      </div>
    </div>
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
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={()=>setVistaGlobal('lotes')}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border ${vistaGlobal==='lotes'? 'bg-gray-900 text-white border-gray-900':'bg-white text-gray-700 hover:bg-gray-100 border-gray-300'}`}
            title="Vista agrupada por caja"
          >
            <Menu className="w-4 h-4" /> Cajas
          </button>
          <button
            onClick={()=>setVistaGlobal('tabla')}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border ${vistaGlobal==='tabla'? 'bg-gray-900 text-white border-gray-900':'bg-white text-gray-700 hover:bg-gray-100 border-gray-300'}`}
            title="Vista tabla"
          >
            <Menu className="w-4 h-4 rotate-90" /> Tabla
          </button>
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
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setBatchModoDespacho(false); setMostrarBatchTimerModal(true); }}
                    disabled={!hayElegiblesBatch || cargandoBatch}
                    className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors border ${!hayElegiblesBatch || cargandoBatch ? 'bg-gray-200 text-gray-500 cursor-not-allowed border-gray-300' : 'bg-green-600 hover:bg-green-700 text-white border-green-600'}`}
                    title={hayElegiblesBatch ? 'Iniciar cronómetro para todos los items sin cronómetro' : 'No hay items elegibles'}
                  >
                    {cargandoBatch ? (
                      <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    Iniciar todos
                    {hayElegiblesBatch && <span className="ml-1 text-xs bg-white/20 px-1.5 py-0.5 rounded">{nombresBatch.length}</span>}
                  </button>
                  <button
                    onClick={() => {
                      try { if (isConnected) forzarSincronizacion(); } catch {}
                      setMostrarModalTraerEnsamblaje(true);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Agregar Items
                  </button>
                  {/* Botón 'Completar todos' removido según requerimiento */}
                </div>
            </div>
          </div>

          {/* Búsqueda Ensamblaje */}
          <div className="p-4 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar por RFID, nombre o caja..."
                value={busquedaEnsamblaje}
                onChange={(e) => setBusquedaEnsamblaje(e.target.value)}
                maxLength={24}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {vistaGlobal==='tabla' ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">RFID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NOMBRE</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CAJA</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ESTADO</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CRONÓMETRO</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CATEGORÍA</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {itemsEnsamblajeFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center">
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.lote || '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">{item.sub_estado}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">{renderTimerEnsamblaje(item)}</td>
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
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 p-4">
              {gruposEnsamblaje.length ? gruposEnsamblaje.map(g=>renderGrupo(g,false)) : (
                <div className="col-span-full text-center text-xs text-gray-500 py-6">No hay items en ensamblaje</div>
              )}
            </div>
          )}
        </div>

        {/* Sección Lista para Despacho */}
        <div className="bg-white rounded-lg border border-green-200 overflow-hidden">
    <div className="bg-green-50 border-b border-green-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
      <h2 className="text-lg font-semibold text-green-800">Items en Despacho</h2>
                <p className="text-sm text-green-600">({itemsListaDespacho.length} de {itemsListaDespacho.length})</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setBatchModoDespacho(true); setMostrarBatchTimerModal(true); }}
                  disabled={!hayElegiblesBatchDespacho || cargandoBatchDespacho}
                  className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors border ${!hayElegiblesBatchDespacho || cargandoBatchDespacho ? 'bg-gray-200 text-gray-500 cursor-not-allowed border-gray-300' : 'bg-green-600 hover:bg-green-700 text-white border-green-600'}`}
                  title={hayElegiblesBatchDespacho ? 'Iniciar cronómetro para todos los items sin cronómetro (Despacho)' : 'No hay items elegibles'}
                >
                  {cargandoBatchDespacho ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  Iniciar todos
                  {hayElegiblesBatchDespacho && <span className="ml-1 text-xs bg-white/20 px-1.5 py-0.5 rounded">{nombresBatchDespacho.length}</span>}
                </button>
                <button
                  onClick={() => { try { if (isConnected) forzarSincronizacion(); } catch {}; setMostrarModalTraerDespacho(true); }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Agregar Items
                </button>
                {/* Botón 'Completar todos' removido según requerimiento */}
              </div>
            </div>
          </div>

          {/* Búsqueda Lista para Despacho */}
          <div className="p-4 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar por RFID, nombre o caja..."
                value={busquedaListaDespacho}
                onChange={(e) => setBusquedaListaDespacho(e.target.value)}
                maxLength={24}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          {vistaGlobal==='tabla' ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">RFID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NOMBRE</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CAJA</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ESTADO</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CRONÓMETRO</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CATEGORÍA</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {itemsListaDespachoFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center">
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.lote || '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">{item.sub_estado}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">{renderTimerDespacho(item)}</td>
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
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 p-4">
              {gruposDespacho.length ? gruposDespacho.map(g=>renderGrupo(g,true)) : (
                <div className="col-span-full text-center text-xs text-gray-500 py-6">No hay items listos para despacho</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modales para agregar items */}
    {mostrarModalTraerEnsamblaje && (
        <AgregarItemsModal
          isOpen={mostrarModalTraerEnsamblaje}
          onClose={() => setMostrarModalTraerEnsamblaje(false)}
          itemsDisponibles={itemsDisponibles} // Bodega o Pre-acond → Atemperamiento (sin Congelamiento)
          subEstadoDestino="Ensamblaje"
          cargando={cargandoEnsamblaje}
          nextCajaId={nextCajaId}
      inventarioCompleto={inventarioCompletoData}
      onConfirm={async (items, subEstado, tiempoOperacionMinutos) => {
            try {
              setCargandoEnsamblaje(true);
              setCargandoActualizacion(true);
              // Silenciado: log de movimiento a Ensamblaje
  // Generar ID incremental de CAJA compartida
  const cajaId = getNextCajaId();
              
              // Cancelar cronómetros de los items que se van a mover
              cancelarCronometrosDeItems(items);
              
        const tareasMovimiento = items.map((item) => () => {
                const actualizacionItem = {
                  modelo_id: item.modelo_id,
                  nombre_unidad: item.nombre_unidad,
                  rfid: item.rfid,
          lote: cajaId,
                  estado: 'Acondicionamiento',
                  sub_estado: subEstado,
                  validacion_limpieza: item.validacion_limpieza || null,
                  validacion_goteo: item.validacion_goteo || null,
                  validacion_desinfeccion: item.validacion_desinfeccion || null,
                  categoria: item.categoria || null
                };
                return apiServiceClient.put(`/inventory/inventario/${item.id}`, actualizacionItem)
                  .then(() => {
                    if (typeof tiempoOperacionMinutos === 'number' && tiempoOperacionMinutos > 0) {
                      const existe = timers.some(t =>
                        t.tipoOperacion === 'envio' &&
                        /envio\s+#\d+\s+-/i.test((t.nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')) &&
                        (t.nombre || '').includes(`#${item.id} -`) &&
                        !t.completado
                      );
                      if (!existe) {
                        try { crearTimer(`Envío #${item.id} - ${item.nombre_unidad}`, 'envio', tiempoOperacionMinutos); } catch {}
                      }
                    }
                  })
                  .catch(() => null as any);
              });
              await procesarEnLotes(tareasMovimiento, 4);
              // Silenciado: movimiento exitoso a Ensamblaje
              
              // Actualizar datos - manejar errores de actualización por separado
              try {
                await actualizarColumnasDesdeBackend();
                // Silenciado: datos actualizados
                // Refuerzo: sincronizar timers para evitar desfases visuales
                try { forzarSincronizacion(); } catch {}
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
      subEstadoDestino="Despacho"
          cargando={cargandoDespacho}
      inventarioCompleto={inventarioCompletoData}
          onConfirm={async (items, subEstado, tiempoOperacionMinutos) => {
            try {
              setCargandoDespacho(true);
              setCargandoActualizacion(true);
              // Silenciado: log de movimiento a Lista para Despacho
              
              // Cancelar cronómetros de los items que se van a mover
              cancelarCronometrosDeItems(items);
              
        const tareasDespacho = items.map((item) => () => {
                const actualizacionItem = {
                  modelo_id: item.modelo_id,
                  nombre_unidad: item.nombre_unidad,
                  rfid: item.rfid,
                  lote: item.lote || null,
                  estado: 'Acondicionamiento',
          sub_estado: 'Despacho',
                  validacion_limpieza: item.validacion_limpieza || null,
                  validacion_goteo: item.validacion_goteo || null,
                  validacion_desinfeccion: item.validacion_desinfeccion || null,
                  categoria: item.categoria || null
                };
                return apiServiceClient.put(`/inventory/inventario/${item.id}`, actualizacionItem)
                  .then(() => {
                    if (typeof tiempoOperacionMinutos === 'number' && tiempoOperacionMinutos > 0) {
                      try {
                        const existentes = timers.filter(t => t.tipoOperacion === 'envio' && (t.nombre || '').includes(`#${item.id} -`) && !t.completado);
                        existentes.forEach(t => eliminarTimer(t.id));
                      } catch {}
                      try { crearTimer(`Envío (Despacho) #${item.id} - ${item.nombre_unidad}`, 'envio', tiempoOperacionMinutos); } catch {}
                    }
                  })
                  .catch(() => null as any);
              });
              await procesarEnLotes(tareasDespacho, 4);
              // Silenciado: movimiento exitoso a Lista para Despacho
              
              // Actualizar datos - manejar errores de actualización por separado
              try {
                await actualizarColumnasDesdeBackend();
                // Silenciado: datos actualizados
                // Refuerzo: sincronizar timers para evitar desfases visuales
                try { forzarSincronizacion(); } catch {}
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

      {/* Modal para configurar tiempo por item */}
      {mostrarTimerModal && itemParaTemporizador && destinoTimer && (
        <TimerModal
          mostrarModal={mostrarTimerModal}
          onCancelar={() => { setMostrarTimerModal(false); setItemParaTemporizador(null); setDestinoTimer(null); }}
          onConfirmar={(min) => confirmarTemporizador(min)}
          titulo={`Configurar Cronómetro • ${destinoTimer}`}
          descripcion={`Define el tiempo del cronómetro para "${itemParaTemporizador.nombre_unidad}"`}
          tipoOperacion="envio"
          cargando={cargandoTimer}
        />
      )}

  {/* Batch timer modal eliminado (soporte batch local retirado) */}
    </div>
  );
};

// Modal simple para agregar items
interface AgregarItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemsDisponibles: any[];
  onConfirm: (items: any[], subEstado: string, tiempoOperacionMinutos?: number) => void;
  subEstadoDestino: string; // Nuevo prop para especificar el sub-estado destino
  cargando?: boolean; // Estado de carga para mostrar en el botón
  nextCajaId?: string; // Código incremental sugerido para la próxima caja
  inventarioCompleto?: any[]; // Inventario completo para búsquedas de VIP/Cube ocultos
}

const AgregarItemsModal: React.FC<AgregarItemsModalProps> = ({ 
  isOpen, 
  onClose, 
  itemsDisponibles, 
  onConfirm, 
  subEstadoDestino,
  cargando = false,
  nextCajaId,
  inventarioCompleto = []
}) => {
  const [itemsSeleccionados, setItemsSeleccionados] = useState<any[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('TODOS');
  const [mostrarEscanerRfid, setMostrarEscanerRfid] = useState(false);
  const [rfidInput, setRfidInput] = useState('');
  const [rfidsEscaneados, setRfidsEscaneados] = useState<string[]>([]);
  const [horas, setHoras] = useState<string>('');
  const [minutos, setMinutos] = useState<string>('');

  // Auto-procesamiento de trozos de 24 caracteres; soporta TIC (lista) y VIP/Cube (bodega, ocultos)
  const procesarRfid = (rfid: string) => {
    const code = rfid.trim();
    if (!code || code.length !== 24) return;
    if (!/^[a-zA-Z0-9]+$/.test(code)) return;

    // Ya escaneado
    if (rfidsEscaneados.includes(code)) return;

    // Buscar primero en visibles (TIC listadas)
    let candidato: any = itemsDisponibles.find(i => i.rfid === code);
  if (subEstadoDestino === 'Ensamblaje') {
      // Si no está en visibles, permitir:
      // 1. VIP / Cube desde Bodega (ya implementado)
      if (!candidato) {
        candidato = inventarioCompleto.find(it => it.rfid === code && ['VIP','Cube'].includes(it.categoria) && /(bodega)/i.test((it.estado||'')));
      }
      // 2. TIC con sub_estado EXACTO 'Atemperado' (no 'Atemperamiento') aunque no esté listada
      if (!candidato) {
        candidato = inventarioCompleto.find(it => {
          if (it.rfid !== code) return false;
          if ((it.categoria||'').toUpperCase() !== 'TIC') return false;
          const sub = (it.sub_estado||'').toLowerCase();
          if (sub !== 'atemperado') return false; // estrictamente Atemperado
          const est = (it.estado||'').toLowerCase();
          // Aceptar si viene de Pre Acondicionamiento o si aún está marcado como Atemperamiento (estado principal) pero ya con sub_estado final Atemperado
          const esPreAcond = est.includes('pre') && est.includes('acond');
          const esEstadoAtemperamiento = est === 'atemperamiento';
          return esPreAcond || esEstadoAtemperamiento;
        });
      }
    }
    if (!candidato) {
      console.warn(`RFID ${code} no elegible (no encontrado en criterios)`);
      return;
    }

    setRfidsEscaneados(prev => [...prev, code]);
    if (subEstadoDestino === 'Ensamblaje') {
      setItemsSeleccionados(prev => {
        if (prev.find(p => p.id === candidato.id)) return prev; // ya agregado
        const cat = (candidato.categoria || '').toUpperCase();
        const counts = prev.reduce((acc:any, it:any) => { const c=(it.categoria||'').toUpperCase(); acc[c]=(acc[c]||0)+1; return acc; }, {} as Record<string,number>);
        if (cat === 'TIC' && (counts.TIC||0) >= 6) return prev;
        if (cat === 'VIP' && (counts.VIP||0) >= 1) return prev;
        if (cat === 'CUBE' && (counts.CUBE||counts.Cube||0) >= 1) return prev;
        return [...prev, candidato];
      });
    }
  };

  // Función para manejar cambios en el input de RFID con auto-procesamiento
  const handleRfidChange = (value: string) => {
    // Acumular y procesar en cascada mientras haya bloques de 24
    let buffer = value.replace(/\s+/g,''); // eliminar espacios/nuevas líneas del escáner
    const procesados: string[] = [];
    while (buffer.length >= 24) {
      const chunk = buffer.slice(0,24);
      if (/^[a-zA-Z0-9]{24}$/.test(chunk)) {
        procesarRfid(chunk);
        procesados.push(chunk);
        buffer = buffer.slice(24);
      } else {
        // Si el primer bloque no es válido, cortar para evitar loop infinito
        break;
      }
    }
    setRfidInput(buffer);
    if (procesados.length) {
      console.log(`🔄 Auto-procesados ${procesados.length} código(s)`);
    }
  };

  const itemsFiltrados = itemsDisponibles.filter(item => {
    const coincideBusqueda = !busqueda || 
      item.nombre_unidad?.toLowerCase().includes(busqueda.toLowerCase()) ||
      item.rfid?.toLowerCase().includes(busqueda.toLowerCase()) ||
      item.lote?.toLowerCase().includes(busqueda.toLowerCase());

  // Ya no se filtra por categoría (solo TICs en lista). El select se removió.
  return coincideBusqueda;
  });

  // Funciones para manejar el escáner RFID
  const manejarEscanearRfid = () => {
    const code = rfidInput.trim();
    if (!code) return;
    if (code.length !== 24) {
      alert('Cada RFID debe tener exactamente 24 caracteres.');
      return;
    }
    if (!/^[a-zA-Z0-9]+$/.test(code)) {
      alert('RFID inválido. Solo se permiten dígitos y letras.');
      return;
    }

    const itemEncontrado = itemsDisponibles.find(item => item.rfid === code);

    if (itemEncontrado) {
      if (!rfidsEscaneados.includes(code)) {
        setRfidsEscaneados(prev => [...prev, code]);
        setRfidInput('');
        console.log(`✅ RFID ${code} agregado (TIC listado)`);
      }
      return;
    }

    // Permitir escanear VIP o Cube que provengan de Bodega (estado 'En bodega') aunque no se muestren en la lista.
  // Usar inventarioCompleto del hook (ya en alcance superior)
  const itemVipCube = (inventarioCompleto || []).find((it: any) => it.rfid === code && ['VIP','Cube'].includes(it.categoria) && /bodega/i.test((it.estado||'')));
    if (itemVipCube) {
      if (!rfidsEscaneados.includes(code)) {
        setRfidsEscaneados(prev => [...prev, code]);
        setRfidInput('');
        console.log(`✅ RFID ${code} agregado (VIP/Cube oculto)`);
      }
      return;
    }

    alert(`❌ No elegible o no encontrado: ${code}`);
  };

  // === Reglas de composición para Ensamblaje (6 TIC, 1 VIP, 1 Cube) ===
  const requiredComposition = { TIC: 6, VIP: 1, Cube: 1 };
  const selectedCounts = itemsSeleccionados.reduce((acc:any, it:any) => {
    const cat = (it.categoria || '').toUpperCase();
    const key = cat === 'TIC' ? 'TIC' : (cat === 'VIP' ? 'VIP' : (cat === 'CUBE' ? 'Cube' : null));
    if (key) acc[key] = (acc[key] || 0) + 1; return acc;
  }, {} as Record<string, number>);
  const validComposition = subEstadoDestino === 'Ensamblaje'
    ? (selectedCounts.TIC === requiredComposition.TIC &&
       selectedCounts.VIP === requiredComposition.VIP &&
       selectedCounts.Cube === requiredComposition.Cube &&
       itemsSeleccionados.length === (requiredComposition.TIC + requiredComposition.VIP + requiredComposition.Cube))
    : true;

  const compositionStatusText = () => {
    const parts = [
      `${selectedCounts.Cube || 0}/${requiredComposition.Cube} CUBE`,
      `${selectedCounts.VIP || 0}/${requiredComposition.VIP} VIP`,
      `${selectedCounts.TIC || 0}/${requiredComposition.TIC} TIC`];
    return parts.join(' • ');
  };
  const remaining = (cat: 'TIC'|'VIP'|'Cube') => Math.max(0, (requiredComposition as any)[cat] - (selectedCounts as any)[cat] || 0);

  const confirmarEscaneoRfid = async (rfids: string[]) => {
    try {
      // Encontrar todos los items correspondientes a los RFIDs escaneados
      const itemsEncontrados = rfids.map(rfid => {
        // Primero buscar en la lista visible
        const visible = itemsDisponibles.find(item => item.rfid === rfid);
        if (visible) return visible;
        // Si es Ensamblaje, permitir VIP/Cube ocultos que vengan de bodega
        if (subEstadoDestino === 'Ensamblaje') {
          const oculto = inventarioCompleto.find(it => it.rfid === rfid && ['VIP','Cube'].includes(it.categoria) && /(bodega)/i.test((it.estado||'')));
          if (oculto) return oculto;
        }
        return undefined;
      }).filter(Boolean) as any[];

      // Agregar a la selección (con lógica especial para Lista para Despacho -> traer toda la caja por lote)
      setItemsSeleccionados(prev => {
        const nuevosItemsBase = itemsEncontrados.filter(item => !prev.find(selected => selected.id === item.id));
        if (subEstadoDestino === 'Ensamblaje') {
          const current = [...prev];
          for (const it of nuevosItemsBase) {
            const cat = (it.categoria||'').toUpperCase();
            const counts = current.reduce((acc:any, x:any) => { const c=(x.categoria||'').toUpperCase(); acc[c]=(acc[c]||0)+1; return acc; }, {} as Record<string,number>);
            if (cat==='TIC' && (counts.TIC||0) >= 6) continue;
            if (cat==='VIP' && (counts.VIP||0) >= 1) continue;
            if (cat==='CUBE' && (counts.CUBE||counts.Cube||0) >= 1) continue;
            current.push(it);
          }
          return current;
        }
  if (subEstadoDestino === 'Despacho') {
          // Escanear un solo componente debe traer todo el set de la caja (mismo lote)
            const lotesAIncluir = new Set<string>();
            nuevosItemsBase.forEach(it => { if (it.lote) lotesAIncluir.add(it.lote); });
            // Si escanearon exactamente 1 RFID y ese item tiene lote, incluir ese lote
            if (rfids.length === 1 && nuevosItemsBase.length === 1 && nuevosItemsBase[0].lote) {
              lotesAIncluir.add(nuevosItemsBase[0].lote);
            }
            if (lotesAIncluir.size) {
              const allGroupItems: any[] = [];
              lotesAIncluir.forEach(l => {
                const grupo = itemsDisponibles.filter(x => x.lote === l);
                grupo.forEach(g => { if (!prev.find(p => p.id === g.id) && !allGroupItems.find(a => a.id === g.id)) allGroupItems.push(g); });
              });
              if (allGroupItems.length) {
                console.log(`📦 Auto-seleccionando lote(s) completo(s): ${Array.from(lotesAIncluir).join(', ')} (${allGroupItems.length} items)`);
                return [...prev, ...allGroupItems];
              }
            }
        }
        return [...prev, ...nuevosItemsBase];
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
          <h2 className="text-base sm:text-lg font-semibold">{subEstadoDestino==='Ensamblaje' ? 'Armar caja • Ensamblaje' : `Agregar Items a ${subEstadoDestino}`}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-lg leading-none">×</button>
        </div>

        <div className="p-3 sm:p-4 border-b bg-gray-50">
          {subEstadoDestino === 'Ensamblaje' ? (
            <div className="flex flex-col gap-3 mb-2 sm:mb-3">
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                <div className="sm:flex-1">
                  <input
                    type="text"
                    placeholder="Escanear RFID (24 caracteres)..."
                    value={rfidInput}
                    onChange={(e) => handleRfidChange(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-sm font-mono tracking-wide"
                  />
                </div>
              </div>
              {rfidsEscaneados.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {rfidsEscaneados.map(r => (
                    <span key={r} className="px-2 py-1 bg-gray-200 rounded text-[10px] font-mono flex items-center gap-1">
                      {r.slice(-6)}
                      <button
                        onClick={() => setRfidsEscaneados(prev => prev.filter(x => x !== r))}
                        className="text-gray-600 hover:text-red-600"
                        title="Quitar"
                      >×</button>
                    </span>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-gray-500">Escanee sucesivamente; cada 24 caracteres se procesa automáticamente y se agrega si hay cupo. {nextCajaId && (<span>Próxima caja sugerida: <span className="font-semibold text-gray-700">{nextCajaId}</span></span>)}</p>
            </div>
          ) : (
            // Vista no-Ensamblaje: remover filtro y botón Escanear según requerimiento
            <div className="flex flex-col mb-2 sm:mb-3">
              <input
                type="text"
                placeholder="Buscar por nombre o RFID..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                maxLength={24}
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>
          )}
  {(subEstadoDestino === 'Ensamblaje' || subEstadoDestino === 'Despacho') && (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
              <div className="sm:col-span-2">
        <label className="block text-xs text-gray-600 mb-1">Tiempo de operación para {subEstadoDestino} (obligatorio)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={0}
                    placeholder="Horas"
                    value={horas}
                    onChange={(e) => setHoras(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-24 px-3 py-2 border rounded-md text-sm"
                  />
                  <input
                    type="number"
                    min={0}
                    max={59}
                    placeholder="Minutos"
                    value={minutos}
                    onChange={(e) => setMinutos(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-28 px-3 py-2 border rounded-md text-sm"
                  />
                </div>
              </div>
              <div className="text-xs text-gray-500">
        Debes ingresar horas y/o minutos para permitir el movimiento.
              </div>
            </div>
          )}
          
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm min-h-[22px]">
            {itemsSeleccionados.length > 0 && (
              <span className="text-gray-600">{itemsSeleccionados.length} seleccionado(s)</span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="space-y-2">
            {subEstadoDestino === 'Ensamblaje' && (
              <div className="mb-3 rounded-lg border bg-gradient-to-br from-gray-50 to-white p-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-800">Composición requerida: 1 CUBE · 1 VIP · 6 TIC</h4>
                    <p className="text-[11px] text-gray-600 mt-0.5">Sólo se permite escanear (sin selección manual). La caja se arma cuando la composición es exacta.</p>
                  </div>
                  <div className={`text-[11px] px-2 py-1 rounded-full font-medium self-start ${validComposition ? 'bg-green-100 text-green-700':'bg-orange-100 text-orange-700'}`}>{compositionStatusText()}</div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4">
                  {[{k:'Cube', label:'CUBE', color:'blue', total:requiredComposition.Cube, val:selectedCounts.Cube||0}, {k:'VIP', label:'VIP', color:'purple', total:requiredComposition.VIP, val:selectedCounts.VIP||0}, {k:'TIC', label:'TIC', color:'green', total:requiredComposition.TIC, val:selectedCounts.TIC||0}].map(card => {
                    const pct = Math.min(100, (card.val / card.total) * 100);
                    const full = card.val === card.total;
                    return (
                      <div key={card.k} className={`relative rounded-md border p-3 flex flex-col gap-2 ${full? 'bg-'+card.color+'-50 border-'+card.color+'-300':'bg-white'} transition-colors` as any}>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] tracking-wide text-gray-500">{card.label}</span>
                          <span className={`text-[10px] font-semibold ${full? 'text-green-600':'text-gray-500'}`}>{card.val}/{card.total}</span>
                        </div>
                        <div className="h-1.5 w-full bg-gray-200 rounded overflow-hidden">
                          <div className={`h-full bg-${card.color}-500 transition-all`} style={{width: pct+'%'}} />
                        </div>
                        {full && <span className="absolute top-1 right-1 text-[9px] text-green-600 font-medium">OK</span>}
                      </div>
                    );
                  })}
                </div>
                {!validComposition && itemsSeleccionados.length>0 && (
                  <div className="mt-3 text-[11px] text-red-600 font-medium">Faltan elementos para completar la composición exacta.</div>
                )}

                {itemsSeleccionados.length>0 && (
                  <div className="mt-4 border-t pt-3">
                    <h5 className="text-[11px] font-semibold text-gray-700 mb-2 tracking-wide">Escaneados ({itemsSeleccionados.length})</h5>
                    <div className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-1">
                      {itemsSeleccionados.map(it => (
                        <div key={it.id} className="flex items-center justify-between text-[11px] bg-white/70 border border-gray-200 rounded px-2 py-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`px-1.5 py-0.5 rounded font-medium tracking-wide whitespace-nowrap ${
                              it.categoria==='TIC' ? 'bg-green-100 text-green-700' :
                              it.categoria==='VIP' ? 'bg-purple-100 text-purple-700' :
                              (it.categoria==='Cube'||it.categoria==='CUBE') ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                            }`}>{it.categoria}</span>
                            <span className="truncate max-w-[120px] text-gray-800" title={it.nombre_unidad}>{it.nombre_unidad}</span>
                            <span className="font-mono text-[10px] text-gray-500">{it.rfid?.slice(-6)}</span>
                          </div>
                          <button
                            onClick={() => setItemsSeleccionados(prev => prev.filter(x => x.id !== it.id))}
                            className="text-gray-400 hover:text-red-600 ml-2"
                            title="Quitar"
                          >×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Ocultamos listado manual en Ensamblaje para forzar solo escaneo */}
            {subEstadoDestino !== 'Ensamblaje' && itemsFiltrados.map((item) => {
                const isSelected = itemsSeleccionados.find(s => s.id === item.id);
                const cat = (item.categoria||'').toUpperCase();
                let bloqueado = false;
                if (subEstadoDestino==='Ensamblaje') {
                  if (cat==='TIC' && (selectedCounts.TIC||0) >= requiredComposition.TIC && !isSelected) bloqueado=true;
                  if (cat==='VIP' && (selectedCounts.VIP||0) >= requiredComposition.VIP && !isSelected) bloqueado=true;
                  if (cat==='CUBE' && (selectedCounts.Cube||0) >= requiredComposition.Cube && !isSelected) bloqueado=true;
                }
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (bloqueado) return;
                      if (isSelected) {
                        setItemsSeleccionados(prev => prev.filter(s => s.id !== item.id));
                      } else {
                        setItemsSeleccionados(prev => [...prev, item]);
                      }
                    }}
                    className={`p-3 border rounded cursor-pointer transition-all ${bloqueado? 'opacity-40 cursor-not-allowed':''} ${
                      isSelected ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={!!isSelected}
                        onChange={() => {}}
                        className="mt-0.5 rounded"
                        disabled={bloqueado}
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
                          {bloqueado && <span className="text-[10px] text-red-500">Cupo lleno</span>}
                        </div>
                        <div className="text-xs text-gray-600 mt-1 break-words">
                          <span className="mr-2">RFID: {item.rfid}</span>
                          {item.lote && <span className="mr-2">Caja: {item.lote}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
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
              onClick={() => {
                const h = parseInt(horas || '0', 10);
                const m = parseInt(minutos || '0', 10);
                const totalMin = (Number.isNaN(h) ? 0 : h) * 60 + (Number.isNaN(m) ? 0 : m);
                const requiereTiempo = subEstadoDestino === 'Ensamblaje' || subEstadoDestino === 'Despacho';
                if (requiereTiempo && totalMin <= 0) {
                  alert('Debes ingresar un tiempo (horas y/o minutos) para continuar.');
                  return;
                }
                if (subEstadoDestino === 'Ensamblaje' && !validComposition) {
                  alert('Composición inválida. Debes seleccionar exactamente 6 TIC, 1 VIP y 1 CUBE.');
                  return;
                }
                onConfirm(itemsSeleccionados, subEstadoDestino, totalMin > 0 ? totalMin : undefined);
              }}
              disabled={itemsSeleccionados.length === 0 || cargando || ((subEstadoDestino === 'Ensamblaje' || subEstadoDestino === 'Despacho') && ((parseInt(horas || '0', 10) * 60 + parseInt(minutos || '0', 10)) <= 0)) || (subEstadoDestino==='Ensamblaje' && !validComposition)}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {cargando && (
                <Loader className="w-4 h-4 animate-spin" />
              )}
              {cargando ? 
                `Moviendo...` : subEstadoDestino === 'Ensamblaje' ? `Armar caja (${itemsSeleccionados.length})` : `Mover a ${subEstadoDestino} (${itemsSeleccionados.length})`
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

