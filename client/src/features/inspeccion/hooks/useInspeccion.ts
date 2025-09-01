import { useState, useCallback, useEffect } from 'react';
import { apiServiceClient } from '../../../api/apiClient';
import { useTimerContext } from '../../../contexts/TimerContext';

export interface ItemInspeccion {
  id: number;
  nombre_unidad: string;
  rfid: string;
  lote: string;
  categoria: 'Cube' | 'VIP' | 'TIC';
  estado: string;
  sub_estado: string;
  fecha_devolucion?: string;
  tiempo_en_curso?: string;
  validaciones?: {
    limpieza: boolean;
    goteo: boolean;
    desinfeccion: boolean;
  };
}

export interface InspeccionValidation {
  itemId: number;
  limpieza: boolean;
  goteo: boolean;
  desinfeccion: boolean;
}

export const useInspeccion = () => {
  const [itemsParaInspeccion, setItemsParaInspeccion] = useState<ItemInspeccion[]>([]);
  const [itemsInspeccionados, setItemsInspeccionados] = useState<ItemInspeccion[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { timers, eliminarTimer } = useTimerContext();
  
  // Estados para escaneo masivo
  const [colaEscaneos, setColaEscaneos] = useState<number[]>([]);
  const [itemsEscaneados, setItemsEscaneados] = useState<ItemInspeccion[]>([]);
  const [procesandoEscaneos, setProcesandoEscaneos] = useState(false);

  // Cargar items pendientes de inspección
  const cargarItemsParaInspeccion = useCallback(async () => {
    setCargando(true);
    setError(null);
    
    try {
      console.log('🔍 Cargando items para inspección...');
      
      // Obtener inventario completo
      const response = await apiServiceClient.get('/inventory/inventario/');
      const inventarioCompleto = response.data;
      const normalize = (s: string | null | undefined) =>
        (s ?? '')
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
          .toLowerCase()
          .trim();
      
      // Pendientes SOLAMENTE cuando ya fueron movidos explícitamente a Inspección desde Devolución
      // i.e., estado = Inspección y sub_estado = En proceso (o Pendiente)
      const itemsPendientes = inventarioCompleto.filter((item: any) => {
        const estado = normalize(item.estado);
        const sub = normalize(item.sub_estado);
        const esPendienteInspeccion = estado === 'inspeccion' && (sub === 'en proceso' || sub === 'pendiente');
        return esPendienteInspeccion;
      });
      
      // Filtrar items ya inspeccionados
      const itemsYaInspeccionados = inventarioCompleto.filter((item: any) => {
        const estado = normalize(item.estado);
        const sub = normalize(item.sub_estado);
        return estado === 'inspeccion' && sub === 'inspeccionada';
      });
      
      console.log(`📦 Items para inspección encontrados: ${itemsPendientes.length}`);
      console.log(`✅ Items ya inspeccionados: ${itemsYaInspeccionados.length}`);
      
      setItemsParaInspeccion(itemsPendientes.map((item: any) => ({
        ...item,
        validaciones: {
          limpieza: false,
          goteo: false,
          desinfeccion: false
        }
      })));
      
      setItemsInspeccionados(itemsYaInspeccionados);
      
    } catch (err) {
      console.warn('Backend no disponible, usando datos de prueba:', err);
      
    // Datos de prueba para desarrollo (solo items ya enviados a Inspección)
      const datosPrueba: ItemInspeccion[] = [
        {
          id: 2001,
          nombre_unidad: 'Credo Cube 3L',
          categoria: 'Cube',
          lote: 'Lote 1',
          rfid: 'RFID001',
      estado: 'Inspección',
      sub_estado: 'En proceso',
          fecha_devolucion: new Date().toISOString(),
          tiempo_en_curso: '2 horas',
          validaciones: {
            limpieza: false,
            goteo: false,
            desinfeccion: false
          }
        },
        {
          id: 2002,
          nombre_unidad: 'VIP 3L',
          categoria: 'VIP',
          lote: 'Lote 2',
          rfid: 'RFID002',
      estado: 'Inspección',
      sub_estado: 'En proceso',
          fecha_devolucion: new Date().toISOString(),
          tiempo_en_curso: '1.5 horas',
          validaciones: {
            limpieza: false,
            goteo: false,
            desinfeccion: false
          }
        },
        {
          id: 2003,
          nombre_unidad: 'TIC 3L',
          categoria: 'TIC',
          lote: 'Lote 1',
          rfid: 'RFID003',
      estado: 'Inspección',
      sub_estado: 'En proceso',
          fecha_devolucion: new Date().toISOString(),
          tiempo_en_curso: '3 horas',
          validaciones: {
            limpieza: false,
            goteo: false,
            desinfeccion: false
          }
        }
      ];
      
      setItemsParaInspeccion(datosPrueba);
      setItemsInspeccionados([]);
      console.log('Usando datos de prueba para desarrollo - Items para inspección:', datosPrueba.length);
    } finally {
      setCargando(false);
    }
  }, []);

  // Actualizar validaciones de un item
  const actualizarValidaciones = useCallback((itemId: number, validaciones: Partial<InspeccionValidation>) => {
    setItemsParaInspeccion(prev => 
      prev.map(item => 
        String(item.id) === String(itemId) 
          ? { 
              ...item, 
              validaciones: { 
                ...item.validaciones!, 
                ...validaciones 
              } 
            }
          : item
      )
    );
  }, []);

  // Completar inspección de un item
  const completarInspeccion = useCallback(async (itemId: number) => {
    try {
      // Prevenir procesamiento solo de los grupos hardcodeados del sistema específicos
      if (typeof itemId === 'string' && 
          (itemId === 'ensamblaje-grupo' || itemId === 'listo-despacho-grupo')) {
        console.error('❌ Intento de completar inspección de grupo del sistema bloqueado:', itemId);
        throw new Error('No se puede completar la inspección de un grupo del sistema.');
      }
      
  const item = itemsParaInspeccion.find(i => String(i.id) === String(itemId));
      if (!item) {
        throw new Error('Item no encontrado');
      }

      // Verificar que todas las validaciones estén completadas
      const { limpieza, goteo, desinfeccion } = item.validaciones!;
      if (!limpieza || !goteo || !desinfeccion) {
        throw new Error('Todas las validaciones deben estar completadas antes de finalizar la inspección');
      }

      console.log(`🔍 Completando inspección para item ${item.nombre_unidad}...`);

      try {
        // 1) Guardar validaciones y marcar como Inspeccionada con un solo PUT
        await Promise.all([
          apiServiceClient.put(`/inventory/inventario/${itemId}`, {
            validacion_limpieza: 'aprobado',
            validacion_goteo: 'aprobado',
            validacion_desinfeccion: 'aprobado',
            estado: 'Inspección',
            sub_estado: 'Inspeccionada'
          }),
          apiServiceClient.post('/activities/actividades/', {
            inventario_id: itemId,
            usuario_id: 1,
            descripcion: `${item.nombre_unidad} inspeccionado completamente (limpieza, goteo, desinfección)`,
            estado_nuevo: 'Inspección',
            sub_estado_nuevo: 'Inspeccionada'
          })
        ]);

        // 2) Mover inmediatamente a En bodega y limpiar lote
        await Promise.all([
          apiServiceClient.put(`/inventory/inventario/${itemId}`, {
            estado: 'En bodega',
            sub_estado: null,
            lote: null
          }),
          apiServiceClient.post('/activities/actividades/', {
            inventario_id: itemId,
            usuario_id: 1,
            descripcion: `${item.nombre_unidad} inspeccionado y movido a En bodega (lote limpiado)`,
            estado_nuevo: 'En bodega',
            sub_estado_nuevo: null
          })
        ]);

        // 3) Cancelar cronómetro de inspección si existe
        try {
          const t = timers.find(t => t.tipoOperacion === 'inspeccion' && new RegExp(`^Inspección\s+#${String(itemId)}\s+-`).test(t.nombre));
          if (t) eliminarTimer(t.id);
        } catch {}

        console.log(`✅ Inspección completada para ${item.nombre_unidad}`);
        
        // Recargar datos
        await cargarItemsParaInspeccion();
        
      } catch (backendError) {
        console.warn('Backend no disponible, simulando cambio local:', backendError);
        
        // Simular el cambio localmente
        setItemsParaInspeccion(prev => prev.filter(i => String(i.id) !== String(itemId)));
        setItemsInspeccionados(prev => [...prev, {
          ...item,
          estado: 'En bodega',
          sub_estado: ''
        }]);
        
        console.log(`✅ Inspección completada localmente para ${item.nombre_unidad}`);
      }
      
    } catch (err) {
      console.error('Error completando inspección:', err);
      setError(err instanceof Error ? err.message : 'Error al completar inspección');
      throw err;
    }
  }, [itemsParaInspeccion, cargarItemsParaInspeccion]);

  // Completar inspección en lote
  const completarInspeccionEnLote = useCallback(async (itemIds: number[]) => {
    if (itemIds.length === 0) return;

    try {
      console.log(`🔄 Completando inspección en lote para ${itemIds.length} items...`);

      // Verificar que todos los items tengan validaciones completas
      const idsStr = itemIds.map(String);
      const itemsAInspeccionar = itemsParaInspeccion.filter(item => idsStr.includes(String(item.id)));
      const itemsIncompletos = itemsAInspeccionar.filter(item => {
        const { limpieza, goteo, desinfeccion } = item.validaciones!;
        return !limpieza || !goteo || !desinfeccion;
      });

      if (itemsIncompletos.length > 0) {
        throw new Error(`${itemsIncompletos.length} items no tienen todas las validaciones completadas`);
      }

      try {
        // Filtrar solo los grupos hardcodeados del sistema específicos
        const idsValidos = itemIds.filter(itemId => {
          // Solo bloquear los grupos del sistema específicos
          if (typeof itemId === 'string' && 
              (itemId === 'ensamblaje-grupo' || itemId === 'listo-despacho-grupo')) {
            console.error('❌ Intento de procesar grupo del sistema en inspección bloqueado:', itemId);
            return false;
          }
          
          return true;
        });
        
        if (idsValidos.length === 0) {
          throw new Error('No hay IDs válidos para procesar en inspección.');
        }
        
        // Procesar todos los items válidos en paralelo (guardar validaciones y marcar Inspeccionada)
        const promesasEstadoYValid = idsValidos.map(itemId =>
          apiServiceClient.put(`/inventory/inventario/${itemId}`, {
            validacion_limpieza: 'aprobado',
            validacion_goteo: 'aprobado',
            validacion_desinfeccion: 'aprobado',
            estado: 'Inspección',
            sub_estado: 'Inspeccionada'
          })
        );

        const promesasActividades = itemsAInspeccionar.map(item => 
          apiServiceClient.post('/activities/actividades/', {
            inventario_id: item.id,
            usuario_id: 1,
            descripcion: `${item.nombre_unidad} inspeccionado completamente (limpieza, goteo, desinfección)`,
            estado_nuevo: 'Inspección',
            sub_estado_nuevo: 'Inspeccionada'
          })
        );

  await Promise.all([...promesasEstadoYValid, ...promesasActividades]);

        // Mover a En bodega y registrar actividad para cada item
        const promesasBodega = idsValidos.map(itemId => 
          apiServiceClient.put(`/inventory/inventario/${itemId}`, {
            estado: 'En bodega',
            sub_estado: null,
            lote: null
          })
        );
        const promesasActBodega = itemsAInspeccionar.map(item => 
          apiServiceClient.post('/activities/actividades/', {
            inventario_id: item.id,
            usuario_id: 1,
            descripcion: `${item.nombre_unidad} inspeccionado y movido a En bodega (lote limpiado)`,
            estado_nuevo: 'En bodega',
            sub_estado_nuevo: null
          })
        );

        await Promise.all([...promesasBodega, ...promesasActBodega]);

        // Cancelar cronómetros de inspección
        try {
          for (const id of idsValidos) {
            const t = timers.find(t => t.tipoOperacion === 'inspeccion' && new RegExp(`^Inspección\\s+#${String(id)}\\s+-`).test(t.nombre));
            if (t) eliminarTimer(t.id);
          }
        } catch {}
        console.log(`✅ ${itemIds.length} items inspeccionados en backend`);
        
        // Recargar datos
        await cargarItemsParaInspeccion();
        
      } catch (backendError) {
        console.warn('Backend no disponible, simulando cambio local:', backendError);
        
        // Simular cambios localmente
        setItemsParaInspeccion(prev => prev.filter(item => !itemIds.map(String).includes(String(item.id))));
        setItemsInspeccionados(prev => [...prev, ...itemsAInspeccionar.map(item => ({
          ...item,
          estado: 'En bodega',
          sub_estado: ''
        }))]);
        
        console.log(`✅ ${itemIds.length} items inspeccionados localmente`);
      }
      
    } catch (err) {
      console.error('Error completando inspección en lote:', err);
      setError(err instanceof Error ? err.message : 'Error al completar inspección en lote');
      throw err;
    }
  }, [itemsParaInspeccion, cargarItemsParaInspeccion]);

  // Agregar item a la cola de escaneos (sin procesar inmediatamente)
  const agregarAColaEscaneo = useCallback((item: ItemInspeccion) => {
    // Verificar que el item no esté ya en la cola o ya escaneado
    const yaEnCola = colaEscaneos.includes(item.id);
    const yaEscaneado = itemsEscaneados.some(i => i.id === item.id);
    
    if (!yaEnCola && !yaEscaneado) {
      setColaEscaneos(prev => [...prev, item.id]);
      setItemsEscaneados(prev => [...prev, item]);
      console.log(`📝 Item ${item.nombre_unidad} agregado a cola de escaneo`);
    }
  }, [colaEscaneos, itemsEscaneados]);

  // Procesar toda la cola de escaneos de una vez
  const procesarColaEscaneos = useCallback(async () => {
    if (colaEscaneos.length === 0) return;
    
    setProcesandoEscaneos(true);
    console.log(`🚀 Procesando ${colaEscaneos.length} items escaneados...`);
    
    try {
      // Filtrar solo los grupos hardcodeados del sistema específicos
      const idsValidos = colaEscaneos.filter(itemId => {
        // Solo bloquear los grupos del sistema específicos
        if (typeof itemId === 'string' && 
            (itemId === 'ensamblaje-grupo' || itemId === 'listo-despacho-grupo')) {
          console.error('❌ Intento de procesar grupo del sistema en cola de escaneos bloqueado:', itemId);
          return false;
        }
        
        return true;
      });
      
      if (idsValidos.length === 0) {
        console.warn('⚠️ No hay IDs válidos para procesar en cola de escaneos.');
        return;
      }
      
      // Procesar todos los items válidos en paralelo para mayor velocidad
      const promesas = idsValidos.map(async (itemId) => {
        const item = itemsParaInspeccion.find(i => String(i.id) === String(itemId));
        if (!item) return null;
        
        try {
          // Actualizar estado y validaciones en el backend y marcar Inspeccionada
          await Promise.all([
            apiServiceClient.put(`/inventory/inventario/${itemId}`, {
              validacion_limpieza: 'aprobado',
              validacion_goteo: 'aprobado',
              validacion_desinfeccion: 'aprobado',
              estado: 'Inspección',
              sub_estado: 'Inspeccionada'
            }),
            apiServiceClient.post('/activities/actividades/', {
              inventario_id: itemId,
              usuario_id: 1,
              descripcion: `${item.nombre_unidad} inspeccionado completamente mediante escaneo RFID (limpieza, goteo, desinfección automática)`,
              estado_nuevo: 'Inspección',
              sub_estado_nuevo: 'Inspeccionada'
            })
          ]);

          // Mover a En bodega y registrar actividad
          await Promise.all([
            apiServiceClient.put(`/inventory/inventario/${itemId}`, {
              estado: 'En bodega',
              sub_estado: null,
              lote: null
            }),
            apiServiceClient.post('/activities/actividades/', {
              inventario_id: itemId,
              usuario_id: 1,
              descripcion: `${item.nombre_unidad} inspeccionado (escaneo) y movido a En bodega (lote limpiado)`,
              estado_nuevo: 'En bodega',
              sub_estado_nuevo: null
            })
          ]);

          // Cancelar cronómetro de inspección si existe
          try {
            const t = timers.find(t => t.tipoOperacion === 'inspeccion' && new RegExp(`^Inspección\\s+#${String(itemId)}\\s+-`).test(t.nombre));
            if (t) eliminarTimer(t.id);
          } catch {}
          
          return { success: true, item };
        } catch (error) {
          console.warn(`Error procesando ${item.nombre_unidad}:`, error);
          return { success: false, item, error };
        }
      });
      
      const resultados = await Promise.all(promesas);
      const exitosos = resultados.filter(r => r && r.success);
      const fallidos = resultados.filter(r => r && !r.success);
      
      console.log(`✅ ${exitosos.length} items procesados exitosamente`);
      if (fallidos.length > 0) {
        console.warn(`⚠️ ${fallidos.length} items fallaron`);
      }
      
      // Actualizar estados localmente sin recargar desde backend
      const itemsExitosos = exitosos.map(r => r!.item);
      setItemsParaInspeccion(prev => prev.filter(item => !colaEscaneos.map(String).includes(String(item.id))));
      setItemsInspeccionados(prev => [...prev, ...itemsExitosos.map(item => ({
        ...item,
        estado: 'En bodega',
        sub_estado: '',
        validaciones: {
          limpieza: true,
          goteo: true,
          desinfeccion: true
        }
      }))]);
      
      // Limpiar cola y items escaneados
      setColaEscaneos([]);
      setItemsEscaneados([]);
      
    } catch (error) {
      console.error('Error procesando cola de escaneos:', error);
      setError('Error al procesar algunos items escaneados');
    } finally {
      setProcesandoEscaneos(false);
    }
  }, [colaEscaneos, itemsParaInspeccion]);

  // Completar inspección mediante escaneo RFID (versión individual rápida)
  const completarInspeccionPorEscaneo = useCallback(async (itemId: number) => {
    try {
      const item = itemsParaInspeccion.find(i => i.id === itemId);
      if (!item) {
        throw new Error('Item no encontrado');
      }

      // Agregar a la cola en lugar de procesar inmediatamente
      agregarAColaEscaneo(item);
      
    } catch (err) {
      console.error('Error agregando item a cola de escaneo:', err);
      setError(err instanceof Error ? err.message : 'Error al agregar item a escaneo');
      throw err;
    }
  }, [itemsParaInspeccion, agregarAColaEscaneo]);

  return {
    itemsParaInspeccion,
    itemsInspeccionados,
    cargando,
    error,
    cargarItemsParaInspeccion,
    actualizarValidaciones,
    completarInspeccion,
    completarInspeccionEnLote,
    completarInspeccionPorEscaneo,
    // Estados y funciones para escaneo masivo
    itemsEscaneados,
    procesandoEscaneos,
    colaEscaneos,
    procesarColaEscaneos
  };
};
