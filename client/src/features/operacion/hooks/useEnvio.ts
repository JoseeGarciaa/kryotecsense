import { useState, useCallback, useEffect } from 'react';
import { apiServiceClient } from '../../../api/apiClient';
import { useTimerContext } from '../../../contexts/TimerContext';

export interface ItemEnvio {
  id: number;
  nombre_unidad: string;
  rfid: string;
  lote: string;
  estado: string;
  sub_estado: string;
  categoria: string;
  tiempoEnvio?: number; // en minutos
  timerId?: string;
  fechaInicioEnvio?: Date;
  fechaEstimadaLlegada?: Date;
}

export const useEnvio = (refetchInventario?: () => Promise<void>) => {
  const [itemsEnEnvio, setItemsEnEnvio] = useState<ItemEnvio[]>([]);
  const [cargandoEnvio, setCargandoEnvio] = useState(false);
  const { timers, crearTimer, eliminarTimer, formatearTiempo } = useTimerContext();

  // Cargar items en envío del localStorage al inicializar
  useEffect(() => {
    const itemsGuardados = localStorage.getItem('kryotec_items_envio');
    if (itemsGuardados) {
      try {
        const itemsParseados = JSON.parse(itemsGuardados);
        // Convertir fechas de string a Date
        const itemsConFechas = itemsParseados.map((item: any) => ({
          ...item,
          fechaInicioEnvio: item.fechaInicioEnvio ? new Date(item.fechaInicioEnvio) : undefined,
          fechaEstimadaLlegada: item.fechaEstimadaLlegada ? new Date(item.fechaEstimadaLlegada) : undefined
        }));
        setItemsEnEnvio(itemsConFechas);
        console.log('📦 Items en envío cargados desde localStorage:', itemsConFechas.length);
      } catch (error) {
        console.error('Error al cargar items en envío:', error);
      }
    }
  }, []);

  // Guardar items en envío en localStorage cuando cambien
  useEffect(() => {
    localStorage.setItem('kryotec_items_envio', JSON.stringify(itemsEnEnvio));
    console.log('💾 Items en envío guardados en localStorage:', itemsEnEnvio.length);
  }, [itemsEnEnvio]);

  /**
   * Inicia el proceso de envío para items listos desde acondicionamiento
   */
  const iniciarEnvio = useCallback(async (
    itemsSeleccionados: any[],
    tiempoEnvioMinutos?: number // si no viene, reutilizamos el del timer ya creado (96h desde Ensamblaje)
  ) => {
    setCargandoEnvio(true);
    
    try {
  console.log('🚚 ===== INICIANDO PROCESO DE ENVÍO =====');
  console.log('📦 Items seleccionados:', itemsSeleccionados.length);
  console.log('⏱️ Tiempo de operación solicitado:', tiempoEnvioMinutos, 'minutos');

      const itemsParaEnvio: ItemEnvio[] = [];
      const actualizacionesEstado = [];
      const actividadesCreadas = [];

  // Tiempo de operación: usar el proporcionado (UI) con default 96h
  const tiempoOperacionMin = tiempoEnvioMinutos ? Math.max(1, Math.floor(tiempoEnvioMinutos)) : 5760;

      for (const item of itemsSeleccionados) {
        // Reusar temporizador existente (creado desde Ensamblaje) si existe y está activo
        const normalize = (s: string) =>
          (s || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();

        const expectedName = `Envío #${item.id} - ${item.nombre_unidad}`;
        const expectedNameNorm = normalize(expectedName);
        const existingTimer = timers.find(t => {
          if (t.tipoOperacion !== 'envio' || t.completado !== false) return false;
          const n = normalize(t.nombre);
          return n === expectedNameNorm || /envio\s+#\d+\s+-/i.test(n) && n.includes(`#${item.id} -`.toLowerCase());
        });

        let timerId: string;
        let fechaInicio: Date;
        let fechaEstimada: Date;
        let minutosUsados = tiempoOperacionMin;

        if (existingTimer) {
          // Reusar existente
          timerId = existingTimer.id;
          fechaInicio = new Date(existingTimer.fechaInicio);
          fechaEstimada = new Date(existingTimer.fechaFin);
          minutosUsados = existingTimer.tiempoInicialMinutos;
  } else {
          // Crear temporizador de envío (nombre incluye ID para coincidencia fiable en Devolución)
          timerId = crearTimer(
            expectedName,
            'envio', // Tipo específico para envíos
            tiempoOperacionMin
          );
          fechaInicio = new Date();
          fechaEstimada = new Date(fechaInicio.getTime() + (tiempoOperacionMin * 60 * 1000));
        }

        // Preparar item para envío
        const itemEnvio: ItemEnvio = {
          id: item.id,
          nombre_unidad: item.nombre_unidad,
          rfid: item.rfid,
          lote: item.lote || 'Sin lote',
          estado: 'operación',
          sub_estado: 'En transito',
          categoria: item.categoria || 'credocube',
          tiempoEnvio: minutosUsados,
          timerId,
          fechaInicioEnvio: fechaInicio,
          fechaEstimadaLlegada: fechaEstimada
        };

        itemsParaEnvio.push(itemEnvio);

        // Preparar actualización de estado en backend
        actualizacionesEstado.push({
          id: item.id,
          estado: 'operación',
          sub_estado: 'En transito'
        });

        // Preparar actividad
        actividadesCreadas.push({
          inventario_id: item.id,
          usuario_id: 1,
          descripcion: `Iniciado envío de ${item.nombre_unidad} - Tiempo de operación: ${tiempoOperacionMin} minutos`,
          estado_nuevo: 'operación',
          sub_estado_nuevo: 'En transito'
        });
      }

      // Usar el endpoint específico de envío
      console.log('📡 Iniciando envío en backend...');
      console.log('📦 Items a enviar:', itemsSeleccionados.map(item => ({
        id: item.id,
        nombre: item.nombre_unidad,
        estado: item.estado,
        sub_estado: item.sub_estado
      })));
      
      const payload = {
        items_ids: itemsSeleccionados.map(item => item.id),
        tiempo_envio_minutos: tiempoOperacionMin,
        descripcion_adicional: 'Envío iniciado desde centro de operaciones'
      };
      
      console.log('📡 Payload enviado:', payload);
      
      const envioResponse = await apiServiceClient.post('/inventory/inventario/iniciar-envio', payload);

      console.log('✅ Envío iniciado en backend:', envioResponse.data);

      // Actualizar estado local INMEDIATAMENTE
      console.log('📝 Actualizando estado local con items de envío...');
      console.log('📝 Items para envío a agregar:', itemsParaEnvio.map(i => ({ id: i.id, timerId: i.timerId, nombre: i.nombre_unidad })));
      
      setItemsEnEnvio(prev => {
        const nuevosItems = [...prev, ...itemsParaEnvio];
        console.log('📝 Estado local actualizado. Total items en envío:', nuevosItems.length);
        console.log('📝 Items en envío completos:', nuevosItems.map(i => ({ id: i.id, timerId: i.timerId, nombre: i.nombre_unidad })));
        return nuevosItems;
      });
      
      // Forzar actualización del inventario para reflejar cambios inmediatamente
      if (typeof refetchInventario === 'function') {
        console.log('🔄 Actualizando inventario...');
        await refetchInventario();
      }

  console.log('🚚 ===== ENVÍO INICIADO EXITOSAMENTE =====');
  console.log(`📦 ${itemsParaEnvio.length} items en tránsito`);
  console.log(`⏱️ Tiempo de operación: ${formatearTiempo(tiempoOperacionMin * 60)}`);

      return {
        success: true,
        message: `Envío iniciado para ${itemsParaEnvio.length} items`,
        itemsEnviados: itemsParaEnvio.length,
  tiempoEstimado: tiempoOperacionMin
      };

    } catch (error: any) {
      console.error('❌ ===== ERROR EN PROCESO DE ENVÍO =====');
      console.error('❌ Error:', error);
      
      // Limpiar timers creados en caso de error
      itemsEnEnvio.forEach(item => {
        if (item.timerId) {
          eliminarTimer(item.timerId);
        }
      });

      throw new Error(`Error iniciando envío: ${error.message}`);
    } finally {
      setCargandoEnvio(false);
    }
  }, [crearTimer, eliminarTimer, formatearTiempo, itemsEnEnvio]);

  /**
   * Completa el envío cuando el temporizador termina
   */
  const completarEnvio = useCallback(async (itemId: number) => {
    try {
      console.log('🏁 ===== COMPLETANDO ENVÍO =====');
      console.log('📦 Item ID:', itemId);

      // Usar el endpoint específico para completar envío
      const completarResponse = await apiServiceClient.patch(`/inventory/inventario/${itemId}/completar-envio`);
      
      console.log('✅ Respuesta del backend:', completarResponse.data);

  // Mantener el timer activo para que siga visible en "Pendientes de Devolución"
  const item = itemsEnEnvio.find(i => i.id === itemId);

  // Actualizar estado local si el item existe
      if (item) {
        setItemsEnEnvio(prev => 
          prev.map(i => 
            i.id === itemId 
              ? { ...i, estado: 'operación', sub_estado: 'entregado' }
              : i
          )
        );
      }
      
      // Forzar actualización del inventario para reflejar cambios inmediatamente
      if (typeof refetchInventario === 'function') {
        console.log('🔄 Actualizando inventario después de completar...');
        await refetchInventario();
      }

      console.log('✅ ===== ENVÍO COMPLETADO =====');
      console.log(`📦 Item ID ${itemId} entregado exitosamente`);

      return {
        success: true,
        message: `Item ID ${itemId} entregado exitosamente`
      };

    } catch (error) {
      console.error('❌ Error completando envío:', error);
      throw error;
    }
  }, [itemsEnEnvio, eliminarTimer, refetchInventario]);

  /**
   * Cancela un envío en progreso
   */
  const cancelarEnvio = useCallback(async (itemId: number, motivo: string = 'Cancelado por usuario') => {
    try {
      console.log('🚫 ===== CANCELANDO ENVÍO =====');
      console.log('📦 Item ID:', itemId);
      console.log('📝 Motivo:', motivo);

      // Usar el endpoint específico para cancelar envío
      const cancelarResponse = await apiServiceClient.patch(`/inventory/inventario/${itemId}/cancelar-envio`, {
        motivo: motivo
      });
      
      console.log('✅ Respuesta del backend:', cancelarResponse.data);

  // Buscar item en estado local para eliminar timer de envío si existe
      const item = itemsEnEnvio.find(i => i.id === itemId);
      if (item && item.timerId) {
        eliminarTimer(item.timerId);
      }

      // Remover del estado local si existe
      if (item) {
        setItemsEnEnvio(prev => prev.filter(i => i.id !== itemId));
      }
      
      // Forzar actualización del inventario para reflejar cambios inmediatamente
      if (typeof refetchInventario === 'function') {
        console.log('🔄 Actualizando inventario después de cancelar...');
        await refetchInventario();
      }

      console.log('🚫 ===== ENVÍO CANCELADO =====');
      console.log(`📦 Item ID ${itemId} devuelto a acondicionamiento`);

      return {
        success: true,
        message: `Item ID ${itemId} cancelado y devuelto a acondicionamiento`
      };

    } catch (error) {
      console.error('❌ Error cancelando envío:', error);
      throw error;
    }
  }, [itemsEnEnvio, eliminarTimer, refetchInventario]);

  /**
   * Obtiene el tiempo restante de envío para un item
   */
  const obtenerTiempoRestanteEnvio = useCallback((itemId: number): string => {
    const item = itemsEnEnvio.find(i => i.id === itemId);
    if (!item || !item.fechaEstimadaLlegada) {
      return '00:00';
    }

    const ahora = new Date();
    const tiempoRestanteMs = item.fechaEstimadaLlegada.getTime() - ahora.getTime();
    const tiempoRestanteSegundos = Math.max(0, Math.floor(tiempoRestanteMs / 1000));

    return formatearTiempo(tiempoRestanteSegundos);
  }, [itemsEnEnvio, formatearTiempo]);

  /**
   * Obtiene estadísticas de envío
   */
  const obtenerEstadisticasEnvio = useCallback(() => {
    const enTransito = itemsEnEnvio.filter(i => i.sub_estado === 'En transito').length;
    const entregados = itemsEnEnvio.filter(i => i.sub_estado === 'entregado').length;
    const total = itemsEnEnvio.length;

    return {
      enTransito,
      entregados,
      total,
      tiempoPromedioEnvio: itemsEnEnvio.length > 0 
        ? itemsEnEnvio.reduce((acc, item) => acc + (item.tiempoEnvio || 0), 0) / itemsEnEnvio.length
        : 0
    };
  }, [itemsEnEnvio]);

  return {
    // Estados
    itemsEnEnvio,
    cargandoEnvio,
    
    // Funciones principales
    iniciarEnvio,
    completarEnvio,
    cancelarEnvio,
    
    // Funciones de utilidad
    obtenerTiempoRestanteEnvio,
    obtenerEstadisticasEnvio,
    
    // Setters para estado local
    setItemsEnEnvio
  };
};

export default useEnvio;
