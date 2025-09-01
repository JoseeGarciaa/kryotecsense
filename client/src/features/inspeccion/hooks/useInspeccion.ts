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

  // Helper: actualizar campos de inventario con fallbacks robustos
  const actualizarInventarioConFallback = useCallback(
    async (itemId: number, campos: Record<string, any>) => {
      try {
        // Intentar PUT directo (parcial permitido por backend via model_dump(exclude_unset))
        return await apiServiceClient.put(`/inventory/inventario/${itemId}`, campos);
      } catch (e: any) {
        // Intento de fallback utilizando bulk-update
        try {
          const payload = { updates: [{ id: itemId, ...campos }] };
          return await apiServiceClient.post('/inventory/inventario/bulk-update', payload);
        } catch (e2: any) {
          // Último fallback: intentar campo por campo con PUT para aislar el error
          try {
            for (const [k, v] of Object.entries(campos)) {
              await apiServiceClient.put(`/inventory/inventario/${itemId}`, { [k]: v });
            }
            return { data: { message: 'Actualización por campos aplicada' } } as any;
          } catch (e3: any) {
            const detalle = e2?.response?.data?.detail || e?.response?.data?.detail || e3?.message || e2?.message || e?.message;
            throw new Error(detalle || 'Error actualizando inventario');
          }
        }
      }
    },
    []
  );

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
  setError(null);
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

      // 1) Guardar validaciones (solo campos de validación)
  await actualizarInventarioConFallback(itemId, {
        validacion_limpieza: 'aprobado',
        validacion_goteo: 'aprobado',
        validacion_desinfeccion: 'aprobado'
      });

      // Registrar actividad de inspección completa (best-effort)
      try {
        await apiServiceClient.post('/activities/actividades/', {
          inventario_id: itemId,
          usuario_id: 1,
          descripcion: `${item.nombre_unidad} inspeccionado completamente (limpieza, goteo, desinfección)`,
          estado_nuevo: 'Inspección',
          sub_estado_nuevo: 'Inspeccionada'
        });
      } catch {}

      // 2) Marcar estado como Inspección/Inspeccionada (PATCH estado)
      try {
        await apiServiceClient.patch(`/inventory/inventario/${itemId}/estado`, {
          estado: 'Inspección',
          sub_estado: 'Inspeccionada'
        });
      } catch (e) {
        // retry once quickly in case of transient conflicts
        await new Promise(r => setTimeout(r, 200));
        await apiServiceClient.patch(`/inventory/inventario/${itemId}/estado`, {
          estado: 'Inspección',
          sub_estado: 'Inspeccionada'
        });
      }

      // 3) Mover a En bodega/Disponible (PATCH estado)
      try {
        await apiServiceClient.patch(`/inventory/inventario/${itemId}/estado`, {
          estado: 'En bodega',
          sub_estado: 'Disponible'
        });
      } catch (e) {
        await new Promise(r => setTimeout(r, 200));
        await apiServiceClient.patch(`/inventory/inventario/${itemId}/estado`, {
          estado: 'En bodega',
          sub_estado: 'Disponible'
        });
      }

      // 4) Limpiar lote explícitamente (PUT parcial)
  await actualizarInventarioConFallback(itemId, { lote: null });

      // Registrar actividad de movimiento a bodega (best-effort)
      try {
        await apiServiceClient.post('/activities/actividades/', {
          inventario_id: itemId,
          usuario_id: 1,
          descripcion: `${item.nombre_unidad} inspeccionado y movido a En bodega (lote limpiado)`,
          estado_nuevo: 'En bodega',
          sub_estado_nuevo: 'Disponible'
        });
      } catch {}

      // Cancelar cronómetro de inspección si existe
      try {
        const t = timers.find(t => t.tipoOperacion === 'inspeccion' && new RegExp(`^Inspección\s+#${String(itemId)}\s+-`).test(t.nombre));
        if (t) eliminarTimer(t.id);
      } catch {}

      console.log(`✅ Inspección completada para ${item.nombre_unidad}`);
      
      // Recargar datos
      await cargarItemsParaInspeccion();
      
    } catch (err: any) {
      console.error('Error completando inspección:', err);
      const detalle = err?.response?.data?.detail || err?.message || 'Error al completar inspección';
      setError(String(detalle));
      throw err;
    }
  }, [itemsParaInspeccion, cargarItemsParaInspeccion]);

  // Completar inspección en lote
  const completarInspeccionEnLote = useCallback(async (itemIds: number[]) => {
    if (itemIds.length === 0) return;

    try {
      setError(null);
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
        
        // 1) Guardar validaciones en paralelo (solo campos de validación)
        const promesasValidaciones = idsValidos.map(itemId =>
          actualizarInventarioConFallback(itemId, {
            validacion_limpieza: 'aprobado',
            validacion_goteo: 'aprobado',
            validacion_desinfeccion: 'aprobado'
          })
        );

        // Actividades (best-effort)
        try {
          await Promise.all(itemsAInspeccionar.map(item =>
            apiServiceClient.post('/activities/actividades/', {
              inventario_id: item.id,
              usuario_id: 1,
              descripcion: `${item.nombre_unidad} inspeccionado completamente (limpieza, goteo, desinfección)`,
              estado_nuevo: 'Inspección',
              sub_estado_nuevo: 'Inspeccionada'
            })
          ));
        } catch {}

        await Promise.all(promesasValidaciones);

        // 2) y 3) y 4) aplicar de forma secuencial por item para evitar errores 500 masivos
        for (const itemId of idsValidos) {
          // Inspección/Inspeccionada
          await apiServiceClient.patch(`/inventory/inventario/${itemId}/estado`, {
            estado: 'Inspección',
            sub_estado: 'Inspeccionada'
          });
          // En bodega/Disponible
          await apiServiceClient.patch(`/inventory/inventario/${itemId}/estado`, {
            estado: 'En bodega',
            sub_estado: 'Disponible'
          });
          // Limpiar lote
          await actualizarInventarioConFallback(itemId, { lote: null });
        }

        // 5) Registrar actividad de movimiento a bodega (best-effort)
        try {
          await Promise.all(itemsAInspeccionar.map(item =>
            apiServiceClient.post('/activities/actividades/', {
              inventario_id: item.id,
              usuario_id: 1,
              descripcion: `${item.nombre_unidad} inspeccionado y movido a En bodega (lote limpiado)`,
              estado_nuevo: 'En bodega',
              sub_estado_nuevo: 'Disponible'
            })
          ));
        } catch {}

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
        
      } catch (backendError: any) {
        console.warn('Error inspección en lote:', backendError);
        const detalle = backendError?.response?.data?.detail || backendError?.message || 'Error en inspección en lote';
        setError(String(detalle));
        throw backendError;
      }
      
    } catch (err: any) {
      console.error('Error completando inspección en lote:', err);
      const detalle = err?.response?.data?.detail || err?.message || 'Error al completar inspección en lote';
      setError(String(detalle));
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
      setError(null);
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
          // 1) Guardar validaciones
          await actualizarInventarioConFallback(itemId, {
            validacion_limpieza: 'aprobado',
            validacion_goteo: 'aprobado',
            validacion_desinfeccion: 'aprobado'
          });

          // Actividad de inspección completa por escaneo
          await apiServiceClient.post('/activities/actividades/', {
            inventario_id: itemId,
            usuario_id: 1,
            descripcion: `${item.nombre_unidad} inspeccionado completamente mediante escaneo RFID (limpieza, goteo, desinfección automática)`,
            estado_nuevo: 'Inspección',
            sub_estado_nuevo: 'Inspeccionada'
          });

          // 2) Marcar Inspección/Inspeccionada
          await apiServiceClient.patch(`/inventory/inventario/${itemId}/estado`, {
            estado: 'Inspección',
            sub_estado: 'Inspeccionada'
          });

          // 3) Mover a En bodega/Disponible
          await apiServiceClient.patch(`/inventory/inventario/${itemId}/estado`, {
            estado: 'En bodega',
            sub_estado: 'Disponible'
          });

          // 4) Limpiar lote
          await actualizarInventarioConFallback(itemId, { lote: null });

          // Actividad de movimiento a bodega
          await apiServiceClient.post('/activities/actividades/', {
            inventario_id: itemId,
            usuario_id: 1,
            descripcion: `${item.nombre_unidad} inspeccionado (escaneo) y movido a En bodega (lote limpiado)`,
            estado_nuevo: 'En bodega',
            sub_estado_nuevo: 'Disponible'
          });

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
      
  // Re-sincronizar desde backend para reflejar estados reales
  await cargarItemsParaInspeccion();

  // Limpiar cola y items escaneados
      setColaEscaneos([]);
      setItemsEscaneados([]);
      
    } catch (error: any) {
      console.error('Error procesando cola de escaneos:', error);
      const detalle = error?.response?.data?.detail || error?.message || 'Error al procesar items escaneados';
      setError(String(detalle));
    } finally {
      setProcesandoEscaneos(false);
    }
  }, [colaEscaneos, itemsParaInspeccion, cargarItemsParaInspeccion]);

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
