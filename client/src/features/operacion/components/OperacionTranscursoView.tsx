import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Package, Clock, CheckCircle, X, Play, Pause, Trash2, Edit } from 'lucide-react';
import { useOperaciones } from '../hooks/useOperaciones';
import { useEnvio } from '../hooks/useEnvio';
import { useTimerContext } from '../../../contexts/TimerContext';
import TimerModal from './TimerModal';
import InlineCountdown from '../../../shared/components/InlineCountdown';
import WebSocketStatus from '../../../shared/components/WebSocketStatus';

interface OperacionTranscursoViewProps {
  // No props requeridos por ahora
}

interface ItemEnTransito {
  id: number;
  nombre_unidad: string;
  rfid: string;
  lote: string;
  categoria: string;
  estado: string;
  sub_estado: string;
  timerId?: string;
  tiempoRestante?: string;
  fechaInicio?: string;
}

const OperacionTranscursoView: React.FC<OperacionTranscursoViewProps> = () => {
  const { inventarioCompleto, actualizarColumnasDesdeBackend } = useOperaciones();
  const envio = useEnvio(actualizarColumnasDesdeBackend);
  const { timers, formatearTiempo, pausarTimer, reanudarTimer, eliminarTimer, crearTimer, obtenerTimersCompletados, isConnected, getRecentCompletion, getRecentCompletionById, forzarSincronizacion } = useTimerContext();

  // InlineCountdown compartido
  const [busqueda, setBusqueda] = useState('');
  const [itemsEnTransito, setItemsEnTransito] = useState<ItemEnTransito[]>([]);
  const [itemsListosParaDespacho, setItemsListosParaDespacho] = useState<any[]>([]);
  const [itemsSeleccionados, setItemsSeleccionados] = useState<number[]>([]);
  // Sin tiempo predeterminado para TimerModal individual (el usuario debe ingresar horas/minutos)
  const [mostrarModalSeleccion, setMostrarModalSeleccion] = useState(false);
  const [itemsListosDespacho, setItemsListosDespacho] = useState<any[]>([]);
  const [itemsSeleccionadosModal, setItemsSeleccionadosModal] = useState<number[]>([]);
  // Filtros para el modal (diseño sin lotes)
  const [modalBusqueda, setModalBusqueda] = useState('');
  // Tiempo manual en el modal (opcional)
  const [horasEnvio, setHorasEnvio] = useState<string>('');
  const [minutosEnvio, setMinutosEnvio] = useState<string>('');

  // Índices de timers de envío (activos y completados) para lookup rápido por id
  const { activosPorId, completadosPorId, activosDespachoPorId, completadosDespachoPorId } = useMemo(() => {
    const extractFromNombre = (nombre: string): { id?: number; isDespacho: boolean } => {
      const n = (nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      const re = /^envio(?:\s*\([^)]*\))?\s+(?:#(\d+)\s*-\s*)?/i;
      const m = n.match(re);
      const isDespacho = /\(\s*despacho\s*\)/i.test(n);
      if (m && m[1]) return { id: Number(m[1]), isDespacho };
      const m2 = n.match(/#(\d+)\s*-\s*/);
      if (m2 && m2[1]) return { id: Number(m2[1]), isDespacho };
      return { isDespacho };
    };
    const activosPorId = new Map<number, any>();
    const completadosPorId = new Map<number, any>();
    const activosDespachoPorId = new Map<number, any>();
    const completadosDespachoPorId = new Map<number, any>();
    for (const t of timers) {
      if (t.tipoOperacion !== 'envio') continue;
      const { id, isDespacho } = extractFromNombre(t.nombre || '');
      if (typeof id === 'number' && !Number.isNaN(id)) {
        if (t.completado) {
          completadosPorId.set(id, t);
          if (isDespacho) completadosDespachoPorId.set(id, t);
        } else {
          activosPorId.set(id, t);
          if (isDespacho) activosDespachoPorId.set(id, t);
        }
      }
    }
    return { activosPorId, completadosPorId, activosDespachoPorId, completadosDespachoPorId };
  }, [timers]);

  // Derivar listas visibles desde inventario y timers
  useEffect(() => {
    // 1) Items en transcurso (tabla principal): estado operación > En transito
    const enTransito = (inventarioCompleto || []).filter(
      (item: any) => item.estado === 'operación' && item.sub_estado === 'En transito'
    );
    setItemsListosParaDespacho(enTransito);

    // 2) Items disponibles para iniciar envío en modal:
    //    Base: Acondicionamiento > Lista para Despacho
    const baseListaDespacho = (inventarioCompleto || []).filter(
      (item: any) => item.estado === 'Acondicionamiento' && item.sub_estado === 'Lista para Despacho'
    );

    //    Filtro: solo los que tienen su tiempo de envío de Despacho COMPLETADO (persistente, reciente etiqueta '(Despacho)' o llegó a 0)
    const elegibles = baseListaDespacho.filter((item: any) => {
      // Considerar preferentemente la variante "Envío (Despacho)" para habilitar el modal
      const timerCompletadoDesp = completadosDespachoPorId.get(item.id);
      if (timerCompletadoDesp) return true;

      // Considerar "reciente" SOLO del nombre exacto de Despacho (no por ID genérico para evitar confundir con Ensamblaje)
      const reciente = getRecentCompletion(`Envío (Despacho) #${item.id} - ${item.nombre_unidad}`, 'envio');
      if (reciente) return true;

  const timerActivoDesp = activosDespachoPorId.get(item.id);
  if (timerActivoDesp && (timerActivoDesp.tiempoRestanteSegundos ?? 0) <= 0) return true;

      return false;
    });

    setItemsListosDespacho(elegibles);
  }, [inventarioCompleto, completadosDespachoPorId, activosDespachoPorId, completadosPorId, getRecentCompletion, getRecentCompletionById]);
  
  // Lista filtrada para el modal (memoizada)
  const itemsFiltradosModal = useMemo(() => {
    const term = modalBusqueda.toLowerCase();
    return itemsListosDespacho.filter(item =>
      (typeof item.nombre_unidad === 'string' && item.nombre_unidad.toLowerCase().includes(term)) ||
      (typeof item.rfid === 'string' && item.rfid.toLowerCase().includes(term))
    );
  }, [itemsListosDespacho, modalBusqueda]);
  
  // Estados para modal de cronómetro
  const [mostrarModalTimer, setMostrarModalTimer] = useState(false);
  const [itemIdParaTimer, setItemIdParaTimer] = useState<number | null>(null);
  const [timerEnEdicion, setTimerEnEdicion] = useState<any>(null);
  const [cargandoTimer, setCargandoTimer] = useState(false);

  // Filtrar items según búsqueda
  const itemsFiltrados = itemsListosParaDespacho.filter(item =>
    (typeof item.nombre_unidad === 'string' && item.nombre_unidad.toLowerCase().includes(busqueda.toLowerCase())) ||
    (typeof item.rfid === 'string' && item.rfid.toLowerCase().includes(busqueda.toLowerCase()))
  );

  const completarEnvio = async (itemId: number) => {
    try {
      await envio.completarEnvio(itemId);
      // Los items se actualizarán automáticamente a través del useEffect
    } catch (error) {
      console.error('Error completando envío:', error);
    }
  };

  // Función para obtener el cronómetro asociado a un item (ID-estricto)
  const obtenerTemporizadorParaItem = useCallback((itemId: number) => {
    // 1) Si hay registro de envío con timerId, usarlo
    const registroEnvio = envio.itemsEnEnvio.find((e: any) => e.id === itemId);
    if (registroEnvio?.timerId) {
      const t = timers.find((x: any) => x.id === registroEnvio.timerId);
      if (t) return t;
    }

    // 2) Buscar por ID parseado del nombre del timer (activos o completados)
    const tById = activosPorId.get(itemId) || completadosPorId.get(itemId);
    if (tById) return tById;

    // 3) No asociar por nombre para evitar asignaciones cruzadas
    return undefined;
  }, [envio.itemsEnEnvio, timers, activosPorId, completadosPorId]);

  const renderizarTemporizador = (itemId: number) => {
    const timer = obtenerTemporizadorParaItem(itemId);
  if (!timer) {
      return (
        <div className="flex flex-col items-center space-y-1 py-1 max-w-20">
          <span className="text-gray-400 text-xs text-center">Sin cronómetro</span>
          <button
            onClick={() => iniciarTemporizadorParaItem(itemId)}
            className="flex items-center justify-center p-1.5 bg-green-100 hover:bg-green-200 text-green-700 rounded text-xs transition-colors"
            title="Iniciar cronómetro"
          >
            <Play className="w-3 h-3" />
          </button>
        </div>
      );
    }

  // Cronómetro completado (diseño unificado)
  if (timer.completado || (timer.tiempoRestanteSegundos ?? 0) <= 0) {
      return (
        <div className="flex flex-col items-center space-y-1 py-1 max-w-24">
          <span className="text-green-600 text-xs font-medium flex items-center gap-1">
            <CheckCircle className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">Completo</span>
          </span>
          <div className="text-xs text-gray-500 text-center truncate">
      {timer.tiempoInicialMinutos}min
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => eliminarTimer(timer.id)}
              className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs transition-colors"
              title="Limpiar"
            >
              <X className="w-3 h-3" />
            </button>
            <button
              onClick={() => editarTemporizadorItem(itemId, timer)}
              className="p-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-xs transition-colors"
              title="Crear nuevo cronómetro"
            >
              <Play className="w-3 h-3" />
            </button>
          </div>
        </div>
      );
    }

    // Timer activo o pausado
    const esUrgente = timer.tiempoRestanteSegundos < 300;
    return (
      <div className="flex flex-col items-center space-y-1 py-1 max-w-20">
        <div className="flex items-center justify-center">
          <span className={`font-mono text-xs font-medium truncate ${esUrgente ? 'text-red-600' : 'text-indigo-600'}`}>
            <InlineCountdown
              endTime={timer.fechaFin}
              seconds={timer.tiempoRestanteSegundos}
              paused={!timer.activo}
              format={formatearTiempo}
            />
          </span>
        </div>
        {!timer.activo && (
          <span className="text-xs text-gray-500">Pausado</span>
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={() => (timer.activo ? pausarTimer(timer.id) : reanudarTimer(timer.id))}
            className={`p-1.5 rounded text-xs transition-colors ${timer.activo ? 'bg-yellow-100 hover:bg-yellow-200 text-yellow-700' : 'bg-green-100 hover:bg-green-200 text-green-700'}`}
            title={timer.activo ? 'Pausar' : 'Reanudar'}
          >
            {timer.activo ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </button>
          <button
            onClick={() => editarTemporizadorItem(itemId, timer)}
            className="p-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-xs transition-colors"
            title="Editar cronómetro"
          >
            <Edit className="w-3 h-3" />
          </button>
          <button
            onClick={() => eliminarTimer(timer.id)}
            className="p-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs transition-colors"
            title="Eliminar cronómetro"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  };

  const cancelarEnvio = async (itemId: number) => {
    try {
      await envio.cancelarEnvio(itemId, 'Cancelado desde vista de operación');
      // Los items se actualizarán automáticamente a través del useEffect
    } catch (error) {
      console.error('Error cancelando envío:', error);
    }
  };

  // Función para iniciar cronómetro para un item específico
  const iniciarTemporizadorParaItem = (itemId: number) => {
  // Abrir modal para configurar tiempo con default 96h
  setItemIdParaTimer(itemId);
  setTimerEnEdicion(null);
  setMostrarModalTimer(true);
  };

  // Función para editar cronómetro existente
  const editarTemporizadorItem = (itemId: number, timer: any) => {
    setItemIdParaTimer(itemId);
    setTimerEnEdicion(timer);
    setMostrarModalTimer(true);
  };

  // Función para confirmar cronómetro (crear o editar)
  const confirmarTemporizador = async (tiempoMinutos: number) => {
    if (!itemIdParaTimer) return;

    setCargandoTimer(true);
    try {
      const item = inventarioCompleto.find(i => i.id === itemIdParaTimer);
      if (!item) return;

      if (timerEnEdicion) {
        // Editar timer existente - eliminar el viejo y crear uno nuevo
        eliminarTimer(timerEnEdicion.id);
      }

      // Crear nuevo timer de envío con el tiempo elegido
      const minutosElegidos = tiempoMinutos; // obligatorio > 0 desde el modal
      if (!minutosElegidos || minutosElegidos <= 0) {
        return;
      }
      const timerId = crearTimer(
        `Envío #${item.id} - ${item.nombre_unidad}`,
        'envio',
        minutosElegidos
      );

      // Siempre actualizar o crear el registro de envío
      const fechaInicio = new Date();
  const fechaEstimada = new Date(fechaInicio.getTime() + (minutosElegidos * 60 * 1000));

      const itemEnvio = {
        id: item.id,
        nombre_unidad: item.nombre_unidad,
        rfid: item.rfid,
        lote: item.lote || 'Sin lote',
        estado: 'operación',
        sub_estado: 'En transito',
        categoria: item.categoria || 'tics',
  tiempoEnvio: minutosElegidos,
        timerId, // Asegurar que se guarde el timerId
        fechaInicioEnvio: fechaInicio,
        fechaEstimadaLlegada: fechaEstimada
      };

      // Actualizar estado local de envío - siempre reemplazar/agregar
      envio.setItemsEnEnvio(prev => {
        const sinItemAnterior = prev.filter(i => i.id !== itemIdParaTimer);
        const nuevosItems = [...sinItemAnterior, itemEnvio];
        return nuevosItems;
      });

      // Cerrar modal
      setMostrarModalTimer(false);
      setItemIdParaTimer(null);
      setTimerEnEdicion(null);

    } catch (error) {
      console.error('Error configurando cronómetro:', error);
    } finally {
      setCargandoTimer(false);
    }
  };

  // Función para completar todos los envíos en lote
  const completarTodosLosEnvios = async () => {
    if (itemsListosParaDespacho.length === 0) return;
    
    const confirmacion = window.confirm(
      `¿Estás seguro de que quieres completar ${itemsListosParaDespacho.length} envíos?\n\n` +
      `Esto marcará todos los items como completados.\n\n` +
      `¿Continuar?`
    );
    
    if (confirmacion) {
      try {
  // Procesando en lote
        
        // Procesar todos los items en paralelo para mayor velocidad
        const promesas = itemsListosParaDespacho.map(item => envio.completarEnvio(item.id));
        await Promise.all(promesas);
        
        alert(`✅ ${itemsListosParaDespacho.length} envíos completados exitosamente`);
      } catch (error) {
  console.error('Error al completar envíos en lote:', error);
        alert(`❌ Error al completar algunos envíos`);
      }
    }
  };

  // Función para cancelar todos los envíos en lote
  const cancelarTodosLosEnvios = async () => {
    if (itemsListosParaDespacho.length === 0) return;
    
    const confirmacion = window.confirm(
      `¿Estás seguro de que quieres cancelar ${itemsListosParaDespacho.length} envíos?\n\n` +
      `Esto cancelará todos los envíos activos.\n\n` +
      `¿Continuar?`
    );
    
    if (confirmacion) {
      try {
  // Procesando cancelación en lote
        
        // Procesar todos los items en paralelo para mayor velocidad
        const promesas = itemsListosParaDespacho.map(item => 
          envio.cancelarEnvio(item.id, 'Cancelado en lote desde vista de operación')
        );
        await Promise.all(promesas);
        
        alert(`✅ ${itemsListosParaDespacho.length} envíos cancelados exitosamente`);
      } catch (error) {
        console.error('❌ Error al cancelar envíos en lote:', error);
        alert(`❌ Error al cancelar algunos envíos`);
      }
    }
  };

  // (modal sin lotes): no se requieren lotes ni filtros adicionales

  // Manejar selección de items en el modal
  const toggleSeleccionItemModal = (itemId: number) => {
    setItemsSeleccionadosModal(prev => {
      // Validar que prev sea un array
      if (!Array.isArray(prev)) {
        console.error('❌ itemsSeleccionadosModal no es un array:', prev);
        return [itemId];
      }
      
  return Array.isArray(prev) && prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId];
    });
  };

  // Seleccionar/Deseleccionar todos los resultados filtrados en el modal
  const toggleSeleccionTodosModal = () => {
    const idsFiltrados = itemsFiltradosModal.map(i => i.id);
    const todosSeleccionados = idsFiltrados.length > 0 && idsFiltrados.every(id => itemsSeleccionadosModal.includes(id));
    setItemsSeleccionadosModal(todosSeleccionados ? [] : idsFiltrados);
  };

  // Confirmar selección e iniciar envío
  const confirmarSeleccion = async () => {
    if (itemsSeleccionadosModal.length === 0) return;
    
    try {
      const h = parseInt(horasEnvio || '0', 10);
      const m = parseInt(minutosEnvio || '0', 10);
      const totalMin = (Number.isNaN(h) ? 0 : h) * 60 + (Number.isNaN(m) ? 0 : m);
      if (totalMin <= 0) {
        alert('Debes ingresar un tiempo (horas y/o minutos) para iniciar el envío.');
        return;
      }
      // Enfoque sin lotes: tomar los items seleccionados desde el inventario filtrado general
      const itemsParaEnvio = itemsListosDespacho.filter(item =>
        Array.isArray(itemsSeleccionadosModal) && itemsSeleccionadosModal.includes(item.id)
      );
  const tiempoManual = totalMin > 0 ? totalMin : undefined;

  await envio.iniciarEnvio(itemsParaEnvio, tiempoManual);
      
      // Cerrar modal y limpiar selección
      setMostrarModalSeleccion(false);
      setItemsSeleccionadosModal([]);
  setModalBusqueda('');
  setHorasEnvio('');
  setMinutosEnvio('');
    } catch (error) {
  console.error('Error iniciando envío:', error);
    }
  };

  // Manejar selección de items
  const toggleSeleccionItem = (itemId: number) => {
    setItemsSeleccionados(prev => {
      // Validar que prev sea un array
      if (!Array.isArray(prev)) {
        console.error('❌ itemsSeleccionados no es un array:', prev);
        return [itemId];
      }
      
  return Array.isArray(prev) && prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId];
    });
  };

  const seleccionarTodos = () => {
    // Validar que los arrays sean válidos
    if (!Array.isArray(itemsSeleccionados) || !Array.isArray(itemsListosParaDespacho)) {
      console.error('❌ Arrays no válidos en seleccionarTodos:', { itemsSeleccionados, itemsListosParaDespacho });
      setItemsSeleccionados([]);
      return;
    }
    
    if (itemsSeleccionados.length === itemsListosParaDespacho.length) {
      setItemsSeleccionados([]);
    } else {
      setItemsSeleccionados(itemsListosParaDespacho.map(item => item.id));
    }
  };

  // Iniciar envío de items seleccionados
  const iniciarEnvioSeleccionados = async () => {
    if (itemsSeleccionados.length === 0) return;
    
    try {
      const itemsParaEnvio = itemsListosParaDespacho.filter(item => 
  Array.isArray(itemsSeleccionados) && itemsSeleccionados.includes(item.id)
      );
      
  await envio.iniciarEnvio(itemsParaEnvio);
      setItemsSeleccionados([]);
      
      // Los items se actualizarán automáticamente a través del useEffect
    } catch (error) {
      console.error('Error iniciando envío:', error);
    }
  };

  const getCategoriaColor = (categoria: string) => {
    switch (categoria?.toLowerCase()) {
      case 'cube':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'vip':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'tics':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-white text-gray-800 border-gray-200';
    }
  };

  return (
  <div className="flex-1 overflow-hidden bg-white">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Gestión de Operación</h1>
            <WebSocketStatus isConnected={isConnected} className="mt-1" />
          </div>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        
        {/* Sección Items en Transcurso */}
        <div className="bg-white rounded-lg border border-orange-200 overflow-hidden">
          <div className="bg-orange-50 border-b border-orange-200 px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
              <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-orange-800">Items en Transcurso</h2>
                  <p className="text-xs sm:text-sm text-orange-600">({itemsListosParaDespacho.length} items en envío)</p>
                </div>
                <div className="hidden sm:inline-flex">
                  <WebSocketStatus isConnected={isConnected} />
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                {/* Botones de acción en lote - Solo mostrar si hay items */}
                {itemsListosParaDespacho.length > 0 && (
                  <>
                    <button
                      onClick={completarTodosLosEnvios}
                      className="inline-flex items-center gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2 bg-green-600 text-white text-xs sm:text-sm font-medium rounded-md hover:bg-green-700 transition-colors w-full sm:w-auto"
                      title="Completar todos los envíos"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Completar Todos
                    </button>
                    <button
                      onClick={cancelarTodosLosEnvios}
                      className="inline-flex items-center gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2 bg-red-600 text-white text-xs sm:text-sm font-medium rounded-md hover:bg-red-700 transition-colors w-full sm:w-auto"
                      title="Cancelar todos los envíos"
                    >
                      <X className="w-4 h-4" />
                      Cancelar Todos
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    try { if (isConnected) forzarSincronizacion(); } catch {}
                    setMostrarModalSeleccion(true);
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2 bg-blue-600 text-white text-xs sm:text-sm font-medium rounded-md hover:bg-blue-700 transition-colors w-full sm:w-auto"
                >
                  <Package className="w-4 h-4" />
                  Agregar Items
                </button>
              </div>
            </div>
          </div>

          {/* Búsqueda */}
          <div className="p-3 sm:p-4 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar por RFID o nombre..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                maxLength={24}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
          </div>

          {/* Lista responsive: tarjetas en móviles y tabla en >= sm */}
          {itemsListosParaDespacho.length > 0 ? (
          <>
          {/* Vista tarjetas para móviles */}
          <div className="sm:hidden p-3 space-y-3">
            {itemsFiltrados.map((item) => (
              <div key={item.id} className="border rounded-lg p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className={`px-2 py-1 text-xs font-medium rounded-full border ${getCategoriaColor(item.categoria)} whitespace-nowrap`}>
                    {item.rfid}
                  </div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-800">
                    En Transcurso
                  </span>
                </div>
                <div className="mt-2">
                  <div className="text-sm font-semibold text-gray-900 leading-tight">{item.nombre_unidad}</div>
                  <div className="text-xs text-gray-500">{item.categoria?.toUpperCase()}</div>
                </div>
                <div className="mt-3 flex items-center justify-start gap-2">
                  <div>{renderizarTemporizador(item.id)}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Tabla para >= sm */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    RFID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    NOMBRE
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ESTADO
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    CATEGORÍA
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    CRONÓMETRO
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {itemsFiltrados.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className={`px-2 py-1 text-xs font-medium rounded-full border ${getCategoriaColor(item.categoria)}`}>
                          {item.rfid}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {item.nombre_unidad}
                      </div>
                      <div className="text-sm text-gray-500">
                        {item.categoria?.toUpperCase()}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                        En Transcurso
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getCategoriaColor(item.categoria)}`}>
                        {item.categoria}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {renderizarTemporizador(item.id)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <div className="p-8 text-center text-gray-500">
            <Package className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p>No hay items en transcurso</p>
            <p className="text-sm text-gray-400 mt-1">
              Los items aparecerán aquí cuando se inicien los envíos
            </p>
          </div>
        )}
        </div>
      </div>

      {/* Modal de Selección de Items (alineado al diseño de Ensamblaje) */}
      {mostrarModalSeleccion && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl w-[92vw] max-w-md sm:max-w-2xl md:max-w-4xl max-h-[88vh] overflow-hidden flex flex-col">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-gray-800">Seleccionar items para envío</h2>
                <p className="text-xs sm:text-sm text-gray-600 mt-1 sm:mt-2">Items disponibles: {itemsListosDespacho.length}</p>
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
              {/* Búsqueda y tiempo (como Ensamblaje) */}
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
                    <label className="block text-xs text-gray-600 mb-1">Tiempo de envío (obligatorio)</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={0}
                        placeholder="Horas"
                        value={horasEnvio}
                        onChange={(e) => setHorasEnvio(e.target.value.replace(/[^0-9]/g, ''))}
                        className="w-24 px-3 py-2 border rounded-md text-sm"
                      />
                      <input
                        type="number"
                        min={0}
                        max={59}
                        placeholder="Minutos"
                        value={minutosEnvio}
                        onChange={(e) => setMinutosEnvio(e.target.value.replace(/[^0-9]/g, ''))}
                        className="w-28 px-3 py-2 border rounded-md text-sm"
                      />
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">Debes ingresar horas y/o minutos para iniciar el envío.</div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                  <button
                    onClick={() => setItemsSeleccionadosModal(itemsFiltradosModal.map(i => i.id))}
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

              {/* Lista de items, estilo tarjetas con checkbox a la izquierda */}
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
                        className={`p-3 border rounded cursor-pointer transition-all ${
                          selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={selected}
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
                  })
                )}
              </div>
            </div>
            
            {/* Controles del modal */}
    <div className="p-4 sm:p-6 border-t border-gray-200 flex items-center justify-end gap-2 sm:gap-3">
                <button
                  onClick={() => {
                    setMostrarModalSeleccion(false);
                    setItemsSeleccionadosModal([]);
                    setModalBusqueda('');
                    setHorasEnvio('');
                    setMinutosEnvio('');
                  }}
      className="px-4 py-2 text-sm text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarSeleccion}
                  disabled={itemsSeleccionadosModal.length === 0 || ((parseInt(horasEnvio || '0', 10) * 60 + parseInt(minutosEnvio || '0', 10)) <= 0)}
      className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
      Iniciar envío ({itemsSeleccionadosModal.length})
                </button>
            </div>
          </div>
        </div>
      )}

  {/* Modal de Cronómetro */}
      {mostrarModalTimer && itemIdParaTimer && (
        <TimerModal
          mostrarModal={mostrarModalTimer}
          onCancelar={() => {
            if (!cargandoTimer) {
              setMostrarModalTimer(false);
              setItemIdParaTimer(null);
              setTimerEnEdicion(null);
            }
          }}
          onConfirmar={confirmarTemporizador}
      titulo={timerEnEdicion ? 'Editar Cronómetro de Envío' : 'Configurar Cronómetro de Envío'}
      descripcion={`Configura el tiempo de envío para el item. ${timerEnEdicion ? 'Editando cronómetro existente.' : 'Se creará un nuevo cronómetro.'}`}
          tipoOperacion="envio"
          // Sin valores por defecto, el usuario debe ingresar Horas/Minutos
          cargando={cargandoTimer}
        />
      )}
    </div>
  );
};

export default OperacionTranscursoView;
