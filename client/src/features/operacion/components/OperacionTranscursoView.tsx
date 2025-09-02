import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Package, Clock, CheckCircle, X, Play, Pause, Trash2 } from 'lucide-react';
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
  const { timers, formatearTiempo, pausarTimer, reanudarTimer, eliminarTimer, crearTimer, obtenerTimersCompletados, isConnected } = useTimerContext();

  // InlineCountdown compartido
  const [busqueda, setBusqueda] = useState('');
  const [itemsEnTransito, setItemsEnTransito] = useState<ItemEnTransito[]>([]);
  const [itemsListosParaDespacho, setItemsListosParaDespacho] = useState<any[]>([]);
  const [itemsSeleccionados, setItemsSeleccionados] = useState<number[]>([]);
  // Tiempo de envío predeterminado para TimerModal individual (96h)
  const TIEMPO_ENVIO_MIN = 96 * 60;
  const [mostrarModalSeleccion, setMostrarModalSeleccion] = useState(false);
  const [itemsListosDespacho, setItemsListosDespacho] = useState<any[]>([]);
  const [itemsSeleccionadosModal, setItemsSeleccionadosModal] = useState<number[]>([]);
  // Filtros para el modal (diseño sin lotes)
  const [modalBusqueda, setModalBusqueda] = useState('');
  // Tiempo manual en el modal (opcional)
  const [horasEnvio, setHorasEnvio] = useState<string>('');
  const [minutosEnvio, setMinutosEnvio] = useState<string>('');
  
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

  // Obtener items en tránsito
  useEffect(() => {
    const itemsTransito = inventarioCompleto.filter((item: any) => 
      item.estado === 'operación' && item.sub_estado === 'En transito'
    );

    // Combinar con información de timers
    const itemsConTimers = itemsTransito.map((item: any) => {
      const itemEnvio = envio.itemsEnEnvio.find((envioItem: any) => envioItem.id === item.id);
      const timer = itemEnvio?.timerId ? timers.find(t => t.id === itemEnvio.timerId) : null;
      
      return {
        ...item,
        timerId: itemEnvio?.timerId,
        tiempoRestante: timer ? formatearTiempo(timer.tiempoRestanteSegundos || 0) : undefined,
        fechaInicio: itemEnvio?.fechaInicioEnvio?.toString() || undefined
      };
    });

    setItemsEnTransito(itemsConTimers);
  }, [inventarioCompleto, envio.itemsEnEnvio, timers, formatearTiempo]);

  // Obtener items en transcurso (estado operación, sub_estado En transito)
  useEffect(() => {
    if (!inventarioCompleto) return;
    
    console.log('📦 Inventario completo recibido:', inventarioCompleto.length, 'items');
    
    // Filtrar items que están en transcurso (operación/En transito)
    const itemsEnTranscurso = inventarioCompleto.filter(item => {
      return item.estado === 'operación' && item.sub_estado === 'En transito';
    });
    
    console.log('🚚 Items en transcurso:', itemsEnTranscurso);
    setItemsListosParaDespacho(itemsEnTranscurso); // Reutilizamos el estado pero con items en transcurso
  }, [inventarioCompleto]);

  // Obtener items listos para despacho (desde acondicionamiento)
  useEffect(() => {
    if (!inventarioCompleto) return;
    
    console.log('🔍 DEBUG: Analizando inventario completo:', inventarioCompleto.length, 'items');
    console.log('🔍 DEBUG: Muestra de items:', inventarioCompleto.slice(0, 3));
    
    // Buscar todos los items en acondicionamiento
    const itemsAcondicionamiento = inventarioCompleto.filter(item => 
      item.estado === 'acondicionamiento'
    );
    console.log('🏢 Items en acondicionamiento:', itemsAcondicionamiento.length);
    
    // Mostrar estados disponibles
    const estadosUnicos = [...new Set(inventarioCompleto.map(item => `${item.estado}/${item.sub_estado}`))];
    console.log('📊 Estados disponibles:', estadosUnicos);
    
    // Filtrar items que están listos para envío (según la DB real)
    const itemsListos = inventarioCompleto.filter(item => {
      // Verificar si está en Acondicionamiento con sub_estado Lista para Despacho
      const esListoParaDespacho = 
        item.estado === 'Acondicionamiento' && 
        item.sub_estado === 'Lista para Despacho';
      
      console.log(`🔍 Item ${item.id}: estado="${item.estado}", sub_estado="${item.sub_estado}", esListoParaDespacho=${esListoParaDespacho}`);
      
      return esListoParaDespacho;
    });
    
    console.log('📦 Items listos para despacho encontrados:', itemsListos.length);
    console.log('📦 Items listos detalle:', itemsListos);
    setItemsListosDespacho(itemsListos);
  }, [inventarioCompleto]);

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

  // Función para obtener el cronómetro asociado a un item (con logging detallado)
  const obtenerTemporizadorParaItem = useCallback((itemId: number) => {
  // console.log('🔍 ===== BÚSQUEDA DE CRONÓMETRO =====');
    // console.log('📦 Item ID:', itemId);
    
    // Incluir tanto timers activos como completados
    const todosLosTimers = [...timers];
    // console.log('⏲️ Timers disponibles en contexto:', {
    //   cantidad: todosLosTimers.length,
    //   timers: todosLosTimers.map(t => ({ 
    //     id: t.id, 
    //     nombre: t.nombre, 
    //     tipo: t.tipoOperacion || 'sin_tipo', 
    //     completado: t.completado,
    //     activo: t.activo,
    //     tiempoRestante: t.tiempoRestanteSegundos
    //   }))
    // });

    // console.log('📦 Items en envío en hook:', {
    //   cantidad: envio.itemsEnEnvio.length,
    //   items: envio.itemsEnEnvio.map(e => ({ id: e.id, timerId: e.timerId, nombre: e.nombre_unidad }))
    // });

    // Estrategia 1: Buscar por registro de envío (más confiable)
    const registroEnvio = envio.itemsEnEnvio.find((e: any) => e.id === itemId);
    // console.log('🔍 Registro de envío encontrado:', registroEnvio);
    
    if (registroEnvio && registroEnvio.timerId) {
      // Buscar tanto en activos como completados
      const timer = todosLosTimers.find((timer: any) => timer.id === registroEnvio.timerId);
      if (timer) {
        console.log(`✅ Timer encontrado por registro de envío para item ${itemId}:`, timer.nombre, `(completado: ${timer.completado})`);
        return timer;
      } else {
        console.log(`❌ Timer con ID ${registroEnvio.timerId} no encontrado en contexto`);
      }
    }

    // Estrategia 2: Buscar el item en inventario para obtener su información
    const item = inventarioCompleto.find(i => i.id === itemId);
    if (!item) {
      console.log(`❌ Item ${itemId} no encontrado en inventario`);
      return undefined;
    }

    console.log('📦 Item encontrado:', {
      id: item.id,
      nombre: item.nombre_unidad,
      rfid: item.rfid,
      estado: item.estado,
      sub_estado: item.sub_estado
    });

  // Estrategia 3: Buscar cronómetro por nombre del item (incluir completados) - MEJORADA
    const posiblesNombres = [
      `Envío #${item.id} - ${item.nombre_unidad}`,
      `Envío #${item.id} - ${item.rfid}`,
      `Envío ${item.nombre_unidad}`,
      `Envío ${item.rfid}`,
      item.nombre_unidad,
      item.rfid,
      `TIC ${item.nombre_unidad}`,
      `TIC ${item.rfid}`
    ].filter(Boolean);

    console.log('🔍 Probando nombres posibles:', posiblesNombres);

    for (const posibleNombre of posiblesNombres) {
      const timer = todosLosTimers.find(t => t.nombre === posibleNombre);
      if (timer) {
        console.log(`✅ Timer encontrado por nombre "${posibleNombre}" para item ${itemId}:`, timer.nombre, `(completado: ${timer.completado})`);
        
        // Si encontramos el timer pero no hay registro de envío, crearlo
        if (!registroEnvio && timer.tipoOperacion === 'envio') {
          console.log('🔧 Creando registro de envío faltante para asociar timer...');
          const fechaInicio = new Date(timer.fechaInicio);
          const tiempoEnvioMinutos = timer.tiempoInicialMinutos;
          const fechaEstimada = new Date(fechaInicio.getTime() + (tiempoEnvioMinutos * 60 * 1000));

          const itemEnvio = {
            id: item.id,
            nombre_unidad: item.nombre_unidad,
            rfid: item.rfid,
            lote: item.lote || 'Sin lote',
            estado: 'operación',
            sub_estado: 'En transito',
            categoria: item.categoria || 'tics',
            tiempoEnvio: tiempoEnvioMinutos,
            timerId: timer.id,
            fechaInicioEnvio: fechaInicio,
            fechaEstimadaLlegada: fechaEstimada
          };

          // Actualizar estado local de envío
          envio.setItemsEnEnvio(prev => {
            const sinItemAnterior = prev.filter(i => i.id !== itemId);
            const nuevosItems = [...sinItemAnterior, itemEnvio];
            console.log('🔧 Registro de envío creado y agregado:', itemEnvio);
            return nuevosItems;
          });
        }
        
        return timer;
      }
    }

  // Estrategia 4: Buscar cronómetro que contenga parte del nombre del item (incluir completados)
    const timerConNombre = todosLosTimers.find(timer => {
      const nombreTimer = timer.nombre.toLowerCase();
      const nombreItem = (item.nombre_unidad || item.rfid || '').toLowerCase();
      return nombreItem && (nombreTimer.includes(nombreItem) || nombreItem.includes(nombreTimer));
    });

    if (timerConNombre) {
      console.log(`✅ Timer encontrado por coincidencia parcial para item ${itemId}:`, timerConNombre.nombre, `(completado: ${timerConNombre.completado})`);
      
      // Si encontramos el timer pero no hay registro de envío, crearlo
      if (!registroEnvio && timerConNombre.tipoOperacion === 'envio') {
        console.log('🔧 Creando registro de envío faltante para timer por coincidencia...');
        const fechaInicio = new Date(timerConNombre.fechaInicio);
        const tiempoEnvioMinutos = timerConNombre.tiempoInicialMinutos;
        const fechaEstimada = new Date(fechaInicio.getTime() + (tiempoEnvioMinutos * 60 * 1000));

        const itemEnvio = {
          id: item.id,
          nombre_unidad: item.nombre_unidad,
          rfid: item.rfid,
          lote: item.lote || 'Sin lote',
          estado: 'operación',
          sub_estado: 'En transito',
          categoria: item.categoria || 'tics',
          tiempoEnvio: tiempoEnvioMinutos,
          timerId: timerConNombre.id,
          fechaInicioEnvio: fechaInicio,
          fechaEstimadaLlegada: fechaEstimada
        };

        // Actualizar estado local de envío
        envio.setItemsEnEnvio(prev => {
          const sinItemAnterior = prev.filter(i => i.id !== itemId);
          const nuevosItems = [...sinItemAnterior, itemEnvio];
          console.log('� Registro de envío creado por coincidencia:', itemEnvio);
          return nuevosItems;
        });
      }
      
      return timerConNombre;
    }

  // Estrategia 5: Para items sin cronómetro, si están en estado "En transito", buscar cronómetros huérfanos de envío
    if (item.estado === 'operación' && item.sub_estado === 'En transito') {
      const timersEnvioSinAsociar = todosLosTimers.filter(timer => {
        // Es un timer de envío
        if (timer.tipoOperacion !== 'envio') return false;
        
        // No está asociado a ningún item en envío
        const estaAsociado = envio.itemsEnEnvio.some(e => e.timerId === timer.id);
        return !estaAsociado;
      });
      
      console.log('🔄 Timers de envío sin asociar:', timersEnvioSinAsociar.map(t => ({ nombre: t.nombre, id: t.id })));
      
      if (timersEnvioSinAsociar.length === 1) {
        const timerHuerfano = timersEnvioSinAsociar[0];
        console.log('� Asociando timer huérfano a item sin timer:', timerHuerfano.nombre);
        
        // Crear registro de envío para asociar el timer huérfano
        const fechaInicio = new Date(timerHuerfano.fechaInicio);
        const tiempoEnvioMinutos = timerHuerfano.tiempoInicialMinutos;
        const fechaEstimada = new Date(fechaInicio.getTime() + (tiempoEnvioMinutos * 60 * 1000));

        const itemEnvio = {
          id: item.id,
          nombre_unidad: item.nombre_unidad,
          rfid: item.rfid,
          lote: item.lote || 'Sin lote',
          estado: 'operación',
          sub_estado: 'En transito',
          categoria: item.categoria || 'tics',
          tiempoEnvio: tiempoEnvioMinutos,
          timerId: timerHuerfano.id,
          fechaInicioEnvio: fechaInicio,
          fechaEstimadaLlegada: fechaEstimada
        };

        // Actualizar estado local de envío
        envio.setItemsEnEnvio(prev => {
          const sinItemAnterior = prev.filter(i => i.id !== itemId);
          const nuevosItems = [...sinItemAnterior, itemEnvio];
          console.log('🔧 Timer huérfano asociado:', itemEnvio);
          return nuevosItems;
        });
        
        return timerHuerfano;
      }
    }

    // Log de debugging adicional cuando no se encuentra nada
  console.log('❌ ===== NO SE ENCONTRÓ CRONÓMETRO =====');
    console.log('❌ Estrategias probadas:');
    console.log('   1. Por registro de envío:', registroEnvio ? `timerId: ${registroEnvio.timerId}` : 'No disponible');
    console.log('   2. Por nombres exactos:', posiblesNombres);
    console.log('   3. Por coincidencia parcial con:', item.nombre_unidad);
  console.log('   4. Por cronómetros huérfanos de envío para items en tránsito');
  console.log('❌ Cronómetros en contexto:', todosLosTimers.map(t => `"${t.nombre}" (tipo: ${t.tipoOperacion}, completado: ${t.completado}, activo: ${t.activo})`));
    console.log('❌ Items en envío:', envio.itemsEnEnvio.map(e => ({ id: e.id, timerId: e.timerId, nombre: e.nombre_unidad })));
    
    return undefined;
  }, [timers, envio.itemsEnEnvio, inventarioCompleto, itemsListosParaDespacho.length, envio.setItemsEnEnvio]);

  const renderizarTemporizador = (itemId: number) => {
    const timer = obtenerTemporizadorParaItem(itemId);
    if (!timer) {
      return (
        <div className="flex flex-col items-center space-y-2">
          <span className="text-gray-400 text-xs">Sin cronómetro</span>
          <button
            onClick={() => iniciarTemporizadorParaItem(itemId)}
            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors text-xs"
            title="Iniciar cronómetro de envío"
          >
            <Clock className="w-3 h-3" />
            Iniciar
          </button>
        </div>
      );
    }

  // Si el cronómetro está completado, mostrar estado completado
    if (timer.completado) {
      return (
        <div className="flex flex-col items-center space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-green-600">
              ✅ Completado
            </span>
            <span className="text-xs text-gray-500">({timer.tipoOperacion})</span>
          </div>
          <div className="text-xs text-gray-500">
            Tiempo: {timer.tiempoInicialMinutos}min
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => editarTemporizadorItem(itemId, timer)}
              className="p-1 rounded-md hover:bg-gray-100 transition-colors"
              title="Crear nuevo cronómetro"
            >
              <Clock className="w-3 h-3 text-blue-600" />
            </button>
            <button
              onClick={() => eliminarTimer(timer.id)}
              className="p-1 rounded-md hover:bg-gray-100 transition-colors"
              title="Eliminar registro"
            >
              <Trash2 className="w-3 h-3 text-red-600" />
            </button>
          </div>
        </div>
      );
    }

    // Timer activo o pausado
  const tiempoFormateado = (
    <InlineCountdown
      endTime={timer.fechaFin}
      seconds={timer.tiempoRestanteSegundos}
  paused={!timer.activo}
      format={formatearTiempo}
    />
  );
    const esUrgente = timer.tiempoRestanteSegundos < 300;
    
    // Determinar color según tipo de operación
    const getColorPorTipo = (tipo: string) => {
      switch (tipo) {
        case 'envio':
          return esUrgente ? 'text-red-600' : 'text-green-600';
        case 'congelamiento':
          return esUrgente ? 'text-red-600' : 'text-blue-600';
        case 'atemperamiento':
          return esUrgente ? 'text-red-600' : 'text-orange-600';
        default:
          return esUrgente ? 'text-red-600' : 'text-gray-600';
      }
    };

    return (
      <div className="flex flex-col items-center space-y-2">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${getColorPorTipo(timer.tipoOperacion)}`}>
            {tiempoFormateado}
          </span>
          <span className="text-xs text-gray-500">({timer.tipoOperacion})</span>
          {!timer.activo && (
            <span className="text-xs text-gray-500">(Pausado)</span>
          )}
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => timer.activo ? pausarTimer(timer.id) : reanudarTimer(timer.id)}
            className="p-1 rounded-md hover:bg-gray-100 transition-colors"
            title={timer.activo ? "Pausar" : "Reanudar"}
          >
            {timer.activo ? (
              <Pause className="w-3 h-3 text-yellow-600" />
            ) : (
              <Play className="w-3 h-3 text-green-600" />
            )}
          </button>
          <button
            onClick={() => editarTemporizadorItem(itemId, timer)}
            className="p-1 rounded-md hover:bg-gray-100 transition-colors"
            title="Editar cronómetro"
          >
            <Clock className="w-3 h-3 text-blue-600" />
          </button>
          <button
            onClick={() => eliminarTimer(timer.id)}
            className="p-1 rounded-md hover:bg-gray-100 transition-colors"
            title="Eliminar"
          >
            <Trash2 className="w-3 h-3 text-red-600" />
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
      const minutosElegidos = tiempoMinutos > 0 ? tiempoMinutos : TIEMPO_ENVIO_MIN;
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
        console.log('🔄 Actualizando items en envío, agregando/actualizando item:', itemEnvio);
        const sinItemAnterior = prev.filter(i => i.id !== itemIdParaTimer);
        const nuevosItems = [...sinItemAnterior, itemEnvio];
        console.log('📦 Items en envío después de actualizar:', nuevosItems);
        return nuevosItems;
      });

      console.log(`✅ Timer creado exitosamente: ID ${timerId} para item ${item.nombre_unidad}`);

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
        console.log(`🔄 Completando ${itemsListosParaDespacho.length} envíos en lote...`);
        
        // Procesar todos los items en paralelo para mayor velocidad
        const promesas = itemsListosParaDespacho.map(item => envio.completarEnvio(item.id));
        await Promise.all(promesas);
        
        console.log(`✅ ${itemsListosParaDespacho.length} envíos completados exitosamente`);
        alert(`✅ ${itemsListosParaDespacho.length} envíos completados exitosamente`);
      } catch (error) {
        console.error('❌ Error al completar envíos en lote:', error);
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
        console.log(`🔄 Cancelando ${itemsListosParaDespacho.length} envíos en lote...`);
        
        // Procesar todos los items en paralelo para mayor velocidad
        const promesas = itemsListosParaDespacho.map(item => 
          envio.cancelarEnvio(item.id, 'Cancelado en lote desde vista de operación')
        );
        await Promise.all(promesas);
        
        console.log(`✅ ${itemsListosParaDespacho.length} envíos cancelados exitosamente`);
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
                  onClick={() => setMostrarModalSeleccion(true)}
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

      {/* Modal de Selección de Items (diseño sin lotes, mobile-first) */}
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
              {/* Filtros y búsqueda */}
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
                {/* filtros por categoría y 'Solo sin lote' removidos */}
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-600">
                    Resultados: {itemsFiltradosModal.length}
                    {itemsFiltradosModal.length > 0 && (
                      <span className="ml-2 text-gray-400">• Seleccionados: {itemsSeleccionadosModal.length}</span>
                    )}
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300"
                      checked={itemsFiltradosModal.length > 0 && itemsFiltradosModal.every(i => itemsSeleccionadosModal.includes(i.id))}
                      onChange={toggleSeleccionTodosModal}
                    />
                    Seleccionar todo
                  </label>
                </div>
        {/* Tiempo manual para envío (obligatorio) */}
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
              </div>

              {/* Lista de items */}
              <div className="space-y-2 max-h-[50vh] sm:max-h-[55vh] overflow-y-auto pr-1">
                {itemsFiltradosModal.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    <Package className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-gray-400" />
                    <p>No hay items que coincidan con la búsqueda</p>
                  </div>
                ) : (
                  itemsFiltradosModal.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => toggleSeleccionItemModal(item.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors text-sm flex items-center justify-between ${
                        itemsSeleccionadosModal.includes(item.id)
                          ? 'bg-blue-50 border-blue-200'
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{item.nombre_unidad}</div>
                        <div className="text-xs text-gray-500 truncate">RFID: {item.rfid} • {item.lote || 'Sin lote'} • {item.categoria?.toUpperCase?.()}</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={itemsSeleccionadosModal.includes(item.id)}
                        onChange={(e) => e.stopPropagation()}
                        className="rounded border-gray-300 ml-3"
                        aria-label={`Seleccionar ${item.nombre_unidad}`}
                        readOnly
                      />
                    </button>
                  ))
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
                  className="px-3 py-2 sm:px-4 sm:py-2 text-gray-600 bg-white rounded-lg hover:bg-white transition-colors text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarSeleccion}
                  disabled={itemsSeleccionadosModal.length === 0 || ((parseInt(horasEnvio || '0', 10) * 60 + parseInt(minutosEnvio || '0', 10)) <= 0)}
                  className={`px-3 py-2 sm:px-4 sm:py-2 rounded-lg transition-colors text-sm ${
                    itemsSeleccionadosModal.length > 0 && ((parseInt(horasEnvio || '0', 10) * 60 + parseInt(minutosEnvio || '0', 10)) > 0)
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-white text-gray-500 cursor-not-allowed'
                  }`}
                >
                  Iniciar envío ({itemsSeleccionadosModal.length} TICs)
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
          initialMinutes={TIEMPO_ENVIO_MIN}
          cargando={cargandoTimer}
        />
      )}
    </div>
  );
};

export default OperacionTranscursoView;
