import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Scan, Plus, Loader, ChevronDown, Menu, Play, Pause, Edit, Trash2, Search, CheckCircle, X } from 'lucide-react';
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

  // Estado para prevenir duplicados recientes
  const [ultimosRfidsEscaneados, setUltimosRfidsEscaneados] = useState<{[key: string]: number}>({});

  // Función para procesar un RFID individual
  const procesarRfid = (rfid: string) => {
    if (!rfid.trim()) return;
    const rfidLimpio = rfid.trim();

    // Prevenir duplicados recientes (últimos 2 segundos)
    const ahora = Date.now();
    const ultimo = ultimosRfidsEscaneados[rfidLimpio];
    if (ultimo && (ahora - ultimo) < 2000) {
      console.log(`🔄 Ignorando duplicado reciente: ${rfidLimpio}`);
      return;
    }

    // Actualizar timestamp del último escaneo
    setUltimosRfidsEscaneados(prev => ({
      ...prev,
      [rfidLimpio]: ahora
    }));

    // Validar que el RFID sea válido (alfanumérico: dígitos y letras)
    if (!/^[a-zA-Z0-9]+$/.test(rfidLimpio)) {
      console.warn(`⚠️ RFID inválido: ${rfidLimpio}. Solo se permiten dígitos y letras.`);
      alert(`⚠️ RFID inválido: ${rfidLimpio}. Solo se permiten dígitos y letras.`);
      return;
    }

    const itemEncontrado = operaciones.inventarioCompleto.find(item => 
      item.rfid === rfidLimpio || item.nombre_unidad === rfidLimpio
    );

    if (!itemEncontrado) {
      console.log(`❌ RFID ${rfidLimpio} no encontrado en el inventario`);
      alert(`❌ RFID ${rfidLimpio} no encontrado en el inventario`);
      return;
    }

    // Validar que el item sea específicamente un TIC
    if (itemEncontrado.categoria !== 'TIC') {
      console.warn(`⚠️ RFID ${rfidLimpio} no es un TIC (categoría: ${itemEncontrado.categoria}). Solo se permiten TICs en pre-acondicionamiento.`);
      alert(`⚠️ El item ${rfidLimpio} no es un TIC (categoría: ${itemEncontrado.categoria}). En pre-acondicionamiento solo se permiten TICs.`);
      return;
    }

    // Si estamos escaneando para Atemperamiento, exigir que el item venga de Congelación
    if (tipoEscaneoActual === 'atemperamiento') {
      const estadoLower = String(itemEncontrado.estado || '').toLowerCase();
      const subLower = String(itemEncontrado.sub_estado || '').toLowerCase();
  const estadoOk = estadoLower === 'pre-acondicionamiento' || estadoLower === 'preacondicionamiento' || estadoLower.replace(/-/g,'') === 'pre acondicionamiento';
      const vieneDeCongelacion = subLower.includes('congel');
      if (!(estadoOk && vieneDeCongelacion)) {
        alert('⚠️ Solo pueden escanearse para Atemperamiento las TICs cuyo estado actual es Pre-acondicionamiento y su sub-estado es Congelación.');
        return;
      }
    }

    // Verificar si ya está en la lista
    if (!rfidsEscaneados.includes(rfidLimpio)) {
      setRfidsEscaneados(prev => [...prev, rfidLimpio]);
      console.log(`✅ TIC ${rfidLimpio} auto-procesado`);
    } else {
      console.log(`ℹ️ TIC ${rfidLimpio} ya está en la lista`);
    }
  };

  // Función para manejar cambios en el input de RFID (sin auto-procesamiento, el modal lo maneja)
  const handleRfidChange = (value: string) => {
    setRfidInput(value);
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
  
  // Estados para el modal de cronómetro
  const [mostrarModalTimer, setMostrarModalTimer] = useState(false);
  const [tipoOperacionTimer, setTipoOperacionTimer] = useState<'congelamiento' | 'atemperamiento' | 'envio' | 'inspeccion'>('congelamiento');
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
    iniciarTimer,
    iniciarTimers,
    pausarTimer,
    reanudarTimer,
    eliminarTimer,
  formatearTiempo,
  isStartingBatchFor,
    isConnected
  } = useTimerContext();
  
  // Efecto para cargar los datos iniciales
  useEffect(() => {
    cargarDatos();
  }, []);
  
  // Efecto para actualizar los datos cuando cambie el inventario
  useEffect(() => {
    if (operaciones.inventarioCompleto && operaciones.inventarioCompleto.length > 0 && !cargando) {
      console.log('🔄 [DEBUG] Actualizando datos de pre-acondicionamiento...');
      console.log('📊 [DEBUG] Inventario completo recibido:', operaciones.inventarioCompleto.length, 'items');
      
      const congelamiento = filtrarTicsCongelamiento(operaciones.inventarioCompleto);
      const atemperamiento = filtrarTicsAtemperamiento(operaciones.inventarioCompleto);
      
      console.log('❄️ [DEBUG] TICs en congelamiento:', congelamiento.length);
      console.log('🌡️ [DEBUG] TICs en atemperamiento:', atemperamiento.length);
      
      setTicsCongelamiento(congelamiento);
      setTicsAtemperamiento(atemperamiento);
      
      // Datos actualizados - Congelamiento y Atemperamiento
      console.log('✅ [DEBUG] Estados actualizados correctamente');
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
    console.log('❄️ [DEBUG] Filtrando TICs para congelamiento...');
    
    const filtered = inventario.filter((item: any) => {
      const esTic = item.categoria === 'TIC';
  const esPreAcond = ['pre-acondicionamiento','preacondicionamiento','Pre-acondicionamiento'].includes((item.estado||'').toLowerCase().replace(/-/g,''));
      // Hacer comparación case-insensitive
      const esCongelacion = item.sub_estado && 
        (item.sub_estado.toLowerCase() === 'congelación' || 
         item.sub_estado.toLowerCase() === 'congelacion' ||
         item.sub_estado.toLowerCase() === 'congelamiento');
      
      // Log detallado para debugging
      if (esTic) {
        console.log(`❄️ [DEBUG] TIC ${item.rfid}:`, {
          categoria: item.categoria,
          estado: item.estado,
          sub_estado: item.sub_estado,
          sub_estado_lower: item.sub_estado?.toLowerCase(),
          lote: item.lote,
          cumple_filtro: esTic && esPreAcond && esCongelacion
        });
      }
      
      return esTic && esPreAcond && esCongelacion;
    });
    
    console.log('❄️ [DEBUG] TICs filtrados para Congelamiento:', filtered.length);
    return filtered;
  };

  // Función para filtrar TICs en atemperamiento
  const filtrarTicsAtemperamiento = (inventario: any[]) => {
    console.log('🔍 [DEBUG] Filtrando TICs para atemperamiento...');
    console.log('📊 [DEBUG] Total items en inventario:', inventario.length);
    
    const filtered = inventario.filter((item: any) => {
      const esTic = item.categoria === 'TIC';
  const esPreAcond = ['pre-acondicionamiento','preacondicionamiento','Pre-acondicionamiento'].includes((item.estado||'').toLowerCase().replace(/-/g,''));
      // Hacer comparación case-insensitive para sub_estado
      const esAtemperamiento = item.sub_estado && item.sub_estado.toLowerCase() === 'atemperamiento';
      
      // Log detallado para debugging
      if (esTic) {
        console.log(`🔍 [DEBUG] TIC ${item.rfid}:`, {
          categoria: item.categoria,
          estado: item.estado,
          sub_estado: item.sub_estado,
          sub_estado_lower: item.sub_estado?.toLowerCase(),
          lote: item.lote,
          cumple_filtro: esTic && esPreAcond && esAtemperamiento
        });
      }
      
      return esTic && esPreAcond && esAtemperamiento;
    });
    
    console.log('✅ [DEBUG] TICs filtrados para Atemperamiento:', filtered.length);
    console.log('📋 [DEBUG] Lista de TICs en atemperamiento:', filtered.map(t => ({
      rfid: t.rfid,
      lote: t.lote,
      estado: t.estado,
      sub_estado: t.sub_estado
    })));
    
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

  // Normalizador simple para comparar IDs/RFIDs entre navegadores (sin acentos, case-insensitive)
  const norm = (s: string | null | undefined) => (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  // RFIDs por sección para filtrar timers a lo que está visible en pantalla
  const rfidsCongelamientoSet = useMemo(() => new Set(ticsCongelamiento.map(t => norm(t.rfid))), [ticsCongelamiento]);
  const rfidsAtemperamientoSet = useMemo(() => new Set(ticsAtemperamiento.map(t => norm(t.rfid))), [ticsAtemperamiento]);

  const timersCongelamientoCompletadosEnSeccion = useMemo(
    () => timers.filter((t: any) => t.completado && t.tipoOperacion === 'congelamiento' && rfidsCongelamientoSet.has(norm(t.nombre))),
    [timers, rfidsCongelamientoSet]
  );
  const timersAtemperamientoCompletadosEnSeccion = useMemo(
    () => timers.filter((t: any) => t.completado && t.tipoOperacion === 'atemperamiento' && rfidsAtemperamientoSet.has(norm(t.nombre))),
    [timers, rfidsAtemperamientoSet]
  );
  
  // Función para abrir modal de escaneo según el tipo
  const abrirModalEscaneo = (tipo: 'congelamiento' | 'atemperamiento') => {
    console.log('🎯 Abriendo modal de escaneo para:', tipo);
    setTipoEscaneoActual(tipo);
    setRfidsEscaneados([]);
    setUltimosRfidsEscaneados({}); // Limpiar historial de duplicados
    setRfidInput('');
    setMostrarModalEscaneo(true);
  };
  
  // Función para manejar el escaneo de RFID
  const manejarEscaneoRfid = () => {
    const rfidTrimmed = rfidInput.trim();
    if (!rfidTrimmed) return;
    
    // Verificar si el RFID existe en el inventario completo
    const itemEncontrado = operaciones.inventarioCompleto.find(item => 
      item.rfid === rfidTrimmed || item.nombre_unidad === rfidTrimmed
    );

  if (!itemEncontrado) {
      console.log(`❌ RFID ${rfidTrimmed} no encontrado en el inventario`);
      alert(`❌ RFID ${rfidTrimmed} no encontrado en el inventario`);
      setRfidInput('');
      return;
    }
    
    // Validar que el item sea específicamente un TIC
    if (itemEncontrado.categoria !== 'TIC') {
      console.warn(`⚠️ RFID ${rfidTrimmed} no es un TIC (categoría: ${itemEncontrado.categoria}). Solo se permiten TICs en pre-acondicionamiento.`);
      alert(`⚠️ El item ${rfidTrimmed} no es un TIC (categoría: ${itemEncontrado.categoria}). En pre-acondicionamiento solo se permiten TICs.`);
      setRfidInput('');
      return;
    }

    // Si el modal actual es para Atemperamiento, validar que viene de Congelación
    if (tipoEscaneoActual === 'atemperamiento') {
      const estadoLower = String(itemEncontrado.estado || '').toLowerCase();
      const subLower = String(itemEncontrado.sub_estado || '').toLowerCase();
  const estadoOk = estadoLower === 'pre-acondicionamiento' || estadoLower === 'preacondicionamiento' || estadoLower.replace(/-/g,'') === 'pre acondicionamiento';
      const vieneDeCongelacion = subLower.includes('congel');
      if (!(estadoOk && vieneDeCongelacion)) {
        alert('⚠️ Solo pueden agregarse a Atemperamiento las TICs que vienen de Congelación.');
        setRfidInput('');
        return;
      }
    }
    
    // Verificar si ya está en la lista
    if (!rfidsEscaneados.includes(rfidTrimmed)) {
      setRfidsEscaneados([...rfidsEscaneados, rfidTrimmed]);
      console.log(`✅ TIC ${rfidTrimmed} agregado manualmente`);
    } else {
      console.log(`ℹ️ TIC ${rfidTrimmed} ya está en la lista`);
    }
    
    setRfidInput('');
  };
  
  // Función para confirmar la adición de TICs
  const confirmarAdicion = async (rfids: string[], subEstado?: string): Promise<boolean> => {
    if (rfids.length === 0) return false;
    
  // Verificar si algún TIC tiene cronómetro activo
    const ticsConTimerActivo = rfids.filter(rfid => tieneTimerActivo(rfid));
    
    if (ticsConTimerActivo.length > 0) {
      const mensaje = ticsConTimerActivo.length === 1 
  ? `El TIC ${ticsConTimerActivo[0]} aún tiene un cronómetro activo. ¿Estás seguro de que quieres cambiar su estado antes de que termine el tiempo?`
  : `${ticsConTimerActivo.length} TICs aún tienen cronómetros activos: ${ticsConTimerActivo.join(', ')}. ¿Estás seguro de que quieres cambiar su estado antes de que termine el tiempo?`;
      
      const confirmar = window.confirm(mensaje);
      
      if (!confirmar) {
        return false; // Cancelar el cambio
      }
      
  // Si el usuario confirma, eliminar los cronómetros activos
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
    setUltimosRfidsEscaneados({}); // Limpiar historial de duplicados
    
  // Guardar los RFIDs y abrir modal de cronómetro
    setRfidsPendientesTimer(rfids);
    setTipoOperacionTimer(tipoEscaneoActual);
    setMostrarModalTimer(true);
    
    return true;
  };
  
  // Función para confirmar con cronómetro
  const confirmarConTemporizador = async (tiempoMinutos: number): Promise<void> => {
    setCargandoTemporizador(true);

    // Copias locales antes de limpiar estado
    const rfidsSeleccionados = [...rfidsPendientesTimer];
    const tipoSeleccionado = tipoOperacionTimer;
    const subEstadoFinal = tipoSeleccionado === 'congelamiento' ? 'Congelación' : 'Atemperamiento';

    // 1) Cerrar modal y limpiar estados primero (para respuesta inmediata)
    setMostrarModalTimer(false);
    setRfidsPendientesTimer([]);
    setRfidSeleccionado('');

    try {
      // 2) Iniciar timers usando el nuevo contexto simplificado
      if (rfidsSeleccionados.length === 1) {
        iniciarTimer(rfidsSeleccionados[0], tipoSeleccionado, tiempoMinutos);
      } else {
        iniciarTimers(rfidsSeleccionados, tipoSeleccionado, tiempoMinutos);
      }

      // 3) Actualizar estados en el backend en paralelo
      const itemsInventario = operaciones.inventarioCompleto.filter((item: any) => 
        rfidsSeleccionados.includes(item.rfid)
      );
      
      if (itemsInventario.length > 0) {
        try {
          await apiServiceClient.post('/inventory/iniciar-timers-masivo', {
            items_ids: itemsInventario.map((i: any) => i.id).filter(Boolean),
            tipoOperacion: tipoSeleccionado,
            tiempoMinutos
          });
        } catch (e) {
          console.warn('⚠️ Error al guardar timers en servidor:', e);
        }
      }

      setCargandoTemporizador(false);

      // 4) Asignar lote en segundo plano
      setTimeout(async () => {
        try {
          const response = await apiServiceClient.patch('/inventory/inventario/asignar-lote-automatico', {
            rfids: rfidsSeleccionados,
            estado: 'Pre-acondicionamiento',
            sub_estado: subEstadoFinal
          });

          const itemsActualizados = response?.data?.items_actualizados ?? 0;
          const loteGenerado = response?.data?.lote_generado ?? '';

          console.log(`✅ Lote asignado: ${loteGenerado} • Items actualizados: ${itemsActualizados}`);
          await cargarDatos();
        } catch (e) {
          console.warn('⚠️ Error en asignación de lote:', e);
        }
      }, 100);

    } catch (err) {
      console.error('❌ Error al iniciar timers:', err);
      setCargandoTemporizador(false);
    }
  };
  
  // Función para eliminar un TIC de la lista de escaneados
  const eliminarRfidEscaneado = (rfid: string) => {
    setRfidsEscaneados(rfidsEscaneados.filter((r: string) => r !== rfid));
  };
  
  // Función para obtener el temporizador de un TIC específico
  const obtenerTemporizadorTIC = (rfid: string) => {
  const n = norm(rfid);
  const timer = timers.find((timer: any) => norm(timer.nombre) === n && !timer.completado);
    return timer;
  };

  // Helpers para filtrar timers por tipo
  const obtenerTimerActivoPorTipo = (rfid: string, tipo: 'congelamiento' | 'atemperamiento') => {
    const n = norm(rfid);
    return timers.find((t: any) => norm(t.nombre) === n && !t.completado && t.tipoOperacion === tipo);
  };
  const obtenerTimerCompletadoPorTipo = (rfid: string, tipo: 'congelamiento' | 'atemperamiento') => {
    const n = norm(rfid);
    return timers.find((t: any) => norm(t.nombre) === n && t.completado && t.tipoOperacion === tipo);
  };

  // Función para verificar si un TIC tiene temporizador activo
  const tieneTimerActivo = (rfid: string): boolean => {
    const timer = obtenerTemporizadorTIC(rfid);
    return timer ? timer.activo && !timer.completado : false;
  };

  // Función para completar un TIC y moverlo al siguiente estado
  const completarTIC = async (
    rfid: string,
    timerCompletado: any | null,
    tipoSeccion?: 'congelamiento' | 'atemperamiento'
  ) => {
    try {
      // Determinar el siguiente estado basado en el tipo de operación
      const tipoOp: 'congelamiento' | 'atemperamiento' = timerCompletado?.tipoOperacion || (tipoSeccion as any) || 'congelamiento';
      let siguienteEstado = '';
      let siguienteSubEstado = '';
      let tiempoNuevo = 0; // Tiempo en minutos para el nuevo estado
      
      if (tipoOp === 'congelamiento') {
        // Congelamiento completado → va a Atemperamiento (sin timer por defecto)
        siguienteEstado = 'Pre-acondicionamiento';
        siguienteSubEstado = 'Atemperamiento';
        tiempoNuevo = 0; // No crear timer automáticamente
      } else if (tipoOp === 'atemperamiento') {
  // Atemperamiento completado → va a Acondicionamiento (ensamblaje)
  siguienteEstado = 'Acondicionamiento';
  siguienteSubEstado = 'Ensamblaje';
  tiempoNuevo = 0; // Sin timer aquí
      }

      console.log(`🔄 Completando TIC ${rfid} - Moviendo a ${siguienteEstado} / ${siguienteSubEstado} con tiempo: ${tiempoNuevo} min`);

      // Confirmar con el usuario
  const mensajeConfirmacion = tipoOp === 'congelamiento' 
        ? `¿Completar el proceso de congelamiento para el TIC ${rfid}?\n\nEsto moverá el TIC a: Atemperamiento (${tiempoNuevo} minutos)`
        : `¿Completar el proceso de atemperamiento para el TIC ${rfid}?\n\nEsto moverá el TIC a: Acondicionamiento`;
      
      const confirmar = window.confirm(mensajeConfirmacion);

      if (!confirmar) return;

      console.log(`🔄 [DEBUG] Iniciando completarTIC para RFID: ${rfid}`);
      console.log(`📋 [DEBUG] Timer completado:`, timerCompletado);
      console.log(`🎯 [DEBUG] Siguiente estado: ${siguienteEstado} / ${siguienteSubEstado}`);

      // Mover el TIC al siguiente estado
      let resultado: any = false;
  if (tipoOp === 'congelamiento') {
        // Pasar a Atemperamiento dentro de Pre-acondicionamiento
        console.log(`🚀 [DEBUG] Llamando confirmarPreAcondicionamiento con:`, [rfid], siguienteSubEstado);
        resultado = await operaciones.confirmarPreAcondicionamiento([rfid], siguienteSubEstado);
      } else {
        // Pasar a Acondicionamiento usando el hook dedicado
        console.log(`🚀 [DEBUG] Llamando moverTicAAcondicionamiento para:`, rfid);
        resultado = await operaciones.moverTicAAcondicionamiento(rfid);
      }
      console.log(`📊 [DEBUG] Resultado de confirmarPreAcondicionamiento:`, resultado);
      
      if (resultado || resultado !== false) {
        console.log(`✅ [DEBUG] Actualización exitosa`);
        // Eliminar el timer completado tras actualizar estado
        if (timerCompletado?.id) {
          eliminarTimer(timerCompletado.id);
          console.log(`❌ [DEBUG] Timer eliminado: ${timerCompletado.id}`);
        } else {
          console.log('ℹ️ [DEBUG] No hay timer persistente que eliminar (completado reciente/fallback)');
        }
        
  // No crear timer automáticamente al pasar a atemperamiento
  console.log(`ℹ️ [DEBUG] No se crea timer automáticamente para el nuevo estado`);
        
        // Recargar datos
        console.log(`🔄 [DEBUG] Recargando datos...`);
        await cargarDatos();
        console.log(`✅ [DEBUG] Datos recargados`);
        
  const mensajeExito = tipoOp === 'congelamiento'
          ? `✅ TIC ${rfid} completado y movido a Atemperamiento sin timer`
          : `✅ TIC ${rfid} completado y movido a Acondicionamiento`;
        
        alert(mensajeExito);
        
        console.log(`✅ [DEBUG] TIC ${rfid} completado exitosamente`);
      } else {
        console.error(`❌ [DEBUG] Error en resultado de confirmarPreAcondicionamiento:`, resultado);
        throw new Error('Error al actualizar el estado del TIC');
      }
    } catch (error) {
      console.error('❌ Error al completar TIC:', error);
      alert(`Error al completar el TIC ${rfid}: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  };

  // Completar todas las TICs con timer completado en Congelamiento → Atemperamiento (sin nuevo timer por defecto)
  const completarTodasCongelamiento = async () => {
    try {
      const timersCongelamiento = timersCongelamientoCompletadosEnSeccion;
      if (timersCongelamiento.length === 0) {
        alert('No hay TICs con congelamiento completado.');
        return;
      }
      const rfids = timersCongelamiento.map((t: any) => t.nombre);
      const confirmar = window.confirm(`Completar ${timersCongelamiento.length} TIC(s) en congelamiento y mover a Atemperamiento (sin crear timer automáticamente)?`);
      if (!confirmar) return;

      // Actualizar estado primero en lote
      const ok = await operaciones.confirmarPreAcondicionamiento(rfids, 'Atemperamiento');
      if (!ok && ok !== undefined) {
        throw new Error('No se pudieron actualizar los estados.');
      }

      // Eliminar timers completados
      for (const t of timersCongelamiento) {
        eliminarTimer(t.id);
      }

      await cargarDatos();
      alert(`✅ ${timersCongelamiento.length} TIC(s) movidas a Atemperamiento`);
    } catch (e: any) {
      console.error('Error al completar todas (congelamiento):', e);
      alert(`❌ Error al completar todas: ${e.message || e}`);
    }
  };

  // Completar todas las TICs con timer completado en Atemperamiento → Acondicionamiento
  const completarTodasAtemperamiento = async () => {
    try {
      const timersAtemp = timersAtemperamientoCompletadosEnSeccion;
      if (timersAtemp.length === 0) {
        alert('No hay TICs con atemperamiento completado.');
        return;
      }
      const confirmar = window.confirm(`Completar ${timersAtemp.length} TIC(s) en atemperamiento y mover a Acondicionamiento?`);
      if (!confirmar) return;

      // Mover cada TIC a Acondicionamiento
      for (const t of timersAtemp) {
        await operaciones.moverTicAAcondicionamiento(t.nombre);
        eliminarTimer(t.id);
      }

      await cargarDatos();
      alert(`✅ ${timersAtemp.length} TIC(s) movidas a Acondicionamiento`);
    } catch (e: any) {
      console.error('Error al completar todas (atemperamiento):', e);
      alert(`❌ Error al completar todas: ${e.message || e}`);
    }
  };

  // Estado para prevenir clics múltiples en botones de limpiar
  const [botonesLimpiandoSet, setBotonesLimpiandoSet] = useState<Set<string>>(new Set());

  // Función para limpiar timer con debounce (OPTIMIZADA)
  const limpiarTimerConDebounce = useCallback(async (timerId: string, rfid: string) => {
    // Prevenir múltiples clics usando ref para verificar estado actual
    setBotonesLimpiandoSet(prev => {
      if (prev.has(timerId)) {
        console.log(`⚠️ Timer ${timerId} ya está siendo limpiado, ignorando clic múltiple`);
        return prev; // No cambiar el estado
      }
      
      // Marcar como "limpiando" inmediatamente
      console.log(`🧹 Limpiando timer individual: ${timerId} - ${rfid}`);
      
      // Iniciar proceso de eliminación en el siguiente tick
      setTimeout(async () => {
        try {
          eliminarTimer(timerId);
          console.log('✅ Timer limpiado exitosamente');
          
          // Limpiar estado después de un breve delay
          setTimeout(() => {
            setBotonesLimpiandoSet(current => {
              const nuevo = new Set(current);
              nuevo.delete(timerId);
              return nuevo;
            });
          }, 500); // Reducido de 1000ms a 500ms
          
        } catch (error) {
          console.error('❌ Error al limpiar timer:', error);
          // Limpiar estado en caso de error
          setBotonesLimpiandoSet(current => {
            const nuevo = new Set(current);
            nuevo.delete(timerId);
            return nuevo;
          });
        }
      }, 0);
      
      // Agregar al set inmediatamente para prevenir clics múltiples
      return new Set(prev).add(timerId);
    });
  }, [eliminarTimer]); // Solo depende de eliminarTimer

  // Limpiar timers completados por tipo
  const limpiarTimersCompletadosPorTipo = async (tipo: 'congelamiento' | 'atemperamiento', onlyIds?: string[]) => {
    try {
      let aLimpiar = timers.filter((t: any) => t.completado && t.tipoOperacion === tipo);
      if (onlyIds && onlyIds.length > 0) {
        const ids = new Set(onlyIds);
        aLimpiar = aLimpiar.filter((t: any) => ids.has(t.id));
      }
      if (aLimpiar.length === 0) {
        alert(`No hay cronómetros completados de ${tipo}.`);
        return;
      }
      const confirmar = window.confirm(`¿Limpiar ${aLimpiar.length} cronómetro(s) completado(s) de ${tipo}?`);
      if (!confirmar) return;
      for (const t of aLimpiar) {
        eliminarTimer(t.id);
        await new Promise(r => setTimeout(r, 80));
      }
    } catch (e) {
      console.error('Error limpiando timers por tipo:', e);
      alert('Error al limpiar cronómetros.');
    }
  };
  
  // Función para renderizar el temporizador de un TIC
  const renderizarTemporizador = (rfid: string, esAtemperamiento: boolean = false) => {
    // Si está arrancando por lote, mostrar placeholder uniforme
    if (isStartingBatchFor && isStartingBatchFor(rfid)) {
      return (
        <div className="flex flex-col items-center space-y-1 py-1 max-w-20">
          <span className="font-mono text-xs text-gray-500">--:--</span>
          <span className="text-[10px] text-gray-400">Iniciando…</span>
        </div>
      );
    }
    // Usar el timer del tipo de la sección; evita arrastrar timers de otra fase
    const timer = esAtemperamiento
      ? obtenerTimerActivoPorTipo(rfid, 'atemperamiento')
      : obtenerTimerActivoPorTipo(rfid, 'congelamiento');

    // Timer completado del tipo de la sección
    const timerCompletado = esAtemperamiento
      ? obtenerTimerCompletadoPorTipo(rfid, 'atemperamiento')
      : obtenerTimerCompletadoPorTipo(rfid, 'congelamiento');

    const tipoSeccion = esAtemperamiento ? 'atemperamiento' : 'congelamiento';

    // Si el timer activo llegó a 0s, tratar como completado inmediato
    const ceroAlcanzado = timer && ((timer.tiempoRestanteSegundos ?? 0) <= 0);

    if (timerCompletado || ceroAlcanzado) {
      const minutos = timerCompletado
        ? timerCompletado.tiempoInicialMinutos
        : (timer ? timer.tiempoInicialMinutos : 0);
      // Timer completado - mostrar estado completado
      return (
        <div className="flex flex-col items-center space-y-1 py-1 max-w-24">
          <span className="text-green-600 text-xs font-medium flex items-center gap-1">
            <CheckCircle className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">Completo</span>
          </span>
          <div className="text-xs text-gray-500 text-center truncate">
            {minutos}min
          </div>
          <div className="flex gap-1">
            {/* Permitir completar también con cero alcanzado en Congelación */}
            {!esAtemperamiento && (timerCompletado || ceroAlcanzado) && (
              <button
                onClick={() => completarTIC(rfid, timerCompletado ?? null, tipoSeccion)}
                className="p-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-xs transition-colors"
                title="Completar"
              >
                <CheckCircle className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                const confirmar = window.confirm(`¿Limpiar el cronómetro completado de ${rfid}?`);
                if (confirmar) {
                  if (timerCompletado) {
                    limpiarTimerConDebounce(timerCompletado.id, rfid);
                  }
                }
              }}
              disabled={timerCompletado ? botonesLimpiandoSet.has(timerCompletado.id) : false}
              className={`p-1.5 rounded text-xs transition-colors ${
                timerCompletado && botonesLimpiandoSet.has(timerCompletado.id) 
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
              }`}
              title={timerCompletado && botonesLimpiandoSet.has(timerCompletado.id) ? "Limpiando..." : "Limpiar"}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      );
    }

    if (!timer) {
      // Sin cronómetro - mostrar botón para iniciar
      return (
        <div className="flex flex-col items-center space-y-1 py-1 max-w-20">
          <span className="text-gray-400 text-xs text-center">Sin cronómetro</span>
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
            className="flex items-center justify-center p-1.5 bg-green-100 hover:bg-green-200 text-green-700 rounded text-xs transition-colors"
            title="Iniciar cronómetro"
          >
            <Play className="w-3 h-3" />
          </button>
        </div>
      );
    }

    // Mostrar tiempo directamente desde el contexto (sin countdown local)
    const tiempoFormateado = formatearTiempo(timer.tiempoRestanteSegundos);
    const esUrgente = timer.tiempoRestanteSegundos < 300; // Menos de 5 minutos
    
    return (
      <div className="flex flex-col items-center space-y-1 py-1 max-w-20">
        <div className="flex items-center justify-center">
          <span
            className={`font-mono text-xs font-medium truncate ${
              esUrgente ? 'text-red-600' :
              timer.tipoOperacion === 'congelamiento' ? 'text-blue-600' : 'text-orange-600'
            }`}
            key={`timer-${timer.id}-${timer.tiempoRestanteSegundos}`}
          >
            {tiempoFormateado}
          </span>
        </div>
        {!timer.activo && (
          <span className="text-xs text-gray-500">Pausado</span>
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={() => timer.activo ? pausarTimer(timer.id) : reanudarTimer(timer.id)}
            className={`p-1.5 rounded text-xs transition-colors ${
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
              const timerActual = timer;
              if (timerActual) {
                setTipoOperacionTimer(timerActual.tipoOperacion);
              }
              setMostrarModalTimer(true);
            }}
            className="p-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-xs transition-colors"
            title="Editar"
          >
            <Edit className="w-3 h-3" />
          </button>
          <button
            onClick={() => eliminarTimer(timer.id)}
            className="p-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs transition-colors"
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
    <div className="p-2 sm:p-4 max-w-full">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Registrar Pre Acondicionamiento</h1>
  <WebSocketStatus isConnected={isConnected} className="mt-1" />
      </div>
      
  {/* Se removió el banner global de limpiar; ahora se limpia por sección */}
      
      {/* Sección de TICs para Congelamiento */}
      <div className="bg-white rounded-lg shadow-md mb-6 sm:mb-8 overflow-hidden">
        <div className="bg-blue-50 p-3 sm:p-4 border-b border-blue-100">
          <div className="flex flex-col gap-3">
            {/* Título */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-blue-800">
                  TICs para Congelamiento 
                </h2>
                <span className="text-sm font-normal text-blue-600">
                  ({ticsCongelamientoFiltrados.length} de {ticsCongelamiento.length})
                </span>
              </div>
            </div>
            
            {/* Botones */}
            <div className="flex flex-col sm:flex-row gap-2">
              {/* Botón para iniciar temporizadores de todos los TICs sin temporizador */}
              {ticsCongelamiento.filter(tic => !obtenerTimerActivoPorTipo(tic.rfid, 'congelamiento')).length > 0 && (
                <button
                  onClick={() => {
                    const ticsSinTimer = ticsCongelamiento.filter(tic => !obtenerTimerActivoPorTipo(tic.rfid, 'congelamiento'));
                    setRfidsPendientesTimer(ticsSinTimer.map(tic => tic.rfid));
                    setTipoOperacionTimer('congelamiento');
                    setMostrarModalTimer(true);
                  }}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm transition-colors"
                  title="Iniciar cronómetro para todos los TICs sin cronómetro"
                >
                  <Play size={16} />
                  Iniciar Todos ({ticsCongelamiento.filter(tic => !obtenerTimerActivoPorTipo(tic.rfid, 'congelamiento')).length})
                </button>
              )}
              {/* Limpiar timers completados de congelación */}
              {timersCongelamientoCompletadosEnSeccion.length > 0 && (
                <button
                  onClick={() => limpiarTimersCompletadosPorTipo('congelamiento', timersCongelamientoCompletadosEnSeccion.map((t: any) => t.id))}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-md text-sm transition-colors"
                  title="Limpiar cronómetros completados de congelación"
                >
                  <X size={16} />
                  Limpiar (Congelación)
                </button>
              )}
              {/* Completar todas: Congelamiento → Atemperamiento */}
              {timersCongelamientoCompletadosEnSeccion.length > 0 && (
                <button
                  onClick={completarTodasCongelamiento}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm transition-colors"
                  title="Completar todos los TICs con cronómetro de congelamiento completado"
                >
                  <CheckCircle size={16} />
                  Completar todas (Congelación)
                </button>
              )}
              
              <div className="flex gap-2">
                <button 
                  className={`p-2 rounded-md transition-colors ${
                    cargando 
                      ? 'bg-blue-100 text-blue-400 cursor-not-allowed' 
                      : 'hover:bg-blue-100 text-blue-600'
                  }`}
                  title="Actualizar lista"
                  onClick={cargarDatos}
                  disabled={cargando}
                >
                  <Loader size={16} className={cargando ? 'animate-spin' : ''} />
                </button>
                
                <div className="relative" ref={dropdownRefCongelacion}>
                  <button 
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-md flex items-center gap-2 justify-center text-sm min-w-0"
                    onClick={() => setShowDropdownCongelacion(!showDropdownCongelacion)}
                  >
                    <Plus size={16} />
                    <span>Agregar TICs</span>
                    <ChevronDown size={16} />
                  </button>
                  
                  {showDropdownCongelacion && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200">
                      <div className="py-1">
                        <button
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                          onClick={() => {
                            setRfidsEscaneados([]);
                            setUltimosRfidsEscaneados({}); // Limpiar historial de duplicados
                            setRfidInput('');
                            abrirModalEscaneo('congelamiento');
                            setShowDropdownCongelacion(false);
                          }}
                        >
                          <Scan size={16} />
                          Escanear TICs
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Barra de búsqueda */}
        <div className="p-3 sm:p-4 bg-gray-50 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Buscar por RFID, nombre o lote..."
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={busquedaCongelamiento}
              onChange={(e) => {
                setBusquedaCongelamiento(e.target.value);
                setPaginaActualCongelamiento(1); // Resetear a la primera página al buscar
              }}
              maxLength={24}
            />
          </div>
        </div>
        
        {/* Lista móvil (cards) */}
        <div className="sm:hidden p-3 pt-0">
          {cargando ? (
            <div className="py-6 text-center text-gray-500 text-xs">Cargando…</div>
          ) : (
            ticsCongelamientoPaginados.length > 0 ? (
              ticsCongelamientoPaginados.map((tic: TicItem) => (
                <div key={tic.id} className="bg-white border rounded-md p-3 mb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-gray-900 truncate" title={tic.rfid}>{tic.rfid}</div>
                      <div className="text-[11px] text-gray-700 truncate" title={tic.nombre_unidad}>{tic.nombre_unidad}</div>
                      <div className="text-[11px] text-gray-500">Lote: <span className="font-medium">{tic.lote || '-'}</span></div>
                    </div>
                    <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800">
                      {tic.sub_estado}
                    </span>
                  </div>
                  <div className="mt-2">
                    {renderizarTemporizador(tic.rfid)}
                  </div>
                </div>
              ))
            ) : (
              busquedaCongelamiento ? (
                <div className="px-3 py-4 text-center text-gray-500 text-xs">No se encontraron TICs</div>
              ) : (
                <div className="px-3 py-4 text-center text-gray-500 text-xs">No hay TICs en congelamiento</div>
              )
            )
          )}
        </div>

        {/* Tabla responsiva con scroll horizontal (solo >= sm) */}
        <div className="hidden sm:block overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
          <div className="min-w-[720px]">
            <table className="w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <div>RFID</div>
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <div>NOMBRE</div>
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <div>LOTE</div>
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <div>ESTADO</div>
                  </th>
                  <th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <div>CRONÓMETRO</div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {cargando ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <Loader className="animate-spin h-4 w-4 text-blue-600" />
                        <span className="text-xs text-gray-500">Cargando...</span>
                      </div>
                    </td>
                  </tr>
                ) : ticsCongelamientoPaginados.length > 0 ? (
                  ticsCongelamientoPaginados.map((tic: TicItem) => (
                    <tr key={tic.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-xs font-medium text-gray-900">
                        <div title={tic.rfid}>{tic.rfid}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-900">
                        <div title={tic.nombre_unidad}>{tic.nombre_unidad}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-900">
                        <div title={tic.lote}>{tic.lote}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {tic.sub_estado}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex justify-center">
                          {renderizarTemporizador(tic.rfid)}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : busquedaCongelamiento ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center">
                      <div className="text-gray-500">
                        <Search className="mx-auto h-6 w-6 mb-2 text-gray-400" />
                        <p className="text-xs">No se encontraron TICs</p>
                        <button 
                          onClick={() => setBusquedaCongelamiento('')}
                          className="mt-2 px-2 py-1 text-blue-600 hover:text-blue-700 text-xs hover:bg-blue-50 rounded transition-colors"
                        >
                          Limpiar búsqueda
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center">
                      <div className="text-gray-500">
                        <p className="text-xs">No hay TICs en congelamiento</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Controles de paginación */}
        {ticsCongelamientoFiltrados.length > itemsPorPagina && (
          <div className="px-3 py-2 bg-gray-50 border-t border-gray-200">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="text-xs text-gray-700 text-center sm:text-left">
                {((paginaActualCongelamiento - 1) * itemsPorPagina) + 1}-{Math.min(paginaActualCongelamiento * itemsPorPagina, ticsCongelamientoFiltrados.length)} de {ticsCongelamientoFiltrados.length}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPaginaActualCongelamiento(paginaActualCongelamiento - 1)}
                  disabled={paginaActualCongelamiento === 1}
                  className="px-2 py-1.5 text-xs rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ‹
                </button>
                <span className="text-xs text-gray-600 px-2">
                  {paginaActualCongelamiento}/{totalPaginasCongelamiento}
                </span>
                <button
                  onClick={() => setPaginaActualCongelamiento(paginaActualCongelamiento + 1)}
                  disabled={paginaActualCongelamiento === totalPaginasCongelamiento}
                  className="px-2 py-1.5 text-xs rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ›
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Sección de TICs para Atemperamiento */}
      <div className="bg-white rounded-lg shadow-md mb-6 sm:mb-8 overflow-hidden">
        <div className="bg-orange-50 p-3 sm:p-4 border-b border-orange-100">
          <div className="flex flex-col gap-3">
            {/* Título */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-orange-800">
                  TICs para Atemperamiento
                </h2>
                <span className="text-sm font-normal text-orange-600">
                  ({ticsAtemperamientoFiltrados.length} de {ticsAtemperamiento.length})
                </span>
              </div>
            </div>
            
            {/* Botones */}
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              {/* Botón para iniciar temporizadores de todos los TICs sin temporizador */}
              {ticsAtemperamiento.filter(tic => !obtenerTimerActivoPorTipo(tic.rfid, 'atemperamiento')).length > 0 && (
                <button
                  onClick={() => {
                    const ticsSinTimer = ticsAtemperamiento.filter(tic => !obtenerTimerActivoPorTipo(tic.rfid, 'atemperamiento'));
                    setRfidsPendientesTimer(ticsSinTimer.map(tic => tic.rfid));
                    setTipoOperacionTimer('atemperamiento');
                    setMostrarModalTimer(true);
                  }}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-md text-sm transition-colors"
                  title="Iniciar cronómetro para todos los TICs sin cronómetro"
                >
                  <Play size={16} />
                  Iniciar Todos ({ticsAtemperamiento.filter(tic => !obtenerTimerActivoPorTipo(tic.rfid, 'atemperamiento')).length})
                </button>
              )}
              {/* Limpiar timers completados de atemperamiento */}
              {timersAtemperamientoCompletadosEnSeccion.length > 0 && (
                <button
                  onClick={() => limpiarTimersCompletadosPorTipo('atemperamiento', timersAtemperamientoCompletadosEnSeccion.map((t: any) => t.id))}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-md text-sm transition-colors"
                  title="Limpiar cronómetros completados de atemperamiento"
                >
                  <X size={16} />
                  Limpiar (Atemperamiento)
                </button>
              )}
              {/* Completar todas: Atemperamiento → Acondicionamiento */}
              {timersAtemperamientoCompletadosEnSeccion.length > 0 && (
                <button
                  onClick={completarTodasAtemperamiento}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-md text-sm transition-colors"
                  title="Completar todos los TICs con cronómetro de atemperamiento completado"
                >
                  <CheckCircle size={16} />
                  Completar todas (Atemperamiento)
                </button>
              )}
              
              <div className="flex gap-2 items-center">
                <button 
                  className={`p-2 rounded-md transition-colors ${
                    cargando 
                      ? 'bg-orange-100 text-orange-400 cursor-not-allowed' 
                      : 'hover:bg-orange-100 text-orange-600'
                  }`}
                  title="Actualizar lista"
                  onClick={cargarDatos}
                  disabled={cargando}
                >
                  <Loader size={16} className={cargando ? 'animate-spin' : ''} />
                </button>
                
                <div className="relative" ref={dropdownRefAtemperamiento}>
                  <button 
                    className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded-md flex items-center gap-2 justify-center text-sm min-w-0"
                    onClick={() => setShowDropdownAtemperamiento(!showDropdownAtemperamiento)}
                  >
                    <Plus size={16} />
                    <span>Agregar TICs</span>
                    <ChevronDown size={16} />
                  </button>
                  
                  {showDropdownAtemperamiento && (
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg z-10 border border-gray-200 overflow-hidden">
                      <div className="py-1 divide-y divide-gray-100">
                        <button
                          className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          onClick={() => {
                            setRfidsEscaneados([]);
                            setUltimosRfidsEscaneados({}); // Limpiar historial de duplicados
                            setRfidInput('');
                            abrirModalEscaneo('atemperamiento');
                            setShowDropdownAtemperamiento(false);
                          }}
                        >
                          <Scan size={16} />
                          Escanear TICs
                        </button>
                        <button
                          className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
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
          </div>
        </div>
        
        {/* Barra de búsqueda */}
        <div className="p-3 sm:p-4 bg-gray-50 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Buscar por RFID, nombre o lote..."
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              value={busquedaAtemperamiento}
              onChange={(e) => {
                setBusquedaAtemperamiento(e.target.value);
                setPaginaActualAtemperamiento(1); // Resetear a la primera página al buscar
              }}
              maxLength={24}
            />
          </div>
        </div>
        
        {/* Lista móvil (cards) */}
        <div className="sm:hidden p-3 pt-0">
          {cargando ? (
            <div className="py-6 text-center text-gray-500 text-xs">Cargando…</div>
          ) : (
            ticsAtemperamientoPaginados.length > 0 ? (
              ticsAtemperamientoPaginados.map((tic: TicItem) => (
                <div key={tic.id} className="bg-white border rounded-md p-3 mb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-gray-900 truncate" title={tic.rfid}>{tic.rfid}</div>
                      <div className="text-[11px] text-gray-700 truncate" title={tic.nombre_unidad}>{tic.nombre_unidad}</div>
                      <div className="text-[11px] text-gray-500">Lote: <span className="font-medium">{tic.lote || '-'}</span></div>
                    </div>
                    <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-800">
                      {tic.sub_estado}
                    </span>
                  </div>
                  <div className="mt-2">
                    {renderizarTemporizador(tic.rfid, true)}
                  </div>
                </div>
              ))
            ) : (
              busquedaAtemperamiento ? (
                <div className="px-3 py-4 text-center text-gray-500 text-xs">No se encontraron TICs</div>
              ) : (
                <div className="px-3 py-4 text-center text-gray-500 text-xs">No hay TICs en atemperamiento</div>
              )
            )
          )}
        </div>

        {/* Tabla responsiva con scroll horizontal (solo >= sm) */}
        <div className="hidden sm:block overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
          <div className="min-w-[720px]">
            <table className="w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <div>RFID</div>
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <div>NOMBRE</div>
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <div>LOTE</div>
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <div>ESTADO</div>
                  </th>
                  <th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <div>CRONÓMETRO</div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {cargando ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <Loader className="animate-spin h-4 w-4 text-orange-600" />
                        <span className="text-xs text-gray-500">Cargando...</span>
                      </div>
                    </td>
                  </tr>
                ) : ticsAtemperamientoPaginados.length > 0 ? (
                  ticsAtemperamientoPaginados.map((tic: TicItem) => (
                    <tr key={tic.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-xs font-medium text-gray-900">
                        <div title={tic.rfid}>{tic.rfid}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-900">
                        <div title={tic.nombre_unidad}>{tic.nombre_unidad}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-900">
                        <div title={tic.lote}>{tic.lote}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                          {tic.sub_estado}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex justify-center">
                          {renderizarTemporizador(tic.rfid, true)}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : busquedaAtemperamiento ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center">
                      <div className="text-gray-500">
                        <Search className="mx-auto h-6 w-6 mb-2 text-gray-400" />
                        <p className="text-xs">No se encontraron TICs</p>
                        <button 
                          onClick={() => setBusquedaAtemperamiento('')}
                          className="mt-2 px-2 py-1 text-orange-600 hover:text-orange-700 text-xs hover:bg-orange-50 rounded transition-colors"
                        >
                          Limpiar búsqueda
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center">
                      <div className="text-gray-500">
                        <p className="text-xs">No hay TICs en atemperamiento</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Controles de paginación */}
        {ticsAtemperamientoFiltrados.length > itemsPorPagina && (
          <div className="px-3 py-2 bg-gray-50 border-t border-gray-200">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="text-xs text-gray-700 text-center sm:text-left">
                {((paginaActualAtemperamiento - 1) * itemsPorPagina) + 1}-{Math.min(paginaActualAtemperamiento * itemsPorPagina, ticsAtemperamientoFiltrados.length)} de {ticsAtemperamientoFiltrados.length}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPaginaActualAtemperamiento(paginaActualAtemperamiento - 1)}
                  disabled={paginaActualAtemperamiento === 1}
                  className="px-2 py-1.5 text-xs rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ‹
                </button>
                <span className="text-xs text-gray-600 px-2">
                  {paginaActualAtemperamiento}/{totalPaginasAtemperamiento}
                </span>
                <button
                  onClick={() => setPaginaActualAtemperamiento(paginaActualAtemperamiento + 1)}
                  disabled={paginaActualAtemperamiento === totalPaginasAtemperamiento}
                  className="px-2 py-1.5 text-xs rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ›
                </button>
              </div>
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
          setUltimosRfidsEscaneados({}); // Limpiar historial de duplicados
          setRfidInput('');
        }}
        titulo={`Escanear TICs para ${tipoEscaneoActual === 'congelamiento' ? 'Congelamiento' : 'Atemperamiento'}`}
        descripcion={
          tipoEscaneoActual === 'atemperamiento'
            ? `⚠️ IMPORTANTE: Solo se aceptan TICs en Pre-acondicionamiento cuyo sub-estado actual sea Congelación. VIPs y CUBEs no están permitidos. Los códigos de 24 caracteres se procesan automáticamente.`
            : `⚠️ IMPORTANTE: Solo se aceptan TICs en Pre-acondicionamiento. VIPs y CUBEs no están permitidos. Los códigos de 24 caracteres se procesan automáticamente.`
        }
        onEliminarRfid={eliminarRfidEscaneado}
        subEstado={tipoEscaneoActual === 'congelamiento' ? 'Congelación' : 'Atemperamiento'}
        onProcesarRfidIndividual={procesarRfid}
      />
      
      {/* Modal para seleccionar TICs por lote */}
      <LoteSelectionModal
        mostrarModal={mostrarModalLotes}
        onCancelar={() => setMostrarModalLotes(false)}
        onSeleccionarLote={manejarSeleccionLote}
        subEstado={tipoEscaneoActual === 'congelamiento' ? 'Congelación' : 'Atemperamiento'}
      />
      
  {/* Modal de cronómetro */}
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
  titulo={`Configurar Cronómetro - ${
          tipoOperacionTimer === 'congelamiento' ? 'Congelación' : 
          tipoOperacionTimer === 'atemperamiento' ? 'Atemperamiento' : 
          tipoOperacionTimer === 'envio' ? 'Envío' : 'Inspección'
        }`}
  descripcion={`Configure el tiempo de ${
          tipoOperacionTimer === 'congelamiento' ? 'congelación' : 
          tipoOperacionTimer === 'atemperamiento' ? 'atemperamiento' : 
          tipoOperacionTimer === 'envio' ? 'envío' : 'inspección'
  } para ${rfidsPendientesTimer.length} TIC(s). Se creará un cronómetro para cada TIC.`}
        tipoOperacion={tipoOperacionTimer}
        cargando={cargandoTemporizador}
      />

    </div>
  );
};

export default PreAcondicionamientoView;
