import React, { useState, useEffect } from 'react';
import { Scan, Plus, Loader, ChevronDown, Menu, Play, Pause, Edit, Trash2, Search, CheckCircle, X } from 'lucide-react';
import { useOperaciones } from '../hooks/useOperaciones';
import RfidScanModal from './RfidScanModal';
import LoteSelectionModal from './LoteSelectionModal';
import TimerModal from './TimerModal';
import { useTimerContext } from '../../../contexts/TimerContext';
import { apiServiceClient } from '../../../api/apiClient';

interface TicItem {
  id: string;
  rfid: string;
  nombre_unidad: string;
  lote?: string;
  estado?: string;
  sub_estado?: string;
  fecha_registro?: string;
}

interface PreAcondicionamientoViewProps {
  // Props que podríamos necesitar del componente padre
}

const PreAcondicionamientoView: React.FC<PreAcondicionamientoViewProps> = () => {
  // Estados para las tablas
  const [ticsCongelamiento, setTicsCongelamiento] = useState<TicItem[]>([]);
  const [ticsAtemperamiento, setTicsAtemperamiento] = useState<TicItem[]>([]);
  
  // Estados para el modal de escaneo
  const [mostrarModalEscaneo, setMostrarModalEscaneo] = useState(false);
  const [tipoEscaneoActual, setTipoEscaneoActual] = useState<'congelamiento' | 'atemperamiento'>('congelamiento');
  const [rfidInput, setRfidInput] = useState('');
  const [rfidsEscaneados, setRfidsEscaneados] = useState<string[]>([]);

  // Función para procesar un RFID individual
  const procesarRfid = (rfid: string) => {
    if (!rfid.trim()) return;
    
    // Validar que el RFID sea válido (solo dígitos)
    if (!/^\d+$/.test(rfid.trim())) {
      console.warn(`⚠️ RFID inválido: ${rfid}. Solo se permiten dígitos.`);
      return;
    }
    
    // Verificar si el RFID existe en el inventario completo
    const itemEncontrado = operaciones.inventarioCompleto.find(item => 
      item.rfid === rfid.trim() || item.nombre_unidad === rfid.trim()
    );

    if (!itemEncontrado) {
      console.log(`❌ RFID ${rfid.trim()} no encontrado en el inventario`);
      return;
    }
    
    // Validar que el item sea específicamente un TIC
    if (itemEncontrado.categoria !== 'TIC') {
      console.warn(`⚠️ RFID ${rfid.trim()} no es un TIC (categoría: ${itemEncontrado.categoria}). Solo se permiten TICs en pre-acondicionamiento.`);
      return;
    }
    
    // Verificar si ya está en la lista
    if (!rfidsEscaneados.includes(rfid.trim())) {
      setRfidsEscaneados(prev => [...prev, rfid.trim()]);
      console.log(`✅ TIC ${rfid.trim()} auto-procesado`);
    } else {
      console.log(`ℹ️ TIC ${rfid.trim()} ya está en la lista`);
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
  
  // Estados para la carga de datos
  const [cargando, setCargando] = useState(false);
  const [cargandoTemporizador, setCargandoTemporizador] = useState(false);
  
  // Estado para el modal de selección de lotes
  const [mostrarModalLotes, setMostrarModalLotes] = useState(false);
  
  // Referencias para los menús desplegables
  const dropdownRefCongelacion = React.useRef<HTMLDivElement>(null);
  const dropdownRefAtemperamiento = React.useRef<HTMLDivElement>(null);
  
  // Estados para controlar la visibilidad de los menús desplegables
  const [showDropdownCongelacion, setShowDropdownCongelacion] = useState(false);
  const [showDropdownAtemperamiento, setShowDropdownAtemperamiento] = useState(false);
  
  // Estados para el modal de temporizador
  const [mostrarModalTimer, setMostrarModalTimer] = useState(false);
  const [tipoOperacionTimer, setTipoOperacionTimer] = useState<'congelamiento' | 'atemperamiento' | 'envio'>('congelamiento');
  const [rfidsPendientesTimer, setRfidsPendientesTimer] = useState<string[]>([]);
  const [rfidSeleccionado, setRfidSeleccionado] = useState<string>('');
  
  // Estados para paginación y búsqueda
  const [paginaActualCongelamiento, setPaginaActualCongelamiento] = useState(1);
  const [paginaActualAtemperamiento, setPaginaActualAtemperamiento] = useState(1);
  const [busquedaCongelamiento, setBusquedaCongelamiento] = useState('');
  const [busquedaAtemperamiento, setBusquedaAtemperamiento] = useState('');
  const itemsPorPagina = 20; // Mostrar 20 TICs por página
  
  // Obtenemos funciones del hook useOperaciones
  const operaciones = useOperaciones();
  
  // Hook para manejar timers
  const {
    timers,
    crearTimer,
    pausarTimer,
    reanudarTimer,
    eliminarTimer,
    formatearTiempo
  } = useTimerContext();
  
  // Efecto para cargar los datos iniciales
  useEffect(() => {
    cargarDatos();
  }, []);
  
  // Efecto para actualizar los datos cuando cambie el inventario
  useEffect(() => {
    if (operaciones.inventarioCompleto && operaciones.inventarioCompleto.length > 0 && !cargando) {
      console.log('🔄 Actualizando datos de pre-acondicionamiento...');
      const congelamiento = filtrarTicsCongelamiento(operaciones.inventarioCompleto);
      const atemperamiento = filtrarTicsAtemperamiento(operaciones.inventarioCompleto);
      
      setTicsCongelamiento(congelamiento);
      setTicsAtemperamiento(atemperamiento);
      
      // Datos actualizados - Congelamiento y Atemperamiento
    }
  }, [operaciones.inventarioCompleto, cargando]);
  
  // Efecto para cerrar los menús desplegables cuando se hace clic fuera de ellos
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Para el menú de Congelación
      if (
        dropdownRefCongelacion.current && 
        !dropdownRefCongelacion.current.contains(event.target as Node)
      ) {
        setShowDropdownCongelacion(false);
      }
      
      // Para el menú de Atemperamiento
      if (
        dropdownRefAtemperamiento.current && 
        !dropdownRefAtemperamiento.current.contains(event.target as Node)
      ) {
        setShowDropdownAtemperamiento(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // Función para filtrar TICs en congelamiento
  const filtrarTicsCongelamiento = (inventario: any[]) => {
    const filtered = inventario.filter((item: any) => {
      const esTic = item.categoria === 'TIC';
      const esPreAcond = item.estado === 'Pre-acondicionamiento';
      const esCongelacion = (item.sub_estado === 'Congelación' || item.sub_estado === 'Congelamiento');
      
      return esTic && esPreAcond && esCongelacion;
    });
    return filtered;
  };

  // Función para filtrar TICs en atemperamiento
  const filtrarTicsAtemperamiento = (inventario: any[]) => {
    const filtered = inventario.filter((item: any) => {
      const esTic = item.categoria === 'TIC';
      const esPreAcond = item.estado === 'Pre-acondicionamiento';
      const esAtemperamiento = item.sub_estado === 'Atemperamiento';
      
      return esTic && esPreAcond && esAtemperamiento;
    });
    // TICs filtrados para Atemperamiento
    return filtered;
  };

  // Función para cargar datos
  const cargarDatos = async () => {
    try {
      setCargando(true);
      console.log('🚀 Cargando datos de pre-acondicionamiento...');
      await operaciones.actualizarColumnasDesdeBackend();
    } catch (error) {
      console.error('Error al cargar datos:', error);
    } finally {
      setCargando(false);
    }
  };
  
  // Función para abrir modal de escaneo según el tipo
  const abrirModalEscaneo = (tipo: 'congelamiento' | 'atemperamiento') => {
    console.log('🎯 Abriendo modal de escaneo para:', tipo);
    setTipoEscaneoActual(tipo);
    setRfidsEscaneados([]);
    setRfidInput('');
    setMostrarModalEscaneo(true);
  };
  
  // Función para manejar el escaneo de RFID
  const manejarEscaneoRfid = () => {
    if (!rfidInput.trim()) return;
    
    // Verificar si el RFID existe en el inventario completo
    const itemEncontrado = operaciones.inventarioCompleto.find(item => 
      item.rfid === rfidInput.trim() || item.nombre_unidad === rfidInput.trim()
    );

    if (!itemEncontrado) {
      console.log(`❌ RFID ${rfidInput.trim()} no encontrado en el inventario`);
      alert(`RFID ${rfidInput.trim()} no encontrado en el inventario`);
      return;
    }
    
    // Validar que el item sea específicamente un TIC
    if (itemEncontrado.categoria !== 'TIC') {
      console.warn(`⚠️ RFID ${rfidInput.trim()} no es un TIC (categoría: ${itemEncontrado.categoria}). Solo se permiten TICs en pre-acondicionamiento.`);
      alert(`El item ${rfidInput.trim()} no es un TIC (categoría: ${itemEncontrado.categoria}). Solo se permiten TICs en pre-acondicionamiento.`);
      setRfidInput('');
      return;
    }
    
    // Verificar si ya está en la lista
    if (!rfidsEscaneados.includes(rfidInput.trim())) {
      setRfidsEscaneados([...rfidsEscaneados, rfidInput.trim()]);
      console.log(`✅ TIC ${rfidInput.trim()} agregado manualmente`);
    } else {
      console.log(`ℹ️ TIC ${rfidInput.trim()} ya está en la lista`);
    }
    
    setRfidInput('');
  };
  
  // Función para confirmar la adición de TICs
  const confirmarAdicion = async (rfids: string[], subEstado?: string): Promise<boolean> => {
    if (rfids.length === 0) return false;
    
    // Verificar si algún TIC tiene temporizador activo
    const ticsConTimerActivo = rfids.filter(rfid => tieneTimerActivo(rfid));
    
    if (ticsConTimerActivo.length > 0) {
      const mensaje = ticsConTimerActivo.length === 1 
        ? `El TIC ${ticsConTimerActivo[0]} aún tiene un temporizador activo. ¿Estás seguro de que quieres cambiar su estado antes de que termine el tiempo?`
        : `${ticsConTimerActivo.length} TICs aún tienen temporizadores activos: ${ticsConTimerActivo.join(', ')}. ¿Estás seguro de que quieres cambiar su estado antes de que termine el tiempo?`;
      
      const confirmar = window.confirm(mensaje);
      
      if (!confirmar) {
        return false; // Cancelar el cambio
      }
      
      // Si el usuario confirma, eliminar los temporizadores activos
      ticsConTimerActivo.forEach(rfid => {
        const timer = obtenerTemporizadorTIC(rfid);
        if (timer) {
          eliminarTimer(timer.id);
        }
      });
    }
    
    const subEstadoFinal = subEstado || (tipoEscaneoActual === 'congelamiento' ? 'Congelación' : 'Atemperamiento');
    console.log('📝 Confirmando adición de TICs:', {
      rfids: rfids,
      tipoEscaneoActual: tipoEscaneoActual,
      subEstadoFinal: subEstadoFinal
    });
    
    // Cerrar modal de escaneo
    setMostrarModalEscaneo(false);
    setRfidsEscaneados([]);
    
    // Guardar los RFIDs y abrir modal de temporizador
    setRfidsPendientesTimer(rfids);
    setTipoOperacionTimer(tipoEscaneoActual);
    setMostrarModalTimer(true);
    
    return true;
  };
  
  // Función para confirmar con temporizador
  const confirmarConTemporizador = async (tiempoMinutos: number): Promise<void> => {
    let timeoutId: NodeJS.Timeout | undefined;
    
    try {
      setCargandoTemporizador(true);
      const subEstadoFinal = tipoOperacionTimer === 'congelamiento' ? 'Congelación' : 'Atemperamiento';
      
      console.log('🕐 Iniciando configuración de temporizador...');
      console.log('📋 RFIDs a procesar:', rfidsPendientesTimer);
      console.log('⏱️ Tiempo configurado:', tiempoMinutos, 'minutos');
      console.log('🎯 Tipo de operación:', tipoOperacionTimer);
      console.log('📊 Sub-estado final:', subEstadoFinal);
      
      // Configurar timeout de 30 segundos
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Timeout: La operación tomó demasiado tiempo (más de 30 segundos)'));
        }, 30000);
      });
      
      // Procesar los TICs con lotes automáticos y timeout
      const resultado = await Promise.race([
        // Usar el nuevo endpoint de lotes automáticos
        apiServiceClient.patch('/inventory/inventario/asignar-lote-automatico', {
          rfids: rfidsPendientesTimer,
          estado: 'Pre-acondicionamiento',
          sub_estado: subEstadoFinal
        }),
        timeoutPromise
      ]);
      
      // Limpiar timeout si la operación se completó
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      console.log('✅ Resultado del backend:', resultado);
      
      // El nuevo endpoint retorna información sobre los items actualizados y el lote generado
      const response = resultado as any; // Tipear como any para evitar errores de TypeScript
      const itemsActualizados = response.data?.items_actualizados || 0;
      const loteGenerado = response.data?.lote_generado || '';
      
      // Verificar si hay TICs válidos para procesar
      const hayTicsParaProcesar = rfidsPendientesTimer.length > 0;
      
      if (hayTicsParaProcesar && itemsActualizados > 0) {
        // Crear timer para cada TIC
        console.log('🔄 Creando temporizadores...');
        const timersCreados: string[] = [];
        
        rfidsPendientesTimer.forEach((rfid, index) => {
          console.log(`⏰ Creando timer ${index + 1}/${rfidsPendientesTimer.length} para RFID: ${rfid}`);
          const timerId = crearTimer(
            rfid,
            tipoOperacionTimer,
            tiempoMinutos
          );
          timersCreados.push(timerId);
          console.log(`✅ Timer creado con ID: ${timerId}`);
        });
        
        console.log(`🎉 Temporizadores creados exitosamente para ${rfidsPendientesTimer.length} TICs por ${tiempoMinutos} minutos`);
        console.log('🆔 IDs de timers creados:', timersCreados);
        
        // Limpiar estados ANTES de mostrar el mensaje de éxito
        setMostrarModalTimer(false);
        setRfidsPendientesTimer([]);
        
        // Mostrar mensaje con información del lote automático generado
        alert(`✅ Procesamiento exitoso!\n\n🏷️ Lote automático asignado: ${loteGenerado}\n⏰ Temporizadores iniciados para ${itemsActualizados} TIC(s) por ${tiempoMinutos} minutos`);
        
        // Recargar datos
        console.log('🔄 Recargando datos...');
        await cargarDatos();
        console.log('✅ Datos recargados');
      } else {
        console.error('❌ No hay TICs para procesar o no se actualizaron items');
        throw new Error('No hay TICs válidos para procesar o no se pudieron actualizar');
      }
    } catch (error) {
      // Limpiar timeout en caso de error
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      console.error('❌ Error al confirmar adición con temporizador:', error);
      
      // Mostrar error detallado al usuario
      let mensajeError = 'Error al configurar los temporizadores';
      if (error instanceof Error) {
        if (error.message.includes('Timeout')) {
          mensajeError = 'La operación tomó demasiado tiempo. Por favor, verifica la conexión e intenta nuevamente.';
        } else {
          mensajeError += `: ${error.message}`;
        }
      }
      
      alert(mensajeError);
      
      // No limpiar los estados en caso de error para que el usuario pueda reintentar
    } finally {
      setCargandoTemporizador(false);
      console.log('🏁 Proceso finalizado, estado de carga limpiado');
    }
  };
  
  // Función para eliminar un TIC de la lista de escaneados
  const eliminarRfidEscaneado = (rfid: string) => {
    setRfidsEscaneados(rfidsEscaneados.filter((r: string) => r !== rfid));
  };
  
  // Función para obtener el temporizador de un TIC específico
  const obtenerTemporizadorTIC = (rfid: string) => {
    return timers.find((timer: any) => timer.nombre === rfid && !timer.completado);
  };

  // Función para verificar si un TIC tiene temporizador activo
  const tieneTimerActivo = (rfid: string): boolean => {
    const timer = obtenerTemporizadorTIC(rfid);
    return timer ? timer.activo && !timer.completado : false;
  };

  // Función para completar un TIC y moverlo al siguiente estado
  const completarTIC = async (rfid: string, timerCompletado: any) => {
    try {
      // Determinar el siguiente estado basado en el tipo de operación
      let siguienteEstado = '';
      let siguienteSubEstado = '';
      let tiempoNuevo = 0; // Tiempo en minutos para el nuevo estado
      
      if (timerCompletado.tipoOperacion === 'congelamiento') {
        // Congelamiento completado → va a Atemperamiento
        siguienteEstado = 'Pre-acondicionamiento';
        siguienteSubEstado = 'Atemperamiento';
        tiempoNuevo = 10; // 10 minutos para atemperamiento
      } else if (timerCompletado.tipoOperacion === 'atemperamiento') {
        // Atemperamiento completado → va a Almacenamiento
        siguienteEstado = 'Almacenamiento';
        siguienteSubEstado = 'Almacenamiento';
        tiempoNuevo = 0; // Sin timer para almacenamiento
      }

      console.log(`🔄 Completando TIC ${rfid} - Moviendo a ${siguienteEstado} / ${siguienteSubEstado} con tiempo: ${tiempoNuevo} min`);

      // Confirmar con el usuario
      const mensajeConfirmacion = timerCompletado.tipoOperacion === 'congelamiento' 
        ? `¿Completar el proceso de congelamiento para el TIC ${rfid}?\n\nEsto moverá el TIC a: Atemperamiento (${tiempoNuevo} minutos)`
        : `¿Completar el proceso de atemperamiento para el TIC ${rfid}?\n\nEsto moverá el TIC a: Almacenamiento`;
      
      const confirmar = window.confirm(mensajeConfirmacion);

      if (!confirmar) return;

      // Eliminar el timer completado ANTES de mover
      eliminarTimer(timerCompletado.id);

      // Mover el TIC al siguiente estado usando la función existente
      const resultado = await operaciones.confirmarPreAcondicionamiento([rfid], siguienteSubEstado);
      
      if (resultado || resultado !== false) {
        // Si el nuevo estado necesita timer, crearlo
        if (tiempoNuevo > 0) {
          console.log(`⏰ Creando nuevo timer de ${tiempoNuevo} minutos para ${rfid}`);
          
          // Crear nuevo timer para el siguiente estado
          const tipoOperacion = siguienteSubEstado.toLowerCase() as 'congelamiento' | 'atemperamiento' | 'envio';
          const timerId = crearTimer(
            `TIC ${rfid}`,
            tipoOperacion,
            tiempoNuevo
          );
          
          console.log(`✅ Nuevo timer creado con ID: ${timerId}`);
        }
        
        // Recargar datos
        await cargarDatos();
        
        const mensajeExito = timerCompletado.tipoOperacion === 'congelamiento'
          ? `✅ TIC ${rfid} completado y movido a Atemperamiento con timer de ${tiempoNuevo} minutos`
          : `✅ TIC ${rfid} completado y movido a Almacenamiento`;
        
        alert(mensajeExito);
        
        console.log(`✅ TIC ${rfid} completado exitosamente`);
      } else {
        throw new Error('Error al actualizar el estado del TIC');
      }
    } catch (error) {
      console.error('❌ Error al completar TIC:', error);
      alert(`Error al completar el TIC ${rfid}: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  };
  
  // Función para renderizar el temporizador de un TIC
  const renderizarTemporizador = (rfid: string, esAtemperamiento: boolean = false) => {
    const timer = obtenerTemporizadorTIC(rfid);
    
    // Verificar si hay un timer completado para este RFID
    const timerCompletado = timers.find((t: any) => t.nombre === rfid && t.completado);
    
    if (timerCompletado) {
      // Timer completado - mostrar estado completado
      return (
        <div className="flex flex-col items-center justify-center space-y-2 py-2">
          <span className="text-green-600 text-xs font-medium flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Tiempo completado
          </span>
          <div className="text-xs text-gray-500 text-center">
            {timerCompletado.tipoOperacion === 'congelamiento' ? 'Congelación' : 'Atemperamiento'} - {timerCompletado.tiempoInicialMinutos} min
          </div>
          <div className="flex gap-1">
            {!esAtemperamiento && (
              <button
                onClick={() => completarTIC(rfid, timerCompletado)}
                className="flex items-center gap-1 px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-md text-xs transition-colors"
                title="Completar proceso y mover al siguiente estado"
              >
                <CheckCircle className="w-3 h-3" />
                Completar
              </button>
            )}
            <button
              onClick={async () => {
                // Eliminar el timer completado
                eliminarTimer(timerCompletado.id);
                // Recargar datos para actualizar la interfaz
                await cargarDatos();
              }}
              className="flex items-center gap-1 px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-md text-xs transition-colors"
              title="Limpiar registro"
            >
              <X className="w-3 h-3" />
              Limpiar
            </button>
          </div>
        </div>
      );
    }
    
    if (!timer) {
      // Sin temporizador - mostrar botón para iniciar
      return (
        <div className="flex flex-col items-center justify-center space-y-2 py-2">
          <span className="text-gray-400 text-xs mb-1">
            Sin temporizador
          </span>
          <button
            onClick={() => {
              setRfidSeleccionado(rfid);
              setRfidsPendientesTimer([rfid]);
              // Determinar el tipo de operación basado en qué tabla contiene el TIC
              const ticEnCongelamiento = ticsCongelamiento.find(tic => tic.rfid === rfid);
              const ticEnAtemperamiento = ticsAtemperamiento.find(tic => tic.rfid === rfid);
              
              if (ticEnCongelamiento) {
                setTipoOperacionTimer('congelamiento');
              } else if (ticEnAtemperamiento) {
                setTipoOperacionTimer('atemperamiento');
              }
              
              setMostrarModalTimer(true);
            }}
            className="flex items-center gap-1 px-2 py-1 bg-green-100 hover:bg-green-200 text-green-700 rounded-md text-xs transition-colors"
            title="Iniciar temporizador"
          >
            <Play className="w-3 h-3" />
            Iniciar
          </button>
        </div>
      );
    }
    
    const tiempoFormateado = formatearTiempo(timer.tiempoRestanteSegundos);
    const esUrgente = timer.tiempoRestanteSegundos < 300; // Menos de 5 minutos
    
    return (
      <div className="flex flex-col items-center justify-center space-y-2 py-2">
        <div className="flex items-center justify-center gap-2">
          <span className={`font-mono text-sm font-medium ${
            esUrgente ? 'text-red-600' : 
            timer.tipoOperacion === 'congelamiento' ? 'text-blue-600' : 'text-orange-600'
          }`}>
            {tiempoFormateado}
          </span>
          {!timer.activo && (
            <span className="text-xs text-gray-500">(Pausado)</span>
          )}
        </div>
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => timer.activo ? pausarTimer(timer.id) : reanudarTimer(timer.id)}
            className={`p-1 rounded-md text-xs transition-colors ${
              timer.activo 
                ? 'bg-yellow-100 hover:bg-yellow-200 text-yellow-700' 
                : 'bg-green-100 hover:bg-green-200 text-green-700'
            }`}
            title={timer.activo ? "Pausar" : "Reanudar"}
          >
            {timer.activo ? (
              <Pause className="w-3 h-3" />
            ) : (
              <Play className="w-3 h-3" />
            )}
          </button>
          <button
            onClick={() => {
              setRfidSeleccionado(rfid);
              setRfidsPendientesTimer([rfid]);
              // Determinar el tipo de operación basado en qué lista contiene el TIC
              const timer = obtenerTemporizadorTIC(rfid);
              if (timer) {
                setTipoOperacionTimer(timer.tipoOperacion);
              }
              setMostrarModalTimer(true);
            }}
            className="p-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-md text-xs transition-colors"
            title="Editar"
          >
            <Edit className="w-3 h-3" />
          </button>
          <button
            onClick={() => eliminarTimer(timer.id)}
            className="p-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-md text-xs transition-colors"
            title="Eliminar"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  };
  
  // Función para manejar la selección de TICs por lote
  const manejarSeleccionLote = (tics: string[]) => {
    setRfidsEscaneados(tics);
    setMostrarModalLotes(false);
    setMostrarModalEscaneo(true);
  };

  // Funciones auxiliares para filtrado y paginación
  const filtrarTics = (tics: TicItem[], busqueda: string): TicItem[] => {
    if (!busqueda.trim()) return tics;
    
    const termino = busqueda.toLowerCase();
    return tics.filter(tic => 
  (typeof tic.rfid === 'string' && tic.rfid.toLowerCase().includes(termino)) ||
  (typeof tic.nombre_unidad === 'string' && tic.nombre_unidad.toLowerCase().includes(termino)) ||
  (typeof tic.lote === 'string' && tic.lote.toLowerCase().includes(termino))
    );
  };

  const paginarTics = (tics: TicItem[], pagina: number): TicItem[] => {
    const inicio = (pagina - 1) * itemsPorPagina;
    const fin = inicio + itemsPorPagina;
    return tics.slice(inicio, fin);
  };

  const calcularTotalPaginas = (total: number): number => {
    return Math.ceil(total / itemsPorPagina);
  };

  // Datos filtrados y paginados
  const ticsCongelamientoFiltrados = filtrarTics(ticsCongelamiento, busquedaCongelamiento);
  const ticsCongelamientoPaginados = paginarTics(ticsCongelamientoFiltrados, paginaActualCongelamiento);
  const totalPaginasCongelamiento = calcularTotalPaginas(ticsCongelamientoFiltrados.length);

  const ticsAtemperamientoFiltrados = filtrarTics(ticsAtemperamiento, busquedaAtemperamiento);
  const ticsAtemperamientoPaginados = paginarTics(ticsAtemperamientoFiltrados, paginaActualAtemperamiento);
  const totalPaginasAtemperamiento = calcularTotalPaginas(ticsAtemperamientoFiltrados.length);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-6">Registrar Pre Acondicionamiento</h1>
      
      {/* Sección de TICs para Congelamiento */}
      <div className="bg-white rounded-lg shadow-md mb-8 overflow-hidden">
        <div className="bg-blue-50 p-4 border-b border-blue-100 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-blue-800">
            TICs para Congelamiento 
            <span className="ml-2 text-sm font-normal text-blue-600">
              ({ticsCongelamientoFiltrados.length} de {ticsCongelamiento.length})
            </span>
          </h2>
          <div className="flex gap-2">            
            {/* Botón para iniciar temporizadores de todos los TICs sin temporizador */}
            {ticsCongelamiento.filter(tic => !obtenerTemporizadorTIC(tic.rfid)).length > 0 && (
              <button
                onClick={() => {
                  const ticsSinTimer = ticsCongelamiento.filter(tic => !obtenerTemporizadorTIC(tic.rfid));
                  setRfidsPendientesTimer(ticsSinTimer.map(tic => tic.rfid));
                  setTipoOperacionTimer('congelamiento');
                  setMostrarModalTimer(true);
                }}
                className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm transition-colors"
                title="Iniciar temporizador para todos los TICs sin temporizador"
              >
                <Play size={16} />
                Iniciar Todos ({ticsCongelamiento.filter(tic => !obtenerTemporizadorTIC(tic.rfid)).length})
              </button>
            )}
            <button 
              className={`p-2 rounded-full transition-colors ${
                cargando 
                  ? 'bg-blue-100 text-blue-400 cursor-not-allowed' 
                  : 'hover:bg-blue-100 text-blue-600'
              }`}
              title="Actualizar lista"
              onClick={cargarDatos}
              disabled={cargando}
            >
              <Loader size={18} className={cargando ? 'animate-spin' : ''} />
            </button>
            <div className="relative" ref={dropdownRefCongelacion}>
              <button 
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-md flex items-center gap-2"
                onClick={() => setShowDropdownCongelacion(!showDropdownCongelacion)}
              >
                <Plus size={18} />
                Agregar TICs
                <ChevronDown size={16} />
              </button>
              
              {showDropdownCongelacion && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200">
                  <div className="py-1">
                    <button
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      onClick={() => {
                        setRfidsEscaneados([]);
                        setRfidInput('');
                        abrirModalEscaneo('congelamiento');
                        setShowDropdownCongelacion(false);
                      }}
                    >
                      <Scan size={16} />
                      Escanear TICs
                    </button>
                    <button
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      onClick={() => {
                        setTipoEscaneoActual('congelamiento');
                        setMostrarModalLotes(true);
                        setShowDropdownCongelacion(false);
                      }}
                    >
                      <Menu size={16} />
                      Seleccionar por lote
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Barra de búsqueda */}
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Buscar por RFID, nombre o lote..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={busquedaCongelamiento}
              onChange={(e) => {
                setBusquedaCongelamiento(e.target.value);
                setPaginaActualCongelamiento(1); // Resetear a la primera página al buscar
              }}
            />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  RFID
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  NOMBRE
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  LOTE
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ESTADO
                </th>
                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  TEMPORIZADOR
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {cargando ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <Loader className="animate-spin h-5 w-5 text-blue-600" />
                      <span className="text-sm text-gray-500">Cargando TICs para congelamiento...</span>
                    </div>
                  </td>
                </tr>
              ) : ticsCongelamientoPaginados.length > 0 ? (
                ticsCongelamientoPaginados.map((tic: TicItem) => (
                  <tr key={tic.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{tic.rfid}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{tic.nombre_unidad}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{tic.lote}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {tic.sub_estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      {renderizarTemporizador(tic.rfid)}
                    </td>
                  </tr>
                ))
              ) : busquedaCongelamiento ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center">
                    <div className="text-gray-500">
                      <Search className="mx-auto h-8 w-8 mb-2 text-gray-400" />
                      <p>No se encontraron TICs que coincidan con "{busquedaCongelamiento}"</p>
                      <button 
                        onClick={() => setBusquedaCongelamiento('')}
                        className="mt-2 text-blue-600 hover:text-blue-700 text-sm"
                      >
                        Limpiar búsqueda
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center">
                    <div className="text-gray-500">
                      <p>No hay TICs en congelamiento</p>
                      <p className="text-sm mt-1">Agregue TICs usando los botones de arriba</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Controles de paginación */}
        {ticsCongelamientoFiltrados.length > itemsPorPagina && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Mostrando {((paginaActualCongelamiento - 1) * itemsPorPagina) + 1} a{' '}
              {Math.min(paginaActualCongelamiento * itemsPorPagina, ticsCongelamientoFiltrados.length)} de{' '}
              {ticsCongelamientoFiltrados.length} TICs
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPaginaActualCongelamiento(paginaActualCongelamiento - 1)}
                disabled={paginaActualCongelamiento === 1}
                className="p-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                ‹ Anterior
              </button>
              <span className="text-sm text-gray-600">
                Página {paginaActualCongelamiento} de {totalPaginasCongelamiento}
              </span>
              <button
                onClick={() => setPaginaActualCongelamiento(paginaActualCongelamiento + 1)}
                disabled={paginaActualCongelamiento === totalPaginasCongelamiento}
                className="p-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                Siguiente ›
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* Sección de TICs para Atemperamiento */}
      <div className="bg-white rounded-lg shadow-md mb-8 overflow-hidden">
        <div className="bg-orange-50 p-4 border-b border-orange-100 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-orange-800">
            TICs para Atemperamiento
            <span className="ml-2 text-sm font-normal text-orange-600">
              ({ticsAtemperamientoFiltrados.length} de {ticsAtemperamiento.length})
            </span>
          </h2>
          <div className="flex gap-2">            
            {/* Botón para iniciar temporizadores de todos los TICs sin temporizador */}
            {ticsAtemperamiento.filter(tic => !obtenerTemporizadorTIC(tic.rfid)).length > 0 && (
              <button
                onClick={() => {
                  const ticsSinTimer = ticsAtemperamiento.filter(tic => !obtenerTemporizadorTIC(tic.rfid));
                  setRfidsPendientesTimer(ticsSinTimer.map(tic => tic.rfid));
                  setTipoOperacionTimer('atemperamiento');
                  setMostrarModalTimer(true);
                }}
                className="flex items-center gap-2 px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-md text-sm transition-colors"
                title="Iniciar temporizador para todos los TICs sin temporizador"
              >
                <Play size={16} />
                Iniciar Todos ({ticsAtemperamiento.filter(tic => !obtenerTemporizadorTIC(tic.rfid)).length})
              </button>
            )}
            <button 
              className={`p-2 rounded-full transition-colors ${
                cargando 
                  ? 'bg-orange-100 text-orange-400 cursor-not-allowed' 
                  : 'hover:bg-orange-100 text-orange-600'
              }`}
              title="Actualizar lista"
              onClick={cargarDatos}
              disabled={cargando}
            >
              <Loader size={18} className={cargando ? 'animate-spin' : ''} />
            </button>
            <div className="relative" ref={dropdownRefAtemperamiento}>
              <button 
                className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded-md flex items-center gap-2"
                onClick={() => setShowDropdownAtemperamiento(!showDropdownAtemperamiento)}
              >
                <Plus size={18} />
                Agregar TICs
                <ChevronDown size={16} />
              </button>
              
              {showDropdownAtemperamiento && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200">
                  <div className="py-1">
                    <button
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      onClick={() => {
                        setRfidsEscaneados([]);
                        setRfidInput('');
                        abrirModalEscaneo('atemperamiento');
                        setShowDropdownAtemperamiento(false);
                      }}
                    >
                      <Scan size={16} />
                      Escanear TICs
                    </button>
                    <button
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      onClick={() => {
                        setTipoEscaneoActual('atemperamiento');
                        setMostrarModalLotes(true);
                        setShowDropdownAtemperamiento(false);
                      }}
                    >
                      <Menu size={16} />
                      Seleccionar por lote
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Barra de búsqueda */}
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Buscar por RFID, nombre o lote..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              value={busquedaAtemperamiento}
              onChange={(e) => {
                setBusquedaAtemperamiento(e.target.value);
                setPaginaActualAtemperamiento(1); // Resetear a la primera página al buscar
              }}
            />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  RFID
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  NOMBRE
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  LOTE
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ESTADO
                </th>
                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  TEMPORIZADOR
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {cargando ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <Loader className="animate-spin h-5 w-5 text-orange-600" />
                      <span className="text-sm text-gray-500">Cargando TICs para atemperamiento...</span>
                    </div>
                  </td>
                </tr>
              ) : ticsAtemperamientoPaginados.length > 0 ? (
                ticsAtemperamientoPaginados.map((tic: TicItem) => (
                  <tr key={tic.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{tic.rfid}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{tic.nombre_unidad}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{tic.lote}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                        {tic.sub_estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">{renderizarTemporizador(tic.rfid, true)}</td>
                  </tr>
                ))
              ) : busquedaAtemperamiento ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center">
                    <div className="text-gray-500">
                      <Search className="mx-auto h-8 w-8 mb-2 text-gray-400" />
                      <p>No se encontraron TICs que coincidan con "{busquedaAtemperamiento}"</p>
                      <button 
                        onClick={() => setBusquedaAtemperamiento('')}
                        className="mt-2 text-orange-600 hover:text-orange-700 text-sm"
                      >
                        Limpiar búsqueda
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center">
                    <div className="text-gray-500">
                      <p>No hay TICs en atemperamiento</p>
                      <p className="text-sm mt-1">Agregue TICs usando los botones de arriba</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Controles de paginación */}
        {ticsAtemperamientoFiltrados.length > itemsPorPagina && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Mostrando {((paginaActualAtemperamiento - 1) * itemsPorPagina) + 1} a{' '}
              {Math.min(paginaActualAtemperamiento * itemsPorPagina, ticsAtemperamientoFiltrados.length)} de{' '}
              {ticsAtemperamientoFiltrados.length} TICs
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPaginaActualAtemperamiento(paginaActualAtemperamiento - 1)}
                disabled={paginaActualAtemperamiento === 1}
                className="p-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                ‹ Anterior
              </button>
              <span className="text-sm text-gray-600">
                Página {paginaActualAtemperamiento} de {totalPaginasAtemperamiento}
              </span>
              <button
                onClick={() => setPaginaActualAtemperamiento(paginaActualAtemperamiento + 1)}
                disabled={paginaActualAtemperamiento === totalPaginasAtemperamiento}
                className="p-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                Siguiente ›
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* Modal de Escaneo RFID */}
      <RfidScanModal
        mostrarModal={mostrarModalEscaneo}
        rfidInput={rfidInput}
        rfidsEscaneados={rfidsEscaneados}
        onRfidInputChange={handleRfidChange}
        onEscanearRfid={manejarEscaneoRfid}
        onConfirmar={confirmarAdicion}
        onCancelar={() => {
          setMostrarModalEscaneo(false);
          setRfidsEscaneados([]);
          setRfidInput('');
        }}
        titulo={`Escanear TICs para ${tipoEscaneoActual === 'congelamiento' ? 'Congelamiento' : 'Atemperamiento'}`}
        descripcion={`Escanee los TICs que desea agregar a la lista de ${tipoEscaneoActual === 'congelamiento' ? 'congelamiento' : 'atemperamiento'} o ingrese los códigos manualmente.`}
        onEliminarRfid={eliminarRfidEscaneado}
        subEstado={tipoEscaneoActual === 'congelamiento' ? 'Congelación' : 'Atemperamiento'}
      />
      
      {/* Modal para seleccionar TICs por lote */}
      <LoteSelectionModal
        mostrarModal={mostrarModalLotes}
        onCancelar={() => setMostrarModalLotes(false)}
        onSeleccionarLote={manejarSeleccionLote}
        subEstado={tipoEscaneoActual === 'congelamiento' ? 'Congelación' : 'Atemperamiento'}
      />
      
      {/* Modal de temporizador */}
      <TimerModal
        mostrarModal={mostrarModalTimer}
        onCancelar={() => {
          if (!cargandoTemporizador) {
            setMostrarModalTimer(false);
            setRfidsPendientesTimer([]);
            setRfidSeleccionado('');
          }
        }}
        onConfirmar={confirmarConTemporizador}
        titulo={`Configurar Temporizador - ${
          tipoOperacionTimer === 'congelamiento' ? 'Congelación' : 
          tipoOperacionTimer === 'atemperamiento' ? 'Atemperamiento' : 
          'Envío'
        }`}
        descripcion={`Configure el tiempo de ${
          tipoOperacionTimer === 'congelamiento' ? 'congelación' : 
          tipoOperacionTimer === 'atemperamiento' ? 'atemperamiento' : 
          'envío'
        } para ${rfidsPendientesTimer.length} TIC(s). Se creará un temporizador para cada TIC.`}
        tipoOperacion={tipoOperacionTimer}
        cargando={cargandoTemporizador}
      />

    </div>
  );
};

export default PreAcondicionamientoView;
