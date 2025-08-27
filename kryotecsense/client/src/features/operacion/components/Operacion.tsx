import React, { useState, useEffect, useRef } from 'react';
import { DragDropContext } from '@hello-pangea/dnd';
import { Scan, ChevronDown, Menu, Plus } from 'lucide-react';
import KanbanColumn from './kanban/KanbanColumn';
import NavigationButtons from './NavigationButtons';
import RfidScanModal from './RfidScanModal';
import LoteSelectionModal from './LoteSelectionModal';
import { useOperaciones } from '../hooks/useOperaciones';
import { usePreAcondicionamiento } from '../hooks/usePreAcondicionamiento';
import { createDragDropHandlers } from '../utils/dragDropHandlers';
import { createGroupHandlers } from '../utils/groupHandlers';
import PreAcondicionamientoView from './PreAcondicionamientoView';
import AcondicionamientoViewSimple from './AcondicionamientoViewSimple';
import OperacionEnvioView from './OperacionEnvioView';
import OperacionTranscursoView from './OperacionTranscursoView';
import TimerDisplayGlobal from './TimerDisplayGlobal';
import { useTimerContext } from '../../../contexts/TimerContext';

interface OperacionProps {
  fase?: string;
}

const Operacion: React.FC<OperacionProps> = ({ fase }) => {
  // Estado para el menú desplegable de fases
  const [selectedPhase, setSelectedPhase] = useState<string | null>(fase === 'all' ? null : fase || null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showAllPhases, setShowAllPhases] = useState(fase === 'all' || !fase);
  
  // Estado para el sub-estado seleccionado (Congelación o Atemperamiento)
  const [subEstadoSeleccionado, setSubEstadoSeleccionado] = useState<'Congelación' | 'Atemperamiento'>('Congelación');
  
  // Estado para controlar el modal de selección de lotes
  const [mostrarModalLotes, setMostrarModalLotes] = useState(false);
  
  // Estado para controlar la vista de operación/envío
  const [mostrarVistaEnvio, setMostrarVistaEnvio] = useState(false);
  
  // Referencias para los menús desplegables
  const dropdownRefCongelacion = useRef<HTMLDivElement>(null);
  const dropdownRefAtemperamiento = useRef<HTMLDivElement>(null);
  
  // Estados para controlar la visibilidad de los menús desplegables
  const [showDropdownCongelacion, setShowDropdownCongelacion] = useState(false);
  const [showDropdownAtemperamiento, setShowDropdownAtemperamiento] = useState(false);
  
  // Estados para selección múltiple y devolución en lote
  const [modoSeleccionMultiple, setModoSeleccionMultiple] = useState(false);
  const [itemsSeleccionados, setItemsSeleccionados] = useState<any[]>([]);
  
  // Actualizar el estado cuando cambia el prop fase
  useEffect(() => {
    if (fase) {
      if (fase === 'all') {
        setSelectedPhase(null);
        setShowAllPhases(true);
      } else {
        setSelectedPhase(fase);
        setShowAllPhases(false);
      }
    }
  }, [fase]);
  
  // Efecto para cerrar los menús desplegables al hacer clic fuera de ellos
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRefCongelacion.current && 
          !dropdownRefCongelacion.current.contains(event.target as Node)) {
        setShowDropdownCongelacion(false);
      }
      
      if (dropdownRefAtemperamiento.current && 
          !dropdownRefAtemperamiento.current.contains(event.target as Node)) {
        setShowDropdownAtemperamiento(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const {
    // Estados
    columns,
    setColumns,
    inventarioCompleto,
    cargandoDatos,
    grupoExpandido,
    setGrupoExpandido,
    subgrupoExpandido,
    setSubgrupoExpandido,
    navegacionPreAcondicionamiento,
    setNavegacionPreAcondicionamiento,
    subgrupoPreAcondicionamiento,
    setSubgrupoPreAcondicionamiento,
    mostrarModalEscaneo,
    setMostrarModalEscaneo,
    rfidsEscaneados,
    setRfidsEscaneados,
    rfidInput,
    setRfidInput,
    handleRfidChange,
    handleRfidChangePreAcondicionamiento,
    // Funciones
    actualizarColumnasDesdeBackend,
    actualizarDespuesDeClick,
    manejarVolverNivel,
    manejarEscaneoRfid,
    manejarEscaneoRfidPreAcondicionamiento,
    confirmarPreAcondicionamiento,
    
    // Funciones de cronómetro
    iniciarCronometro,
    detenerCronometro,
    obtenerTiempoRestante,
    moverABodega,
    agregarNuevoItemABodega,
    moverItemABodegaConReagrupacion,
    moverTicAAcondicionamiento,
    
    // Estados y funciones de envío
    itemsEnEnvio,
    cargandoEnvio,
    
    // Funciones de navegación por columna
    handleCardClickBodega,
    handleCardClickPreAcondicionamiento,
    handleCardClickAcondicionamiento,
    volverNivelAnteriorBodega,
    volverNivelAnteriorPreAcondicionamiento,
    volverNivelAnteriorAcondicionamiento,
    
    // Estados de navegación de acondicionamiento
    navegacionAcondicionamiento,
    setNavegacionAcondicionamiento,
    subgrupoAcondicionamiento,
    
    // Estados de WebSocket
    wsConnected,
    wsError
  } = useOperaciones();
  
  // Hook para acceder a los temporizadores
  const { timers, formatearTiempo } = useTimerContext();
  
  // Función para manejar la devolución a bodega con confirmación (individual)
  const manejarDevolucionABodega = async (item: any) => {
    // Prevenir devolver solo los grupos hardcodeados del sistema específicos
    if (typeof item.id === 'string' && 
        (item.id === 'ensamblaje-grupo' || item.id === 'listo-despacho-grupo')) {
      alert('⚠️ Este elemento no se puede devolver a bodega. Es un grupo del sistema.');
      return;
    }
    
    const nombreItem = item.nombre_unidad || item.title || 'TIC';
    const confirmacion = window.confirm(
      `¿Estás seguro de que quieres devolver "${nombreItem}" a bodega?\n\n` +
      `Esto hará lo siguiente:\n` +
      `• Cambiará el estado a "En bodega - Disponible"\n` +
      `• Creará un registro de la actividad\n` +
      `• Detendrá cualquier temporizador activo\n\n` +
      `¿Continuar?`
    );
    
    if (confirmacion) {
      try {
        console.log(`🔄 Iniciando devolución de ${nombreItem} a bodega...`);
        await moverItemABodegaConReagrupacion(item);
        console.log(`✅ ${nombreItem} devuelto a bodega exitosamente`);
      } catch (error) {
        console.error('❌ Error al devolver a bodega:', error);
        // El error ya se muestra en la función moverABodega
      }
    }
  };

  // Función para manejar devolución en lote a bodega (SIN confirmaciones individuales)
  const manejarDevolucionEnLoteABodega = async (items: any[]) => {
    if (items.length === 0) return;
    
    // Filtrar solo los grupos hardcodeados del sistema específicos
    const itemsValidos = items.filter(item => {
      const esGrupoSistema = typeof item.id === 'string' && 
                             (item.id === 'ensamblaje-grupo' || item.id === 'listo-despacho-grupo');
      if (esGrupoSistema) {
        console.warn('⚠️ Grupo del sistema excluido del lote:', item.id);
      }
      return !esGrupoSistema;
    });
    
    if (itemsValidos.length === 0) {
      alert('⚠️ No hay items válidos para devolver a bodega.');
      return;
    }
    
    if (itemsValidos.length !== items.length) {
      alert(`⚠️ Se excluyeron ${items.length - itemsValidos.length} elementos del sistema. Procesando ${itemsValidos.length} items válidos.`);
    }
    
    const confirmacion = window.confirm(
      `¿Estás seguro de que quieres devolver ${itemsValidos.length} items a bodega?\n\n` +
      `Esto hará lo siguiente:\n` +
      `• Cambiará el estado de todos los items a "En bodega - Disponible"\n` +
      `• Creará registros de actividad para cada item\n` +
      `• Detendrá cualquier temporizador activo\n\n` +
      `¿Continuar?`
    );
    
    if (confirmacion) {
      try {
        console.log(`🔄 Procesando ${itemsValidos.length} items en lote...`);
        
        // Procesar todos los items válidos en paralelo para mayor velocidad
        const promesas = itemsValidos.map(item => moverItemABodegaConReagrupacion(item));
        await Promise.all(promesas);
        
        console.log(`✅ ${itemsValidos.length} items devueltos a bodega exitosamente`);
        alert(`✅ ${itemsValidos.length} items devueltos a bodega exitosamente`);
      } catch (error) {
        console.error('❌ Error al devolver items en lote a bodega:', error);
        alert(`❌ Error al devolver algunos items a bodega`);
      }
    }
  };
  
  // Funciones para manejar selección múltiple
  const toggleSeleccionItem = (item: any) => {
    const yaSeleccionado = itemsSeleccionados.find(selected => selected.id === item.id);
    
    if (yaSeleccionado) {
      setItemsSeleccionados(itemsSeleccionados.filter(selected => selected.id !== item.id));
    } else {
      setItemsSeleccionados([...itemsSeleccionados, item]);
    }
  };
  
  const seleccionarTodosLosItems = () => {
    // Obtener todos los items de todas las columnas (excepto grupos del sistema)
    const todosLosItems = Object.values(columns).flatMap(column => 
      column.items.filter(item => 
        !(typeof item.id === 'string' && 
          (item.id === 'ensamblaje-grupo' || item.id === 'listo-despacho-grupo'))
      )
    );
    setItemsSeleccionados(todosLosItems);
  };
  
  const limpiarSeleccion = () => {
    setItemsSeleccionados([]);
  };
  
  const toggleModoSeleccionMultiple = () => {
    setModoSeleccionMultiple(!modoSeleccionMultiple);
    if (modoSeleccionMultiple) {
      // Al desactivar el modo, limpiar selección
      setItemsSeleccionados([]);
    }
  };
  
  const manejarDevolucionLoteSeleccionados = () => {
    if (itemsSeleccionados.length === 0) {
      alert('⚠️ Selecciona al menos un item para devolver a bodega.');
      return;
    }
    
    manejarDevolucionEnLoteABodega(itemsSeleccionados);
    // Limpiar selección después de procesar
    setItemsSeleccionados([]);
  };
  
  // useEffect para cargar datos iniciales al montar el componente
  useEffect(() => {
    console.log('🚀 Cargando datos iniciales al montar componente...');
    actualizarColumnasDesdeBackend();
  }, []); // Solo se ejecuta una vez al montar
  
  // useEffect para actualizar datos cuando cambia la fase (excepto pre-acondicionamiento dedicado)
  useEffect(() => {
    if (fase && fase !== 'pre-acondicionamiento') {
      console.log('🔄 Actualizando datos por cambio de fase:', fase);
      actualizarColumnasDesdeBackend();
    }
  }, [fase]); // Se ejecuta cuando cambia la fase
  
  // Función para manejar la selección de TICs por lote
  const manejarSeleccionLote = (tics: string[]) => {
    setRfidsEscaneados(tics);
    setMostrarModalLotes(false);
    setMostrarModalEscaneo(true);
  };

  // Crear handlers para drag & drop y navegación
  const { onDragEnd } = createDragDropHandlers(
    columns,
    setColumns,
    inventarioCompleto,
    actualizarColumnasDesdeBackend,
    moverItemABodegaConReagrupacion
  );

  const {
    handleCardClick
  } = createGroupHandlers(
    inventarioCompleto,
    actualizarDespuesDeClick,
    handleCardClickBodega,
    handleCardClickPreAcondicionamiento,
    handleCardClickAcondicionamiento
  );

  // Mapa de fases para el menú desplegable
  const phases: Record<string, string> = {
    'all': 'Todas las fases',
    'en-bodega': 'En bodega',
    'pre-acondicionamiento': 'Registrar pre acondicionamiento',
    'acondicionamiento': 'Acondicionamiento',
    'operacion': 'Operación',
    'devolucion': 'Devolución',
    'inspeccion': 'Inspección'
  };

  // Función para seleccionar una fase
  const handlePhaseSelect = (phaseId: string) => {
    if (phaseId === 'all') {
      setSelectedPhase(null);
      setShowAllPhases(true);
    } else {
      setSelectedPhase(phaseId);
      setShowAllPhases(false);
    }
    setIsDropdownOpen(false);
  };

  // Funciones para manejar temporizadores en el Kanban (OPTIMIZADO)
  const obtenerTemporizadorParaTIC = (itemId: string | number) => {
    // Convertir itemId a string si es necesario
    const itemIdStr = String(itemId);
    
    // Validar que itemId sea válido
    if (!itemIdStr) {
      console.warn('⚠️ itemId no es válido:', itemId);
      return undefined;
    }
    
    // Evitar búsquedas innecesarias para IDs de grupos
    if (itemIdStr.includes('-grupo') || itemIdStr.includes('principal') || itemIdStr.includes('ensamblaje') || itemIdStr.includes('despacho')) {
      return undefined;
    }
    
    // Buscar el timer basado en el nombre (que es el RFID) - solo para TICs reales
    const timer = timers.find(timer => timer.nombre === itemIdStr);
    
    // Log completamente eliminado para mejor performance
    
    return timer;
  };

  const obtenerTiempoRestanteKanban = (itemId: string): string => {
    const timer = obtenerTemporizadorParaTIC(itemId);
    if (!timer) return '';
    return formatearTiempo(timer.tiempoRestanteSegundos);
  };

  const contarTimersActivosEnColumna = (columnId: string): { activos: number, completados: number } => {
    if (columnId !== 'pre-acondicionamiento') return { activos: 0, completados: 0 };
    
    const column = columns[columnId];
    if (!column || !column.items) return { activos: 0, completados: 0 };
    
    let activos = 0;
    let completados = 0;
    
    // Solo procesar items que realmente pueden tener timers (TICs)
    column.items.forEach((item: any) => {
      // Validar que item.id sea una string válida
      if (!item || !item.id || typeof item.id !== 'string') {
        console.warn('⚠️ item.id no es una string válida:', item);
        return;
      }
      
      // Saltar items que son grupos o no son TICs
      if (item.id.includes('-grupo') || !item.id.startsWith('TIC')) return;
      
      const timer = obtenerTemporizadorParaTIC(item.id);
      if (timer) {
        if (timer.completado) {
          completados++;
        } else if (timer.activo) {
          activos++;
        }
      }
    });
    
    return { activos, completados };
  };

// ... (rest of the code remains the same)
  // Función para calcular tiempo promedio por lotes en cada fase
  const calcularTiempoPromedioPorFase = () => {
    const tiemposPorFase: { [key: string]: { totalSegundos: number, cantidad: number, tiempoPromedio: string } } = {};
    
    // Analizar todas las columnas
    Object.entries(columns).forEach(([columnId, column]) => {
      if (!column.items) return;
      
      const tiemposCompletados: number[] = [];
      
      column.items.forEach((item: any) => {
        const timer = obtenerTemporizadorParaTIC(item.id);
        if (timer && timer.completado) {
          // Calcular el tiempo total original en segundos
          const tiempoTotalSegundos = timer.tiempoInicialMinutos * 60;
          tiemposCompletados.push(tiempoTotalSegundos);
        }
      });
      
      if (tiemposCompletados.length > 0) {
        const totalSegundos = tiemposCompletados.reduce((sum, tiempo) => sum + tiempo, 0);
        const promedioSegundos = Math.floor(totalSegundos / tiemposCompletados.length);
        
        tiemposPorFase[columnId] = {
          totalSegundos,
          cantidad: tiemposCompletados.length,
          tiempoPromedio: formatearTiempo(promedioSegundos)
        };
      }
    });
    
    return tiemposPorFase;
  };

  // Función para obtener información de temporizadores por lote en cada fase
  const obtenerTemporizadoresPorLote = (columnId: string) => {
    const column = columns[columnId];
    if (!column || !column.items) return null;

    // Agrupar TICs por lote
    const lotes: { [lote: string]: any[] } = {};
    column.items.forEach((item: any) => {
      const lote = item.lote || 'Sin lote';
      if (!lotes[lote]) {
        lotes[lote] = [];
      }
      lotes[lote].push(item);
    });

    // Analizar temporizadores por lote
    const infoLotes = Object.entries(lotes).map(([nombreLote, items]) => {
      const timersDelLote = items
        .map(item => obtenerTemporizadorParaTIC(item.id))
        .filter((timer): timer is NonNullable<typeof timer> => timer !== null && timer !== undefined);
      
      const timersActivos = timersDelLote.filter(timer => timer && timer.activo && !timer.completado);
      const timersCompletados = timersDelLote.filter(timer => timer && timer.completado);

      // Encontrar el timer más próximo a completarse
      let timerMasProximo: any = null;
      let tiempoRestanteMenor = Infinity;
      
      timersActivos.forEach(timer => {
        if (timer && timer.tiempoRestanteSegundos < tiempoRestanteMenor) {
          tiempoRestanteMenor = timer.tiempoRestanteSegundos;
          timerMasProximo = timer;
        }
      });

      return {
        lote: nombreLote,
        totalTics: items.length,
        timersActivos: timersActivos.length,
        timersCompletados: timersCompletados.length,
        timerMasProximo,
        tiempoRestante: timerMasProximo ? formatearTiempo(timerMasProximo.tiempoRestanteSegundos) : null
      };
    });

    // Filtrar solo lotes con temporizadores activos y ordenar por tiempo restante
    const lotesConTimers = infoLotes
      .filter(info => info.timersActivos > 0)
      .sort((a, b) => {
        if (!a.timerMasProximo) return 1;
        if (!b.timerMasProximo) return -1;
        return a.timerMasProximo.tiempoRestanteSegundos - b.timerMasProximo.tiempoRestanteSegundos;
      });

    return lotesConTimers.length > 0 ? lotesConTimers[0] : null; // Retornar el lote con menos tiempo restante
  };

  // Función para obtener el temporizador global más próximo a completarse
  const obtenerTemporizadorGlobalMasProximo = () => {
    console.log('🔍 Analizando timers globales:', timers);
    
    // Obtener todos los timers activos (no completados)
    const timersActivos = timers.filter(timer => timer.activo && !timer.completado);
    console.log('🔍 Timers activos:', timersActivos);
    
    if (timersActivos.length === 0) {
      console.log('❌ No hay timers activos');
      return null;
    }

    // Encontrar el timer con menos tiempo restante
    const timerMasProximo = timersActivos.reduce((minTimer, currentTimer) => {
      return currentTimer.tiempoRestanteSegundos < minTimer.tiempoRestanteSegundos ? currentTimer : minTimer;
    });

    console.log('🏆 Timer más próximo:', timerMasProximo);

    // Buscar en qué fase y lote está este timer
    let faseDelTimer = 'Desconocida';
    let loteDelTimer = 'Desconocido';

    Object.entries(columns).forEach(([columnId, column]) => {
      if (!column || !column.items) return;
      
      column.items.forEach((item: any) => {
        if (item.id === timerMasProximo.nombre || item.rfid === timerMasProximo.nombre) {
          faseDelTimer = column.name;
          loteDelTimer = item.lote || 'Sin lote';
        }
      });
    });

    return {
      timer: timerMasProximo,
      fase: faseDelTimer,
      lote: loteDelTimer,
      tiempoRestante: formatearTiempo(timerMasProximo.tiempoRestanteSegundos)
    };
  };

  // Función para obtener resumen de temporizadores por tipo agrupados por tiempo
  const obtenerResumenTemporizadoresPorTipo = (tipo: 'congelacion' | 'atemperamiento') => {
    // Filtrar timers por tipo de operación
    const timersDelTipo = timers.filter(timer => {
      if (tipo === 'congelacion') {
        return timer.tipoOperacion === 'congelamiento' && timer.activo;
      } else {
        return timer.tipoOperacion === 'atemperamiento' && timer.activo;
      }
    });

    if (timersDelTipo.length === 0) {
      return [];
    }

    // Agrupar por tiempo inicial (en minutos)
    const gruposPorTiempo: { [tiempo: number]: any[] } = {};
    
    timersDelTipo.forEach(timer => {
      const tiempoMinutos = timer.tiempoInicialMinutos;
      if (!gruposPorTiempo[tiempoMinutos]) {
        gruposPorTiempo[tiempoMinutos] = [];
      }
      gruposPorTiempo[tiempoMinutos].push(timer);
    });

    // Convertir a array y ordenar por tiempo
    const resumen = Object.entries(gruposPorTiempo)
      .map(([tiempo, timersGrupo]) => {
        const timersActivos = timersGrupo.filter(t => !t.completado);
        const timersCompletados = timersGrupo.filter(t => t.completado);
        
        // Encontrar el timer con menos tiempo restante del grupo (solo de los activos)
        let tiempoRestanteMenor = null;
        if (timersActivos.length > 0) {
          const timerMasProximo = timersActivos.reduce((minTimer, currentTimer) => {
            return currentTimer.tiempoRestanteSegundos < minTimer.tiempoRestanteSegundos ? currentTimer : minTimer;
          });
          tiempoRestanteMenor = formatearTiempo(timerMasProximo.tiempoRestanteSegundos);
        }

        return {
          tiempoMinutos: parseInt(tiempo),
          tiempoFormateado: formatearTiempoCompleto(parseInt(tiempo)),
          cantidad: timersGrupo.length,
          timersActivos: timersActivos.length,
          timersCompletados: timersCompletados.length,
          tiempoRestanteMenor: tiempoRestanteMenor
        };
      })
      .sort((a, b) => a.tiempoMinutos - b.tiempoMinutos);

    return resumen;
  };

  // Función para formatear tiempo en formato legible (ej: "2h 30m" o "45m")
  const formatearTiempoCompleto = (minutos: number): string => {
    const horas = Math.floor(minutos / 60);
    const minutosRestantes = minutos % 60;
    
    if (horas > 0 && minutosRestantes > 0) {
      return `${horas}h ${minutosRestantes}m`;
    } else if (horas > 0) {
      return `${horas}h`;
    } else {
      return `${minutosRestantes}m`;
    }
  };

  if (cargandoDatos) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
          <div className="text-lg text-gray-600 dark:text-gray-400">
            Cargando operaciones...
          </div>
        </div>
      </div>
    );
  }

  // Filtrar columnas según la fase seleccionada
  const filteredColumns = selectedPhase 
    ? Object.entries(columns).filter(([columnId]) => columnId === selectedPhase)
    : Object.entries(columns);
    
  // Determinar si el modo es solo visualización
  const isViewOnly = selectedPhase === null || selectedPhase === 'all';
  
  // Si estamos en modo visualización, filtrar las tarjetas de CONGELACIÓN y ATEMPERAMIENTO de otras columnas
  // PERO NO de la columna de pre-acondicionamiento
  if (isViewOnly) {
    Object.keys(columns).forEach(columnId => {
      // Solo filtrar en columnas que NO sean pre-acondicionamiento
      if (columnId !== 'pre-acondicionamiento') {
        columns[columnId].items = columns[columnId].items.filter(item => {
          return !(
            item.tipo === 'CONGELACION' || 
            item.tipo === 'ATEMPERAMIENTO' || 
            item.tipo_base === 'CONGELACION' || 
            item.tipo_base === 'ATEMPERAMIENTO'
          );
        });
      }
    });
  }

  if (fase === 'pre-acondicionamiento') {
    return <PreAcondicionamientoView />;
  }

  if (fase === 'acondicionamiento') {
    return (
      <AcondicionamientoViewSimple 
        isOpen={true} 
        onClose={() => window.history.back()} 
      />
    );
  }

  // Obtener items listos para envío desde acondicionamiento
  const obtenerItemsListosParaEnvio = () => {
    const itemsAcondicionamiento = columns['acondicionamiento']?.items || [];
    return itemsAcondicionamiento.filter(item => 
      item.sub_estado === 'listo-para-envio' || 
      item.sub_estado === 'completado' ||
      item.estado === 'acondicionamiento'
    );
  };

  // Mostrar vista de operación (transcurso) si está activada
  if (fase === 'operacion') {
    return <OperacionTranscursoView />;
  }

  // Mostrar vista de envío si está activada
  if (mostrarVistaEnvio) {
    return (
      <OperacionEnvioView 
        itemsListosParaEnvio={obtenerItemsListosParaEnvio()}
        onVolverAtras={() => {
          setMostrarVistaEnvio(false);
        }}
        onActualizarDatos={actualizarColumnasDesdeBackend}
      />
    );
  }

  return (
  <div className="p-2 sm:p-4 lg:p-6 min-h-screen bg-white">
      {/* Header con botón de escaneo y selector de fases - Responsive */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 gap-3 sm:gap-0">
        <div className="flex items-center gap-4">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Operación</h1>
        </div>
  {/* Botón de escaneo eliminado en vista de bodega */}
      </div>

  {/* Eliminado: controles de selección múltiple */}

      {/* Vista principal - Muestra todas las fases o la fase seleccionada */}
      <DragDropContext onDragEnd={() => {}}>
        <div className="flex flex-col lg:flex-row gap-3 sm:gap-4 lg:gap-6 lg:overflow-x-auto">
          {filteredColumns.map(([columnId, column]) => (
            // Si la columna es pre-acondicionamiento y no estamos en la vista específica de pre-acondicionamiento,
            // renderizamos un componente especial
            columnId === 'pre-acondicionamiento' && fase !== 'pre-acondicionamiento' ? (
              <div key={columnId} className="w-full lg:w-80 lg:flex-shrink-0 bg-white rounded-lg shadow-sm border border-gray-200 mb-4 lg:mb-0">
                  <div className={`flex justify-between items-center p-3 sm:p-4 rounded-t-lg border-t-4 border-t-primary-600 bg-gray-50`}>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                        <h2 className="font-bold text-base sm:text-lg text-gray-800">{column?.name || 'Registrar pre acondicionamiento'}</h2>

                        {/* Mostrar temporizador del lote más próximo (si aplica) */}
                        {(() => {
                          const infoLote = obtenerTemporizadoresPorLote(columnId);
                          return infoLote && infoLote.tiempoRestante ? (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs">
                                <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                                Lote {infoLote.lote}: {infoLote.tiempoRestante}
                              </span>
                              <span className="text-xs text-gray-500">
                                ({infoLote.timersActivos} de {infoLote.totalTics} TICs)
                              </span>
                            </div>
                          ) : null;
                        })()}

                        {/* Mostrar tiempo promedio para la fase (si existe) */}
                        {(() => {
                          const tiempos = calcularTiempoPromedioPorFase();
                          if (tiempos && tiempos[columnId]) {
                            return (
                              <div className="flex items-center gap-2 mt-1">
                                <span className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                  Promedio: {tiempos[columnId].tiempoPromedio}
                                </span>
                                <span className="text-xs text-gray-500">({tiempos[columnId].cantidad} lotes)</span>
                              </div>
                            );
                          }
                          return null;
                        })()}

                        {/* Mostrar counters de timers (sólo para pre-acondicionamiento)", */}
            {columnId === 'pre-acondicionamiento' && contarTimersActivosEnColumna && (
                          <div className="flex items-center gap-2 mt-1">
                            {(() => {
              const { activos, completados } = contarTimersActivosEnColumna(columnId);
                              return (
                                <div className="flex items-center gap-2 text-xs">
                                  {activos > 0 && (
                                    <span className="flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded-full">
                                      <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                                      {activos} activos
                                    </span>
                                  )}
                                  {completados > 0 && (
                                    <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full">
                                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                      {completados} listos
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="p-2 sm:p-3 transition-colors duration-200 min-h-[300px] sm:min-h-[400px] lg:min-h-[500px] overflow-auto">
                  {(() => {
                    // Filtrar los items de pre-acondicionamiento por tipo
                    const itemsCongelacion = column.items.filter(item => 
                      item.tipo === 'CONGELACION' || item.sub_estado === 'Congelación' || item.sub_estado === 'Congelamiento'
                    );
                    const itemsAtemperamiento = column.items.filter(item => 
                      item.tipo === 'ATEMPERAMIENTO' || item.sub_estado === 'Atemperamiento'
                    );
                    
                    return (
                      <>
                        {/* Sección de TICs para Congelamiento */}
                        <div className="bg-white rounded-lg shadow-md mb-4 overflow-hidden">
                          <div className="bg-blue-50 p-3 border-b border-blue-100 flex justify-between items-center">
                            <h3 className="text-sm font-semibold text-blue-800">TICs para Congelamiento</h3>
                            <span className="text-xs text-blue-600">{itemsCongelacion.length} items</span>
                          </div>
                          <div className="p-3">
                            {/* Resumen de temporizadores por tiempo para Congelación */}
                            {(() => {
                              const resumenCongelacion = obtenerResumenTemporizadoresPorTipo('congelacion');
                              return resumenCongelacion.length > 0 ? (
                                <div className="mb-3">
                                  <h4 className="text-xs font-semibold text-blue-800 mb-2">❄️ Registros de Congelamiento:</h4>
                                  <div className="space-y-1">
                                    {resumenCongelacion.map((grupo, index) => (
                                      <div key={index} className="flex items-center justify-between p-2 bg-blue-50 rounded border-l-4 border-blue-400">
                                        <div className="flex items-center gap-2">
                                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                          <span className="text-xs font-medium text-blue-800">
                                            {grupo.cantidad} TICs a {grupo.tiempoFormateado}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <div className="flex gap-1 text-xs">
                                            {grupo.timersActivos > 0 && (
                                              <span className="px-2 py-1 bg-blue-200 text-blue-700 rounded-full">
                                                {grupo.timersActivos} activos
                                              </span>
                                            )}
                                            {grupo.timersCompletados > 0 && (
                                              <span className="px-2 py-1 bg-green-200 text-green-700 rounded-full">
                                                {grupo.timersCompletados} listos
                                              </span>
                                            )}
                                          </div>
                                          {grupo.tiempoRestanteMenor && (
                                            <div className="text-right">
                                              <span className="text-blue-600 text-xs font-bold bg-blue-100 px-2 py-1 rounded">
                                                ⏰ {grupo.tiempoRestanteMenor}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null;
                            })()}
                            
                            {itemsCongelacion.length > 0 ? (
                              <div className="space-y-2">
                                {itemsCongelacion.map(item => (
                                  <div key={item.id} className="bg-blue-50 p-2 rounded text-sm">
                                    <div className="font-medium text-blue-800">{item.title}</div>
                                    <div className="text-blue-600 text-xs">{item.description}</div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-center text-sm text-gray-500">
                                No hay TICs registrados para congelamiento
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Sección de TICs para Atemperamiento */}
                        <div className="bg-white rounded-lg shadow-md overflow-hidden">
                          <div className="bg-orange-50 p-3 border-b border-orange-100 flex justify-between items-center">
                            <h3 className="text-sm font-semibold text-orange-800">TICs para Atemperamiento</h3>
                            <span className="text-xs text-orange-600">{itemsAtemperamiento.length} items</span>
                          </div>
                          <div className="p-3">
                            {/* Resumen de temporizadores por tiempo para Atemperamiento */}
                            {(() => {
                              const resumenAtemperamiento = obtenerResumenTemporizadoresPorTipo('atemperamiento');
                              return resumenAtemperamiento.length > 0 ? (
                                <div className="mb-3">
                                  <h4 className="text-xs font-semibold text-orange-800 mb-2">🔥 Registros de Atemperamiento:</h4>
                                  <div className="space-y-1">
                                    {resumenAtemperamiento.map((grupo, index) => (
                                      <div key={index} className="flex items-center justify-between p-2 bg-orange-50 rounded border-l-4 border-orange-400">
                                        <div className="flex items-center gap-2">
                                          <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                                          <span className="text-xs font-medium text-orange-800">
                                            {grupo.cantidad} TICs a {grupo.tiempoFormateado}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <div className="flex gap-1 text-xs">
                                            {grupo.timersActivos > 0 && (
                                              <span className="px-2 py-1 bg-orange-200 text-orange-700 rounded-full">
                                                {grupo.timersActivos} activos
                                              </span>
                                            )}
                                            {grupo.timersCompletados > 0 && (
                                              <span className="px-2 py-1 bg-green-200 text-green-700 rounded-full">
                                                {grupo.timersCompletados} listos
                                              </span>
                                            )}
                                          </div>
                                          {grupo.tiempoRestanteMenor && (
                                            <div className="text-right">
                                              <span className="text-red-600 text-xs font-bold bg-red-100 px-2 py-1 rounded">
                                                ⏰ {grupo.tiempoRestanteMenor}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null;
                            })()}
                            
                            {itemsAtemperamiento.length > 0 ? (
                              <div className="space-y-2">
                                {itemsAtemperamiento.map(item => (
                                  <div key={item.id} className="bg-orange-50 p-2 rounded text-sm">
                                    <div className="font-medium text-orange-800">{item.title}</div>
                                    <div className="text-orange-600 text-xs">{item.description}</div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-center text-sm text-gray-500">
                                No hay TICs registrados para atemperamiento
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    );
                  })()
                  }
                </div>
              </div>
            ) : (
            <KanbanColumn
              key={columnId}
              column={column}
              items={column.items}
              columnId={columnId}
              onCardClick={handleCardClick}
              obtenerTiempoRestante={obtenerTiempoRestanteKanban}
              iniciarCronometro={iniciarCronometro}
              detenerCronometro={detenerCronometro}
              moverABodega={manejarDevolucionABodega}
              grupoExpandido={grupoExpandido}
              subgrupoExpandido={subgrupoExpandido}
              setGrupoExpandido={setGrupoExpandido}
              setSubgrupoExpandido={setSubgrupoExpandido}
              navegacionPreAcondicionamiento={navegacionPreAcondicionamiento}
              setNavegacionPreAcondicionamiento={setNavegacionPreAcondicionamiento}
              subgrupoPreAcondicionamiento={subgrupoPreAcondicionamiento}
              navegacionAcondicionamiento={navegacionAcondicionamiento}
              setNavegacionAcondicionamiento={setNavegacionAcondicionamiento}
              subgrupoAcondicionamiento={subgrupoAcondicionamiento}
              volverNivelAnteriorBodega={volverNivelAnteriorBodega}
              volverNivelAnteriorPreAcondicionamiento={volverNivelAnteriorPreAcondicionamiento}
              volverNivelAnteriorAcondicionamiento={volverNivelAnteriorAcondicionamiento}
              manejarVolverNivel={manejarVolverNivel}
              isViewOnly={isViewOnly}
              contarTimersActivos={contarTimersActivosEnColumna}
              tiemposPromedio={calcularTiempoPromedioPorFase()}
              infoLoteActivo={obtenerTemporizadoresPorLote(columnId)}
              inventarioCompleto={inventarioCompleto}
              agregarNuevoItemABodega={agregarNuevoItemABodega}
              modoSeleccionMultiple={modoSeleccionMultiple}
              itemsSeleccionados={itemsSeleccionados}
              onToggleSeleccion={toggleSeleccionItem}
            />)
          ))}
        </div>
      </DragDropContext>



      <RfidScanModal
        mostrarModal={mostrarModalEscaneo}
        rfidInput={rfidInput}
        rfidsEscaneados={rfidsEscaneados}
        onRfidInputChange={handleRfidChangePreAcondicionamiento}
        onEscanearRfid={manejarEscaneoRfidPreAcondicionamiento}
        onConfirmar={confirmarPreAcondicionamiento}
        onCancelar={() => {
          setMostrarModalEscaneo(false);
          setRfidsEscaneados([]);
          setRfidInput('');
        }}
        titulo={`Escanear TICs para ${subEstadoSeleccionado}`}
        descripcion={`Escanea los TICs para ${subEstadoSeleccionado} con la pistola RFID o ingresa los códigos manualmente.`}
        subEstado={subEstadoSeleccionado}
      />
      
      {/* Modal para seleccionar TICs por lote */}
      <LoteSelectionModal
        mostrarModal={mostrarModalLotes}
        onCancelar={() => setMostrarModalLotes(false)}
        onSeleccionarLote={manejarSeleccionLote}
        subEstado={subEstadoSeleccionado}
      />
      
    </div>
  );
};

export default Operacion;
