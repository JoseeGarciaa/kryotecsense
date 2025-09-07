import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Scan, Plus, Loader, ChevronDown, Menu, Play, Pause, Edit, Trash2, Search, CheckCircle, X, Activity } from 'lucide-react';
import InlineCountdown from '../../../shared/components/InlineCountdown';
import { useOperaciones } from '../hooks/useOperaciones';
import RfidScanModal from './RfidScanModal';
import LoteSelectionModal from './LoteSelectionModal';
import TimerModal from './TimerModal';
import { useTimerContext } from '../../../contexts/TimerContext';
import { apiServiceClient } from '../../../api/apiClient';
import WebSocketStatus from '../../../shared/components/WebSocketStatus';

interface TicItem {
  id: string;
  rfid: string;
  nombre_unidad: string;
  lote?: string;
  estado?: string;
  sub_estado?: string;
  fecha_registro?: string;
}

const PreAcondicionamientoView: React.FC = () => {
  // Estado principal por fase
  const [ticsCongelamiento, setTicsCongelamiento] = useState<TicItem[]>([]);
  const [ticsAtemperamiento, setTicsAtemperamiento] = useState<TicItem[]>([]);

  // Modal escaneo
  const [mostrarModalEscaneo, setMostrarModalEscaneo] = useState(false);
  const [tipoEscaneoActual, setTipoEscaneoActual] = useState<'congelamiento' | 'atemperamiento'>('congelamiento');
  const [rfidInput, setRfidInput] = useState('');
  const [rfidsEscaneados, setRfidsEscaneados] = useState<string[]>([]);
  const [ultimosRfidsEscaneados, setUltimosRfidsEscaneados] = useState<Record<string, number>>({});

  // Estados backend / UI
  const [cargando, setCargando] = useState(false);
  const [cargandoTemporizador, setCargandoTemporizador] = useState(false);
  const [mostrarModalLotes, setMostrarModalLotes] = useState(false);
  const [mostrarModalTimer, setMostrarModalTimer] = useState(false);
  const [tipoOperacionTimer, setTipoOperacionTimer] = useState<'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion'>('congelamiento');
  const [rfidsPendientesTimer, setRfidsPendientesTimer] = useState<string[]>([]);

  // Paginación / búsqueda
  const [paginaActualCongelamiento, setPaginaActualCongelamiento] = useState(1);
  const [paginaActualAtemperamiento, setPaginaActualAtemperamiento] = useState(1);
  const [busquedaCongelamiento, setBusquedaCongelamiento] = useState('');
  const [busquedaAtemperamiento, setBusquedaAtemperamiento] = useState('');
  const itemsPorPagina = 20;
  // Vista global: 'tabla' o 'lotes'
  const [vistaGlobal, setVistaGlobal] = useState<'tabla' | 'lotes'>('tabla');

  // Dropdown refs y control
  const dropdownRefCongelacion = React.useRef<HTMLDivElement>(null);
  const dropdownRefAtemperamiento = React.useRef<HTMLDivElement>(null);
  const [showDropdownCongelacion, setShowDropdownCongelacion] = useState(false);
  const [showDropdownAtemperamiento, setShowDropdownAtemperamiento] = useState(false);

  // Operaciones generales
  const operaciones = useOperaciones();

  // Timer context
  const {
    timers,
    iniciarTimer,
    iniciarTimers,
    pausarTimer,
    reanudarTimer,
    eliminarTimer,
    formatearTiempo,
    isStartingBatchFor,
    isConnected,
    getRecentCompletion,
    clearRecentCompletion
  } = useTimerContext();

  // Carga inicial
  useEffect(() => { cargarDatos(); }, []);

  // Actualizar listas cuando cambia inventario
  useEffect(() => {
    if (operaciones.inventarioCompleto?.length && !cargando) {
      setTicsCongelamiento(filtrarTicsCongelamiento(operaciones.inventarioCompleto));
      setTicsAtemperamiento(filtrarTicsAtemperamiento(operaciones.inventarioCompleto));
    }
  }, [operaciones.inventarioCompleto, cargando]);

  // Cerrar dropdowns clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRefCongelacion.current && !dropdownRefCongelacion.current.contains(e.target as Node)) {
        setShowDropdownCongelacion(false);
      }
      if (dropdownRefAtemperamiento.current && !dropdownRefAtemperamiento.current.contains(e.target as Node)) {
        setShowDropdownAtemperamiento(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Normalizador compacto
  const norm = (s: string | null | undefined) => (s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

  const filtrarTicsCongelamiento = (inventario: any[]) => {
    return inventario.filter(item => {
      if (item.categoria !== 'TIC') return false;
      const estado = norm(item.estado).replace(/[-_\s]/g, '');
      const sub = norm(item.sub_estado);
      const esPre = estado.includes('preacondicionamiento');
      const esCong = ['congelacion', 'congelamiento'].some(v => sub.includes(v));
      return esPre && esCong;
    });
  };

  const filtrarTicsAtemperamiento = (inventario: any[]) => {
    return inventario.filter(item => {
      if (item.categoria !== 'TIC') return false;
      const estado = norm(item.estado).replace(/[-_\s]/g, '');
      const sub = norm(item.sub_estado);
      return estado.includes('preacondicionamiento') && sub.includes('atemperamiento');
    });
  };

  const cargarDatos = async () => {
    try { setCargando(true); await operaciones.actualizarColumnasDesdeBackend(); } finally { setCargando(false); }
  };

  // Ref para evitar loops de asignación de lote
  const lotesAutoSolicitadosRef = useRef<Set<string>>(new Set());

  // Asignar automáticamente lotes faltantes (cuando backend aún no los asignó) para Congelación / Atemperamiento
  useEffect(() => {
    if (!operaciones.inventarioCompleto?.length) return;
    // Buscar TICs en pre acondicionamiento (congelación o atemperamiento) sin lote
    const candidatos = operaciones.inventarioCompleto.filter((i: any) => {
      if (i.categoria !== 'TIC') return false;
      const est = norm(i.estado).replace(/[-_\s]/g,'');
      if (!est.includes('preacondicionamiento')) return false;
      const sub = norm(i.sub_estado);
      const esFaseValida = ['congelacion','congelamiento','atemperamiento'].some(v => sub.includes(v));
      if (!esFaseValida) return false;
      const sinLote = !i.lote || !String(i.lote).trim();
      if (!sinLote) return false;
      if (lotesAutoSolicitadosRef.current.has(i.rfid)) return false;
      return true;
    });
    if (!candidatos.length) return;
    // Agrupar por sub_estado normalizado (congelacion vs atemperamiento) para enviar el valor correcto al backend
    const grupos: Record<string, string[]> = {};
    candidatos.forEach((c:any) => {
      const sub = norm(c.sub_estado);
      let clave: string;
      if (['congelacion','congelamiento'].some(v => sub.includes(v))) clave = 'Congelación'; else clave = 'Atemperamiento';
      if (!grupos[clave]) grupos[clave] = [];
      grupos[clave].push(c.rfid);
      lotesAutoSolicitadosRef.current.add(c.rfid);
    });
    // Por cada grupo, solicitar asignación automática y luego refrescar
    (async () => {
      try {
        await Promise.all(Object.entries(grupos).map(([subEstado, rfids]) => apiServiceClient.patch('/inventory/inventario/asignar-lote-automatico', {
          rfids,
          estado: 'Pre acondicionamiento',
          sub_estado: subEstado
        }).catch(()=>undefined)));
        // Refrescar para reflejar lotes
        await cargarDatos();
      } catch {/* silencioso */}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operaciones.inventarioCompleto]);

  // RFID scan (modal manual / lector)
  const procesarRfid = (rfid: string) => {
    const limpio = rfid.trim();
    if (!limpio) return;
    const ahora = Date.now();
    if (ultimosRfidsEscaneados[limpio] && ahora - ultimosRfidsEscaneados[limpio] < 2000) return;
    setUltimosRfidsEscaneados(prev => ({ ...prev, [limpio]: ahora }));
    if (!/^[a-zA-Z0-9]+$/.test(limpio)) { alert('RFID inválido. Solo letras y números.'); return; }
    const item = operaciones.inventarioCompleto.find(i => i.rfid === limpio || i.nombre_unidad === limpio);
    if (!item) { alert(`RFID ${limpio} no encontrado`); return; }
    if (item.categoria !== 'TIC') { alert('Solo se permiten TICs.'); return; }
    if (tipoEscaneoActual === 'atemperamiento') {
      const estadoLower = norm(item.estado);
      const subLower = norm(item.sub_estado);
      const esPre = estadoLower.replace(/[-_\s]/g,'').includes('preacondicionamiento');
      if (!(esPre && subLower.includes('congel'))) { alert('Debe provenir de Congelación en Pre acondicionamiento.'); return; }
    }
    if (!rfidsEscaneados.includes(limpio)) setRfidsEscaneados(p => [...p, limpio]);
  };

  const handleRfidChange = (v: string) => setRfidInput(v);

  const abrirModalEscaneo = (tipo: 'congelamiento' | 'atemperamiento') => {
    setTipoEscaneoActual(tipo);
    setRfidsEscaneados([]);
    setUltimosRfidsEscaneados({});
    setRfidInput('');
    setMostrarModalEscaneo(true);
  };

  const manejarEscaneoRfid = () => {
    const code = rfidInput.trim();
    if (!code) return;
    procesarRfid(code);
    setRfidInput('');
  };

  const confirmarAdicion = async (rfids: string[]): Promise<boolean> => {
    if (!rfids.length) return false;
    // Avisar si hay timers activos
    const activos = rfids.filter(r => tieneTimerActivo(r));
    if (activos.length) {
      const mensaje = activos.length === 1 ?
        `El TIC ${activos[0]} tiene un cronómetro activo. ¿Continuar y eliminarlo?` :
        `${activos.length} TICs tienen cronómetro activo. ¿Continuar y eliminarlos?`;
      if (!window.confirm(mensaje)) return false;
      activos.forEach(r => { const t = obtenerTemporizadorTIC(r); if (t) eliminarTimer(t.id); });
    }
    setMostrarModalEscaneo(false);
    setRfidsEscaneados([]);
    setUltimosRfidsEscaneados({});
    setRfidsPendientesTimer(rfids);
    setTipoOperacionTimer(tipoEscaneoActual);
    setMostrarModalTimer(true);
    return true;
  };

  const confirmarConTemporizador = async (tiempoMinutos: number) => {
    setCargandoTemporizador(true);
    const rfids = [...rfidsPendientesTimer];
    const tipoSel = tipoOperacionTimer;
    const subEstadoFinal = tipoSel === 'congelamiento' ? 'Congelación' : 'Atemperamiento';
    setMostrarModalTimer(false);
    setRfidsPendientesTimer([]);
    try {
      // Reemplazar timers existentes antes de crear los nuevos (evita duplicados que causan “tiempo loco”).
      rfids.forEach(r => {
        timers
          .filter(t => norm(t.nombre) === norm(r) && t.tipoOperacion === tipoSel)
          .forEach(t => eliminarTimer(t.id));
      });
      if (rfids.length === 1) {
        iniciarTimer(rfids[0], tipoSel, tiempoMinutos);
      } else {
        iniciarTimers(rfids, tipoSel, tiempoMinutos);
      }
      const items = operaciones.inventarioCompleto.filter(i => rfids.includes(i.rfid));
      if (items.length) {
        try { await apiServiceClient.post('/inventory/iniciar-timers-masivo', { items_ids: items.map((i:any)=>i.id).filter(Boolean), tipoOperacion: tipoSel, tiempoMinutos }); } catch {}
      }
      setCargandoTemporizador(false);
      setTimeout(async () => {
        try { await apiServiceClient.patch('/inventory/inventario/asignar-lote-automatico', { rfids, estado: 'Pre acondicionamiento', sub_estado: subEstadoFinal }); await cargarDatos(); } catch {}
      }, 60);
    } catch { setCargandoTemporizador(false); }
  };

  // Timers helpers
  const obtenerTemporizadorTIC = (rfid: string) => {
    const n = norm(rfid);
    return timers.find(t => norm(t.nombre) === n && !t.completado);
  };
  const obtenerTimerActivoPorTipo = (rfid: string, tipo: 'congelamiento' | 'atemperamiento') => {
    const n = norm(rfid); return timers.find(t => norm(t.nombre) === n && !t.completado && t.tipoOperacion === tipo);
  };
  const obtenerTimerCompletadoPorTipo = (rfid: string, tipo: 'congelamiento' | 'atemperamiento') => {
    const n = norm(rfid); return timers.find(t => norm(t.nombre) === n && t.completado && t.tipoOperacion === tipo);
  };
  const tieneTimerActivo = (rfid: string) => { const t = obtenerTemporizadorTIC(rfid); return t ? t.activo && !t.completado : false; };
  // Estado visual: si el cronómetro de congelación terminó o se limpió recientemente, mostrar "Congelado" sin cambiar todavía el sub_estado real (hasta confirmación).
  const esTicCongeladoVisual = (rfid: string) => {
    const timerActivo = obtenerTimerActivoPorTipo(rfid, 'congelamiento');
    const timerCompletado = obtenerTimerCompletadoPorTipo(rfid, 'congelamiento');
    const ceroAlcanzado = timerActivo && (timerActivo.tiempoRestanteSegundos ?? 0) <= 0;
    const reciente = !timerCompletado && !timerActivo ? getRecentCompletion(rfid, 'congelamiento') : null;
    return !!timerCompletado || !!reciente || !!ceroAlcanzado;
  };
  // Estado visual para atemperamiento
  const esTicAtemperadoVisual = (rfid: string) => {
    const timerActivo = obtenerTimerActivoPorTipo(rfid, 'atemperamiento');
    const timerCompletado = obtenerTimerCompletadoPorTipo(rfid, 'atemperamiento');
    const ceroAlcanzado = timerActivo && (timerActivo.tiempoRestanteSegundos ?? 0) <= 0;
    const reciente = !timerCompletado && !timerActivo ? getRecentCompletion(rfid, 'atemperamiento') : null;
    return !!timerCompletado || !!reciente || !!ceroAlcanzado;
  };

  const completarTIC = async (rfid: string, timerCompletado: any | null, tipoSeccion?: 'congelamiento' | 'atemperamiento') => {
    try {
      const tipoOp: 'congelamiento' | 'atemperamiento' = timerCompletado?.tipoOperacion || (tipoSeccion as any) || 'congelamiento';
      let siguienteEstado = ''; let siguienteSubEstado = ''; let tiempoNuevo = 0;
      if (tipoOp === 'congelamiento') { siguienteEstado = 'Pre acondicionamiento'; siguienteSubEstado = 'Atemperamiento'; }
      else { siguienteEstado = 'Acondicionamiento'; siguienteSubEstado = 'Ensamblaje'; }
      const msg = tipoOp === 'congelamiento'
        ? `¿Completar congelamiento de ${rfid}?\nSe moverá a Atemperamiento.`
        : `¿Completar atemperamiento de ${rfid}?\nSe moverá a Acondicionamiento.`;
      if (!window.confirm(msg)) return;
      let resultado: any = false;
      if (tipoOp === 'congelamiento') resultado = await operaciones.confirmarPreAcondicionamiento([rfid], siguienteSubEstado); else resultado = await operaciones.moverTicAAcondicionamiento(rfid);
      if (resultado || resultado !== false) {
        if (timerCompletado?.id) eliminarTimer(timerCompletado.id);
        await cargarDatos();
        alert(tipoOp === 'congelamiento' ? `✅ TIC ${rfid} movido a Atemperamiento` : `✅ TIC ${rfid} movido a Acondicionamiento`);
      } else {
        throw new Error('No se pudo actualizar.');
      }
    } catch (e:any) { alert(`Error al completar ${rfid}: ${e.message || e}`); }
  };

  // Batch completar
  const timersCongelamientoCompletadosEnSeccion = useMemo(
    () => timers.filter(t => t.completado && t.tipoOperacion === 'congelamiento' && ticsCongelamiento.some(tc => norm(tc.rfid) === norm(t.nombre))),
    [timers, ticsCongelamiento]
  );
  const timersAtemperamientoCompletadosEnSeccion = useMemo(
    () => timers.filter(t => t.completado && t.tipoOperacion === 'atemperamiento' && ticsAtemperamiento.some(tc => norm(tc.rfid) === norm(t.nombre))),
    [timers, ticsAtemperamiento]
  );

  const completarTodasCongelamiento = async () => {
    try {
      const lista = timersCongelamientoCompletadosEnSeccion;
      if (!lista.length) { alert('No hay TICs completadas.'); return; }
      if (!window.confirm(`Completar ${lista.length} TIC(s) de congelamiento y mover a Atemperamiento?`)) return;
      const rfids = lista.map(t => t.nombre);
      const ok = await operaciones.confirmarPreAcondicionamiento(rfids, 'Atemperamiento');
      if (!ok && ok !== undefined) throw new Error('No se pudo actualizar.');
      lista.forEach(t => eliminarTimer(t.id));
      await cargarDatos();
      alert(`✅ ${lista.length} TIC(s) movidas a Atemperamiento`);
    } catch (e:any) { alert(`❌ Error: ${e.message || e}`); }
  };

  const completarTodasAtemperamiento = async () => {
    try {
      const lista = timersAtemperamientoCompletadosEnSeccion;
      if (!lista.length) { alert('No hay TICs completadas.'); return; }
      if (!window.confirm(`Completar ${lista.length} TIC(s) de atemperamiento y mover a Acondicionamiento?`)) return;
      for (const t of lista) { await operaciones.moverTicAAcondicionamiento(t.nombre); eliminarTimer(t.id); }
      await cargarDatos();
      alert(`✅ ${lista.length} TIC(s) movidas a Acondicionamiento`);
    } catch (e:any) { alert(`❌ Error: ${e.message || e}`); }
  };

  // Limpiar (botón individual) debounce simple
  const [botonesLimpiandoSet, setBotonesLimpiandoSet] = useState<Set<string>>(new Set());
  const limpiarTimerConDebounce = useCallback((timerId: string) => {
    setBotonesLimpiandoSet(prev => {
      if (prev.has(timerId)) return prev;
      const nuevo = new Set(prev); nuevo.add(timerId);
      setTimeout(() => {
        try { eliminarTimer(timerId); } finally {
          setTimeout(() => setBotonesLimpiandoSet(p => { const n = new Set(p); n.delete(timerId); return n; }), 400);
        }
      }, 0);
      return nuevo;
    });
  }, [eliminarTimer]);

  // Dedupe defensivo: si por alguna razón quedaron timers duplicados por nombre+tipoOperacion, conservar el más reciente.
  useEffect(() => {
    if (!timers.length) return;
    const seen = new Map<string, string>(); // key -> timerId a conservar
    const toRemove: string[] = [];
    timers.forEach(t => {
      const key = `${norm(t.nombre)}|${t.tipoOperacion}`;
      if (!seen.has(key)) {
        seen.set(key, t.id);
      } else {
        // Conservar el que tenga fechaFin mayor (más nuevo)
        const keptId = seen.get(key)!;
        const kept = timers.find(x => x.id === keptId);
        if (kept && kept.fechaFin < t.fechaFin) {
          // Remover el anterior
            toRemove.push(kept.id);
            seen.set(key, t.id);
        } else {
          toRemove.push(t.id);
        }
      }
    });
    if (toRemove.length) {
      toRemove.forEach(id => eliminarTimer(id));
    }
  }, [timers, eliminarTimer]);

  const limpiarTimersCompletadosPorTipo = async (tipo: 'congelamiento' | 'atemperamiento', onlyIds?: string[]) => {
    let lista = timers.filter(t => t.completado && t.tipoOperacion === tipo);
    if (onlyIds?.length) { const ids = new Set(onlyIds); lista = lista.filter(t => ids.has(t.id)); }
    if (!lista.length) { alert('No hay cronómetros completados.'); return; }
    if (!window.confirm(`¿Limpiar ${lista.length} cronómetro(s) completado(s) de ${tipo}?`)) return;
    lista.forEach(t => eliminarTimer(t.id));
  };

  // Render temporal unificado (igual estilo Acondicionamiento)
  const renderizarTemporizador = (rfid: string, esAtemperamiento = false) => {
    if (isStartingBatchFor && isStartingBatchFor(rfid)) {
      return (
        <div className="flex flex-col items-center space-y-1 py-1 max-w-20">
          <span className="font-mono text-xs text-gray-500">--:--</span>
          <span className="text-[10px] text-gray-400">Iniciando…</span>
        </div>
      );
    }
    const timer = esAtemperamiento ? obtenerTimerActivoPorTipo(rfid, 'atemperamiento') : obtenerTimerActivoPorTipo(rfid, 'congelamiento');
    const timerCompletado = esAtemperamiento ? obtenerTimerCompletadoPorTipo(rfid, 'atemperamiento') : obtenerTimerCompletadoPorTipo(rfid, 'congelamiento');
    const tipoSeccion = esAtemperamiento ? 'atemperamiento' : 'congelamiento';
    const ceroAlcanzado = timer && (timer.tiempoRestanteSegundos ?? 0) <= 0;
    const reciente = !timerCompletado && !timer ? getRecentCompletion(rfid, tipoSeccion) : null;
    const mostrarCompleto = !!reciente || !!timerCompletado || (!!timer && ceroAlcanzado);
    if (mostrarCompleto) {
      const minutos = timerCompletado ? timerCompletado.tiempoInicialMinutos : (reciente?.minutes ?? (timer ? timer.tiempoInicialMinutos : 0));
      return (
        <div className="flex flex-col items-center space-y-1 py-1 max-w-24">
          <span className="text-green-600 text-xs font-medium flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            <span className="truncate">Completo</span>
          </span>
          <div className="text-xs text-gray-500 truncate">{minutos}min</div>
          <div className="flex gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); if (!window.confirm(`¿Limpiar cronómetro de ${rfid}?`)) return; if (timerCompletado) limpiarTimerConDebounce(timerCompletado.id); else if (reciente) clearRecentCompletion(rfid); }}
              disabled={timerCompletado ? botonesLimpiandoSet.has(timerCompletado.id) : false}
              className={`p-1.5 rounded text-xs transition-colors ${timerCompletado && botonesLimpiandoSet.has(timerCompletado.id) ? 'bg-gray-300 text-gray-500' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}
              title="Limpiar"
            >
              <X className="w-3 h-3" />
            </button>
            {!esAtemperamiento && (
              <button
                onClick={() => completarTIC(rfid, timerCompletado ?? null, tipoSeccion)}
                className="p-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-xs transition-colors"
                title="Completar"
              >
                <CheckCircle className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      );
    }
    if (!timer) {
      return (
        <div className="flex flex-col items-center space-y-1 py-1 max-w-20">
          <span className="text-gray-400 text-xs">Sin cronómetro</span>
          <button
            onClick={() => {
              setRfidsPendientesTimer([rfid]);
              if (ticsCongelamiento.find(t => t.rfid === rfid)) setTipoOperacionTimer('congelamiento');
              else if (ticsAtemperamiento.find(t => t.rfid === rfid)) setTipoOperacionTimer('atemperamiento');
              setMostrarModalTimer(true);
            }}
            className="p-1.5 bg-green-100 hover:bg-green-200 text-green-700 rounded text-xs"
            title="Iniciar cronómetro"
          >
            <Play className="w-3 h-3" />
          </button>
        </div>
      );
    }
    const esUrgente = timer.tiempoRestanteSegundos < 300;
    return (
      <div className="flex flex-col items-center space-y-1 py-1 max-w-20">
        <div className="flex items-center justify-center">
          <span className={`font-mono text-xs font-medium truncate ${esUrgente ? 'text-red-600' : (timer.tipoOperacion === 'congelamiento' ? 'text-blue-600' : 'text-orange-600')}`}> 
            <InlineCountdown endTime={timer.fechaFin} seconds={timer.tiempoRestanteSegundos} paused={!timer.activo} format={formatearTiempo} />
          </span>
        </div>
        {!timer.activo && <span className="text-xs text-gray-500">Pausado</span>}
        <div className="flex items-center gap-1">
          <button
            onClick={() => timer.activo ? pausarTimer(timer.id) : reanudarTimer(timer.id)}
            className={`p-1.5 rounded text-xs transition-colors ${timer.activo ? 'bg-yellow-100 hover:bg-yellow-200 text-yellow-700' : 'bg-green-100 hover:bg-green-200 text-green-700'}`}
            title={timer.activo ? 'Pausar' : 'Reanudar'}
          >
            {timer.activo ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </button>
          <button
            onClick={() => { setRfidsPendientesTimer([rfid]); setTipoOperacionTimer(timer.tipoOperacion); setMostrarModalTimer(true); }}
            className="p-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-xs"
            title="Editar"
          >
            <Edit className="w-3 h-3" />
          </button>
          <button
            onClick={() => eliminarTimer(timer.id)}
            className="p-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs"
            title="Eliminar"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  };

  // Lote selection
  const manejarSeleccionLote = (tics: string[]) => {
    setRfidsEscaneados(tics);
    setMostrarModalLotes(false);
    setMostrarModalEscaneo(true);
  };

  // Filtrado / paginación
  const filtrarTics = (tics: TicItem[], busqueda: string) => {
    if (!busqueda.trim()) return tics;
    const term = busqueda.toLowerCase();
    return tics.filter(t => t.rfid?.toLowerCase().includes(term) || t.nombre_unidad?.toLowerCase().includes(term) || t.lote?.toLowerCase().includes(term));
  };
  const paginar = (tics: TicItem[], pagina: number) => tics.slice((pagina - 1) * itemsPorPagina, (pagina - 1) * itemsPorPagina + itemsPorPagina);
  const totalPaginas = (total: number) => Math.ceil(total / itemsPorPagina);

  const ticsCongelamientoFiltrados = filtrarTics(ticsCongelamiento, busquedaCongelamiento);
  const ticsCongelamientoPaginados = paginar(ticsCongelamientoFiltrados, paginaActualCongelamiento);
  const totalPaginasCongelamiento = totalPaginas(ticsCongelamientoFiltrados.length);
  const ticsAtemperamientoFiltrados = filtrarTics(ticsAtemperamiento, busquedaAtemperamiento);
  const ticsAtemperamientoPaginados = paginar(ticsAtemperamientoFiltrados, paginaActualAtemperamiento);
  const totalPaginasAtemperamiento = totalPaginas(ticsAtemperamientoFiltrados.length);

  // Agrupación por lote para vista 'lotes' (sin paginación, filtrado ya aplicado)
  interface GrupoLote { lote: string; items: TicItem[]; count: number; }
  const gruposCongelamiento = useMemo<GrupoLote[]>(() => {
    if (vistaGlobal !== 'lotes') return [];
    const map = new Map<string, TicItem[]>();
    ticsCongelamientoFiltrados.forEach(it => {
      const key = it.lote || 'SIN LOTE';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    });
    return Array.from(map.entries()).map(([lote, items]) => ({ lote, items, count: items.length }))
      .sort((a,b)=>a.lote.localeCompare(b.lote));
  }, [ticsCongelamientoFiltrados, vistaGlobal]);
  const gruposAtemperamiento = useMemo<GrupoLote[]>(() => {
    if (vistaGlobal !== 'lotes') return [];
    const map = new Map<string, TicItem[]>();
    ticsAtemperamientoFiltrados.forEach(it => {
      const key = it.lote || 'SIN LOTE';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    });
    return Array.from(map.entries()).map(([lote, items]) => ({ lote, items, count: items.length }))
      .sort((a,b)=>a.lote.localeCompare(b.lote));
  }, [ticsAtemperamientoFiltrados, vistaGlobal]);

  const renderGrupoLote = (grupo: GrupoLote, esAtemperamiento=false) => (
    <div key={grupo.lote} className={`rounded-xl border shadow-sm overflow-hidden ${esAtemperamiento? 'bg-gradient-to-br from-orange-50 to-orange-100/40 border-orange-200':'bg-gradient-to-br from-blue-50 to-blue-100/40 border-blue-200'}`}>
      <div className={`px-4 py-3 flex items-center justify-between ${esAtemperamiento? 'bg-gradient-to-r from-orange-600 to-amber-500':'bg-gradient-to-r from-blue-600 to-cyan-500'} text-white`}> 
        <div className="flex flex-col">
          <span className="text-sm font-semibold">Lote {grupo.lote}</span>
          <span className="text-[11px] tracking-wide opacity-90">{grupo.count} TIC{grupo.count!==1?'s':''}</span>
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
              <span className={`hidden sm:inline px-2 py-0.5 rounded-full text-[10px] font-medium ${esAtemperamiento?'bg-orange-100 text-orange-700':'bg-blue-100 text-blue-700'}`}>{esAtemperamiento? (esTicAtemperadoVisual(item.rfid) ? 'Atemperado' : 'Atemperamiento') : (esTicCongeladoVisual(item.rfid) ? 'Congelado' : 'Congelación')}</span>
              {renderizarTemporizador(item.rfid, esAtemperamiento)}
            </div>
          </div>
        ))}
        {grupo.items.length===0 && (
          <div className="px-4 py-4 text-[11px] text-center text-gray-500">Sin TICs</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-2 sm:p-4 max-w-full">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Registrar Pre Acondicionamiento</h1>
        <WebSocketStatus isConnected={isConnected} className="mt-1" />
        <div className="mt-3 flex items-center gap-2 justify-end">
          <button
            onClick={() => setVistaGlobal('lotes')}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border ${vistaGlobal==='lotes'? 'bg-gray-900 text-white border-gray-900':'bg-white text-gray-700 hover:bg-gray-100 border-gray-300'}`}
            title="Vista agrupada por lote"
          >
            <Menu className="w-4 h-4" /> Lotes
          </button>
          <button
            onClick={() => setVistaGlobal('tabla')}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border ${vistaGlobal==='tabla'? 'bg-gray-900 text-white border-gray-900':'bg-white text-gray-700 hover:bg-gray-100 border-gray-300'}`}
            title="Vista tabla"
          >
            <Menu className="w-4 h-4 rotate-90" /> Tabla
          </button>
        </div>
      </div>

      {/* Congelamiento */}
      <div className="bg-white rounded-lg shadow-md mb-6 sm:mb-8 overflow-hidden">
        <div className="bg-blue-50 p-3 sm:p-4 border-b border-blue-100">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-blue-800">TICs para Congelamiento</h2>
                <span className="text-sm text-blue-600">({ticsCongelamientoFiltrados.length} de {ticsCongelamiento.length})</span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              {ticsCongelamiento.filter(t => !obtenerTimerActivoPorTipo(t.rfid, 'congelamiento')).length > 0 && (
                <button
                  onClick={() => {
                    const sinTimer = ticsCongelamiento.filter(t => !obtenerTimerActivoPorTipo(t.rfid, 'congelamiento'));
                    setRfidsPendientesTimer(sinTimer.map(t => t.rfid));
                    setTipoOperacionTimer('congelamiento');
                    setMostrarModalTimer(true);
                  }}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm"
                >
                  <Play size={16} />
                  Iniciar Todos ({ticsCongelamiento.filter(t => !obtenerTimerActivoPorTipo(t.rfid, 'congelamiento')).length})
                </button>
              )}
              {timersCongelamientoCompletadosEnSeccion.length > 0 && (
                <>
                  <button
                    onClick={() => limpiarTimersCompletadosPorTipo('congelamiento', timersCongelamientoCompletadosEnSeccion.map(t => t.id))}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-md text-sm"
                  >
                    <X size={16} /> Limpiar (Congelación)
                  </button>
                  <button
                    onClick={completarTodasCongelamiento}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm"
                  >
                    <CheckCircle size={16} /> Completar todas (Congelación)
                  </button>
                </>
              )}
              <div className="flex gap-2">
                <button
                  className={`p-2 rounded-md ${cargando ? 'bg-blue-100 text-blue-400 cursor-not-allowed' : 'hover:bg-blue-100 text-blue-600'}`}
                  title="Actualizar lista"
                  onClick={cargarDatos}
                  disabled={cargando}
                >
                  <Loader size={16} className={cargando ? 'animate-spin' : ''} />
                </button>
                <div className="relative" ref={dropdownRefCongelacion}>
                  <button
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-md flex items-center gap-2 text-sm"
                    onClick={() => setShowDropdownCongelacion(!showDropdownCongelacion)}
                  >
                    <Plus size={16} /> <span>Agregar TICs</span> <ChevronDown size={16} />
                  </button>
                  {showDropdownCongelacion && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200">
                      <div className="py-1">
                        <button
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                          onClick={() => { setRfidsEscaneados([]); setUltimosRfidsEscaneados({}); setRfidInput(''); abrirModalEscaneo('congelamiento'); setShowDropdownCongelacion(false); }}
                        >
                          <Scan size={16} /> Escanear TICs
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Búsqueda */}
        <div className="p-3 sm:p-4 bg-gray-50 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Buscar por RFID, nombre o lote..."
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={busquedaCongelamiento}
              onChange={e => { setBusquedaCongelamiento(e.target.value); setPaginaActualCongelamiento(1); }}
              maxLength={24}
            />
          </div>
        </div>
        {vistaGlobal==='tabla' ? (
          <div className="hidden sm:block overflow-x-auto">
            <div className="min-w-[720px]">
              <table className="w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">RFID</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">NOMBRE</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">LOTE</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">ESTADO</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">CRONÓMETRO</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {cargando ? (
                    <tr><td colSpan={5} className="px-3 py-6 text-center"><div className="flex items-center justify-center gap-2"><Loader className="animate-spin h-4 w-4 text-blue-600" /><span className="text-xs text-gray-500">Cargando...</span></div></td></tr>
                  ) : ticsCongelamientoPaginados.length ? (
                    ticsCongelamientoPaginados.map(tic => (
                      <tr key={tic.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-xs font-medium text-gray-900" title={tic.rfid}>{tic.rfid}</td>
                        <td className="px-3 py-2 text-xs text-gray-900" title={tic.nombre_unidad}>{tic.nombre_unidad}</td>
                        <td className="px-3 py-2 text-xs text-gray-900" title={tic.lote}>{tic.lote}</td>
                        <td className="px-3 py-2"><span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{esTicCongeladoVisual(tic.rfid) ? 'Congelado' : 'Congelamiento'}</span></td>
                        <td className="px-3 py-2 text-center"><div className="flex justify-center">{renderizarTemporizador(tic.rfid)}</div></td>
                      </tr>
                    ))
                  ) : busquedaCongelamiento ? (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-xs text-gray-500">No se encontraron TICs</td></tr>
                  ) : (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-xs text-gray-500">No hay TICs en congelamiento</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 p-4">
            {gruposCongelamiento.length ? gruposCongelamiento.map(g => renderGrupoLote(g,false)) : (
              <div className="col-span-full text-center text-xs text-gray-500 py-6">{busquedaCongelamiento? 'Sin resultados':'No hay TICs en congelamiento'}</div>
            )}
          </div>
        )}
        {/* Paginación */}
        {ticsCongelamientoFiltrados.length > itemsPorPagina && (
          <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs">
            <div>{(paginaActualCongelamiento - 1) * itemsPorPagina + 1}-{Math.min(paginaActualCongelamiento * itemsPorPagina, ticsCongelamientoFiltrados.length)} de {ticsCongelamientoFiltrados.length}</div>
            <div className="flex items-center gap-1">
              <button onClick={() => setPaginaActualCongelamiento(paginaActualCongelamiento - 1)} disabled={paginaActualCongelamiento === 1} className="px-2 py-1.5 border rounded disabled:opacity-50">‹</button>
              <span className="px-2">{paginaActualCongelamiento}/{totalPaginasCongelamiento}</span>
              <button onClick={() => setPaginaActualCongelamiento(paginaActualCongelamiento + 1)} disabled={paginaActualCongelamiento === totalPaginasCongelamiento} className="px-2 py-1.5 border rounded disabled:opacity-50">›</button>
            </div>
          </div>
        )}
      </div>

      {/* Atemperamiento */}
      <div className="bg-white rounded-lg shadow-md mb-6 sm:mb-8 overflow-hidden">
        <div className="bg-orange-50 p-3 sm:p-4 border-b border-orange-100">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-orange-800">TICs para Atemperamiento</h2>
                <span className="text-sm text-orange-600">({ticsAtemperamientoFiltrados.length} de {ticsAtemperamiento.length})</span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              {ticsAtemperamiento.filter(t => !obtenerTimerActivoPorTipo(t.rfid, 'atemperamiento')).length > 0 && (
                <button
                  onClick={() => {
                    const sinTimer = ticsAtemperamiento.filter(t => !obtenerTimerActivoPorTipo(t.rfid, 'atemperamiento'));
                    setRfidsPendientesTimer(sinTimer.map(t => t.rfid));
                    setTipoOperacionTimer('atemperamiento');
                    setMostrarModalTimer(true);
                  }}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-md text-sm"
                >
                  <Play size={16} /> Iniciar Todos ({ticsAtemperamiento.filter(t => !obtenerTimerActivoPorTipo(t.rfid, 'atemperamiento')).length})
                </button>
              )}
              {timersAtemperamientoCompletadosEnSeccion.length > 0 && (
                <>
                  <button
                    onClick={() => limpiarTimersCompletadosPorTipo('atemperamiento', timersAtemperamientoCompletadosEnSeccion.map(t => t.id))}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-md text-sm"
                  >
                    <X size={16} /> Limpiar (Atemperamiento)
                  </button>
                  <button
                    onClick={completarTodasAtemperamiento}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-md text-sm"
                  >
                    <CheckCircle size={16} /> Completar todas (Atemperamiento)
                  </button>
                </>
              )}
              <div className="flex gap-2 items-center">
                <button
                  className={`p-2 rounded-md ${cargando ? 'bg-orange-100 text-orange-400 cursor-not-allowed' : 'hover:bg-orange-100 text-orange-600'}`}
                  onClick={cargarDatos}
                  disabled={cargando}
                  title="Actualizar lista"
                >
                  <Loader size={16} className={cargando ? 'animate-spin' : ''} />
                </button>
                <div className="relative" ref={dropdownRefAtemperamiento}>
                  <button
                    className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded-md flex items-center gap-2 text-sm"
                    onClick={() => setShowDropdownAtemperamiento(!showDropdownAtemperamiento)}
                  >
                    <Plus size={16} /> <span>Agregar TICs</span> <ChevronDown size={16} />
                  </button>
                  {showDropdownAtemperamiento && (
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg z-10 border border-gray-200">
                      <div className="py-1 divide-y divide-gray-100">
                        <button
                          className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          onClick={() => { setRfidsEscaneados([]); setUltimosRfidsEscaneados({}); setRfidInput(''); abrirModalEscaneo('atemperamiento'); setShowDropdownAtemperamiento(false); }}
                        >
                          <Scan size={16} /> Escanear TICs
                        </button>
                        <button
                          className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          onClick={() => { setTipoEscaneoActual('atemperamiento'); setMostrarModalLotes(true); setShowDropdownAtemperamiento(false); }}
                        >
                          <Menu size={16} /> Seleccionar por lote
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Búsqueda */}
        <div className="p-3 sm:p-4 bg-gray-50 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Buscar por RFID, nombre o lote..."
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              value={busquedaAtemperamiento}
              onChange={e => { setBusquedaAtemperamiento(e.target.value); setPaginaActualAtemperamiento(1); }}
              maxLength={24}
            />
          </div>
        </div>
        {vistaGlobal==='tabla' ? (
          <div className="hidden sm:block overflow-x-auto">
            <div className="min-w-[720px]">
              <table className="w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">RFID</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">NOMBRE</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">LOTE</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">ESTADO</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">CRONÓMETRO</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {cargando ? (
                    <tr><td colSpan={5} className="px-3 py-6 text-center"><div className="flex items-center justify-center gap-2"><Loader className="animate-spin h-4 w-4 text-orange-600" /><span className="text-xs text-gray-500">Cargando...</span></div></td></tr>
                  ) : ticsAtemperamientoPaginados.length ? (
                    ticsAtemperamientoPaginados.map(tic => (
                      <tr key={tic.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-xs font-medium text-gray-900" title={tic.rfid}>{tic.rfid}</td>
                        <td className="px-3 py-2 text-xs text-gray-900" title={tic.nombre_unidad}>{tic.nombre_unidad}</td>
                        <td className="px-3 py-2 text-xs text-gray-900" title={tic.lote}>{tic.lote}</td>
                        <td className="px-3 py-2"><span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">{esTicAtemperadoVisual(tic.rfid) ? 'Atemperado' : 'Atemperamiento'}</span></td>
                        <td className="px-3 py-2 text-center"><div className="flex justify-center">{renderizarTemporizador(tic.rfid, true)}</div></td>
                      </tr>
                    ))
                  ) : busquedaAtemperamiento ? (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-xs text-gray-500">No se encontraron TICs</td></tr>
                  ) : (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-xs text-gray-500">No hay TICs en atemperamiento</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 p-4">
            {gruposAtemperamiento.length ? gruposAtemperamiento.map(g => renderGrupoLote(g,true)) : (
              <div className="col-span-full text-center text-xs text-gray-500 py-6">{busquedaAtemperamiento? 'Sin resultados':'No hay TICs en atemperamiento'}</div>
            )}
          </div>
        )}
        {/* Paginación */}
        {ticsAtemperamientoFiltrados.length > itemsPorPagina && (
          <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs">
            <div>{(paginaActualAtemperamiento - 1) * itemsPorPagina + 1}-{Math.min(paginaActualAtemperamiento * itemsPorPagina, ticsAtemperamientoFiltrados.length)} de {ticsAtemperamientoFiltrados.length}</div>
            <div className="flex items-center gap-1">
              <button onClick={() => setPaginaActualAtemperamiento(paginaActualAtemperamiento - 1)} disabled={paginaActualAtemperamiento === 1} className="px-2 py-1.5 border rounded disabled:opacity-50">‹</button>
              <span className="px-2">{paginaActualAtemperamiento}/{totalPaginasAtemperamiento}</span>
              <button onClick={() => setPaginaActualAtemperamiento(paginaActualAtemperamiento + 1)} disabled={paginaActualAtemperamiento === totalPaginasAtemperamiento} className="px-2 py-1.5 border rounded disabled:opacity-50">›</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal escaneo */}
      <RfidScanModal
        mostrarModal={mostrarModalEscaneo}
        rfidInput={rfidInput}
        rfidsEscaneados={rfidsEscaneados}
        onRfidInputChange={handleRfidChange}
        onEscanearRfid={manejarEscaneoRfid}
        onConfirmar={confirmarAdicion}
        onCancelar={() => { setMostrarModalEscaneo(false); setRfidsEscaneados([]); setUltimosRfidsEscaneados({}); setRfidInput(''); }}
        titulo={`Escanear TICs para ${tipoEscaneoActual === 'congelamiento' ? 'Congelamiento' : 'Atemperamiento'}`}
        descripcion={tipoEscaneoActual === 'atemperamiento' ? 'Solo TICs provenientes de Congelación.' : 'Solo TICs en Pre acondicionamiento.'}
        onEliminarRfid={rfid => setRfidsEscaneados(prev => prev.filter(r => r !== rfid))}
        subEstado={tipoEscaneoActual === 'congelamiento' ? 'Congelación' : 'Atemperamiento'}
        onProcesarRfidIndividual={procesarRfid}
      />

      {/* Modal selección lote */}
      <LoteSelectionModal
        mostrarModal={mostrarModalLotes}
        onCancelar={() => setMostrarModalLotes(false)}
        onSeleccionarLote={manejarSeleccionLote}
        subEstado={tipoEscaneoActual === 'congelamiento' ? 'Congelación' : 'Atemperamiento'}
      />

      {/* Modal cronómetro */}
      <TimerModal
        mostrarModal={mostrarModalTimer}
        onCancelar={() => { if (!cargandoTemporizador) { setMostrarModalTimer(false); setRfidsPendientesTimer([]); } }}
        onConfirmar={confirmarConTemporizador}
        titulo={`Configurar Cronómetro - ${tipoOperacionTimer === 'congelamiento' ? 'Congelación' : tipoOperacionTimer === 'atemperamiento' ? 'Atemperamiento' : tipoOperacionTimer === 'envio' ? 'Envío' : 'Inspección'}`}
        descripcion={`Configure el tiempo de ${tipoOperacionTimer === 'congelamiento' ? 'congelación' : tipoOperacionTimer === 'atemperamiento' ? 'atemperamiento' : tipoOperacionTimer === 'envio' ? 'envío' : 'inspección'} para ${rfidsPendientesTimer.length} TIC(s).`}
        tipoOperacion={tipoOperacionTimer}
        cargando={cargandoTemporizador}
      />
    </div>
  );
};

export default PreAcondicionamientoView;
