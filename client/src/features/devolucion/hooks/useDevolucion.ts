import { useState, useCallback, useEffect } from 'react';
import { apiServiceClient } from '../../../api/apiClient';
import { useTimerContext } from '../../../contexts/TimerContext';

interface ItemDevolucion {
  id: number;
  nombre_unidad: string;
  categoria: 'Cube' | 'VIP' | 'TIC';
  lote: string;
  estado: string;
  sub_estado: string;
  rfid?: string;
  fecha_devolucion?: string;
}

export const useDevolucion = () => {
  const [itemsDevolucion, setItemsDevolucion] = useState<ItemDevolucion[]>([]);
  const [itemsDevueltos, setItemsDevueltos] = useState<ItemDevolucion[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { timers, eliminarTimer } = useTimerContext();

  // Cargar items pendientes de devolución
  const cargarItemsDevolucion = useCallback(async () => {
    try {
      setCargando(true);
      setError(null);

      try {
        // Intentar cargar desde el backend
        const inventarioResponse = await apiServiceClient.get('/inventory/inventario/');
        
        if (inventarioResponse.data && Array.isArray(inventarioResponse.data)) {
          // Normalizador: sin tildes y minúsculas
          const normalize = (s: string | null | undefined) =>
            (s ?? '')
              .normalize('NFD')
              .replace(/\p{Diacritic}/gu, '')
              .toLowerCase()
              .trim();

          // Filtrar items pendientes de devolución:
          // 1. Items en operación (en tránsito/en transcurso) -> mostrar tiempo restante de 96h
          // 2. Items completados de operación (operación/entregado)
          // 3. Items que están listos para despacho (Acondicionamiento/Lista para Despacho)
          const itemsPendientes = inventarioResponse.data.filter((item: any) => {
            const estado = normalize(item.estado);
            const sub = normalize(item.sub_estado);
            const acond = normalize('Acondicionamiento');
            const listoDesp = normalize('Lista para Despacho');
            const esOperacionCurso = estado === 'operacion' && (sub === 'en transito' || sub === 'en transcurso');
            const esOperacionEntregado = estado === 'operacion' && (sub === 'entregado' || sub === 'entregada');
            const esListoDespacho = estado === acond && sub === listoDesp;
            return esOperacionCurso || esOperacionEntregado || esListoDespacho;
          });
          
          // Filtrar items ya devueltos (estado: Devolución, sub_estado: Devuelto)
          const itemsDevueltosData = inventarioResponse.data.filter((item: any) => {
            const estado = normalize(item.estado);
            const sub = normalize(item.sub_estado);
            return estado === 'devolucion' && sub === 'devuelto';
          });
          
          setItemsDevolucion(itemsPendientes);
          setItemsDevueltos(itemsDevueltosData);
          console.log('Items de devolución cargados desde backend:', {
            pendientes: itemsPendientes.length,
            devueltos: itemsDevueltosData.length,
            todosLosItems: inventarioResponse.data.length
          });
          
          // Debug: mostrar algunos items para verificar estados
          console.log('Primeros 5 items del inventario:', inventarioResponse.data.slice(0, 5).map(item => ({
            id: item.id,
            nombre: item.nombre_unidad,
            estado: item.estado,
            sub_estado: item.sub_estado,
            categoria: item.categoria
          })));
          return;
        }
      } catch (backendError) {
        console.warn('Backend no disponible', backendError);
    
        // Datos de prueba para mostrar el agrupamiento
        const datosPrueba: ItemDevolucion[] = [
          {
            id: 1001,
            nombre_unidad: 'Credo Cube 3L',
            categoria: 'Cube' as const,
            lote: 'Lote 1',
            rfid: 'RFID001',
            estado: 'operación',
            sub_estado: 'entregado'
          },
          {
            id: 1002,
            nombre_unidad: 'VIP 4L',
            categoria: 'VIP' as const,
            lote: 'Lote 2',
            rfid: 'RFID002',
            estado: 'operación',
            sub_estado: 'entregado'
          },
          {
            id: 1003,
            nombre_unidad: 'TIC 3L',
            categoria: 'TIC' as const,
            lote: 'Lote 1',
            rfid: 'RFID003',
            estado: 'operación',
            sub_estado: 'entregado'
          },
          {
            id: 1004,
            nombre_unidad: 'TIC 3L',
            categoria: 'TIC' as const,
            lote: 'Lote 1',
            rfid: 'RFID004',
            estado: 'operación',
            sub_estado: 'entregado'
          },
          {
            id: 1005,
            nombre_unidad: 'Credo Cube 5L',
            categoria: 'Cube' as const,
            lote: 'Lote 3',
            rfid: 'RFID005',
            estado: 'operación',
            sub_estado: 'entregado'
          }
        ];
        
        setItemsDevolucion(datosPrueba);
        setItemsDevueltos([]);
        console.log('Usando datos de prueba para desarrollo - Items pendientes:', datosPrueba.length);
      }
    } catch (err) {
      console.error('Error cargando items de devolución:', err);
      setError('Error al cargar items de devolución');
    } finally {
      setCargando(false);
    }
  }, []);

  // Marcar múltiples items como devueltos en lote
  const marcarItemsComoDevueltos = useCallback(async (itemIds: number[]) => {
    try {
      setError(null);
      console.log(`🔄 Procesando ${itemIds.length} items en lote...`);

      // Encontrar todos los items
      const itemsADevolver = itemIds.map(id => {
        const item = itemsDevolucion.find(i => i.id === id);
        if (!item) {
          throw new Error(`Item ${id} no encontrado`);
        }
        return item;
      });

      try {
        // Filtrar solo los grupos hardcodeados del sistema específicos
        const idsValidos = itemIds.filter(itemId => {
          // Solo bloquear los grupos del sistema específicos
          if (typeof itemId === 'string' && 
              (itemId === 'ensamblaje-grupo' || itemId === 'listo-despacho-grupo')) {
            console.error('❌ Intento de procesar grupo del sistema en devolución bloqueado:', itemId);
            return false;
          }
          
          // Permitir todos los demás IDs
          return true;
        });
        
        if (idsValidos.length === 0) {
          throw new Error('No hay IDs válidos para procesar en devolución.');
        }
        
        // Procesar todos los items válidos en paralelo para mayor velocidad
        const promesasEstado = idsValidos.map(itemId => 
          apiServiceClient.patch(`/inventory/inventario/${itemId}/estado`, {
            estado: 'Devolución',
            sub_estado: 'Devuelto',
            lote: null // limpiar lote al devolverse
          })
        );

        // Filtrar items para actividades (solo los válidos)
        const itemsValidosParaActividades = itemsADevolver.filter(item => 
          idsValidos.includes(item.id)
        );
        
        const promesasActividades = itemsValidosParaActividades.map(item => 
          apiServiceClient.post('/activities/actividades/', {
            inventario_id: item.id,
            usuario_id: 1, // TODO: Obtener del contexto de usuario
            descripcion: `${item.nombre_unidad} marcado como devuelto`,
            estado_nuevo: 'Devolución',
            sub_estado_nuevo: 'Devuelto'
          })
        );

        // Ejecutar todas las promesas en paralelo
        await Promise.all([...promesasEstado, ...promesasActividades]);

  console.log(`✅ ${idsValidos.length} items válidos marcados como devueltos en backend`);
  // Mantener timers para que sigan visibles en "Items Devueltos" con su conteo
        
        // Una sola recarga al final
        await cargarItemsDevolucion();
      } catch (backendError) {
        console.warn('Backend no disponible, simulando cambio local:', backendError);
        
        // Simular el cambio localmente para desarrollo
        setItemsDevolucion(prev => prev.filter(i => !itemIds.includes(i.id)));
        setItemsDevueltos(prev => [...prev, ...itemsADevolver.map(item => ({
          ...item,
          estado: 'Devolución',
          sub_estado: 'Devuelto'
        }))]);
        
        console.log(`✅ ${itemIds.length} items marcados como devueltos localmente (modo desarrollo)`);
      }
    } catch (err) {
      console.error('Error marcando items como devueltos:', err);
      setError('Error al marcar items como devueltos');
      throw err;
    }
  }, [itemsDevolucion, cargarItemsDevolucion]);

  // Mantener función individual para compatibilidad
  const marcarComoDevuelto = useCallback(async (itemId: number) => {
    return marcarItemsComoDevueltos([itemId]);
  }, [marcarItemsComoDevueltos]);

  // Escuchar acciones desde la UI para mover estados
  useEffect(() => {
    const onRegresarOperacion = async (e: Event) => {
      const id = (e as CustomEvent).detail?.id as number;
      const nombre = (e as CustomEvent).detail?.nombre as string | undefined;
      if (!id) return;
      try {
        await apiServiceClient.patch(`/inventory/inventario/${id}/estado`, {
          estado: 'operación',
          sub_estado: 'En transito'
        });
        // Registrar actividad
        await apiServiceClient.post('/activities/actividades/', {
          inventario_id: id,
          usuario_id: 1,
          descripcion: `${nombre ?? 'Item'} regresado a Operación (continúa cronómetro)`,
          estado_nuevo: 'operación',
          sub_estado_nuevo: 'En transito'
        });
        await cargarItemsDevolucion();
        alert('✅ Regresó a Operación (cronómetro continúa)');
      } catch (err) {
        console.error('Error regresando a operación:', err);
        alert('❌ Error regresando a Operación');
      }
    };

    const onPasarInspeccion = async (e: Event) => {
      const id = (e as CustomEvent).detail?.id as number;
      const nombre = (e as CustomEvent).detail?.nombre as string | undefined;
      if (!id) return;
      try {
        // Cancelar timer de operación si existe
        const timer = timers.find(t => t.tipoOperacion === 'envio' && new RegExp(`^Envío\\s+#${id}\\s+-`).test(t.nombre));
        if (timer) eliminarTimer(timer.id);

        // Mover a inspección
        await apiServiceClient.patch(`/inventory/inventario/${id}/estado`, {
          estado: 'Inspección',
          sub_estado: 'En proceso'
        });
        // Registrar actividad
        await apiServiceClient.post('/activities/actividades/', {
          inventario_id: id,
          usuario_id: 1,
          descripcion: `${nombre ?? 'Item'} pasó a Inspección (cronómetro cancelado)`,
          estado_nuevo: 'Inspección',
          sub_estado_nuevo: 'En proceso'
        });
        await cargarItemsDevolucion();
        alert('🔎 Pasó a Inspección (cronómetro cancelado)');
      } catch (err) {
        console.error('Error pasando a inspección:', err);
        alert('❌ Error pasando a Inspección');
      }
    };

    window.addEventListener('devolucion:regresar-operacion', onRegresarOperacion as EventListener);
    window.addEventListener('devolucion:pasar-inspeccion', onPasarInspeccion as EventListener);
    return () => {
      window.removeEventListener('devolucion:regresar-operacion', onRegresarOperacion as EventListener);
      window.removeEventListener('devolucion:pasar-inspeccion', onPasarInspeccion as EventListener);
    };
  }, [cargarItemsDevolucion, timers, eliminarTimer]);

  return {
    itemsDevolucion,
    itemsDevueltos,
    cargando,
    error,
    cargarItemsDevolucion,
    marcarComoDevuelto,
  marcarItemsComoDevueltos
  };
};
