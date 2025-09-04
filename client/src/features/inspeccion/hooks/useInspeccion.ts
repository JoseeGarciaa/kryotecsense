import { useState, useCallback, useEffect } from 'react';
import { apiServiceClient } from '../../../api/apiClient';
import { useTimerContext } from '../../../contexts/TimerContext';

export interface ItemInspeccion {
  id: number;
  nombre_unidad: string;
  rfid: string;
  lote: string | null;
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

  // Loader principal (con fallback seguro a datos de prueba)
  const cargarItemsParaInspeccion = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      // TODO: reemplazar por llamadas reales cuando el endpoint esté disponible
      const datosPrueba: ItemInspeccion[] = [
        {
          id: 1001,
          nombre_unidad: 'Unidad A',
          rfid: 'RFID-1001',
          lote: 'L-01',
          categoria: 'Cube',
          estado: 'Inspección',
          sub_estado: 'Pendiente',
          fecha_devolucion: new Date().toISOString(),
          tiempo_en_curso: '3 horas',
          validaciones: { limpieza: false, goteo: false, desinfeccion: false }
        },
        {
          id: 1002,
          nombre_unidad: 'Unidad B',
          rfid: 'RFID-1002',
          lote: 'L-02',
          categoria: 'VIP',
          estado: 'Inspección',
          sub_estado: 'Pendiente',
          fecha_devolucion: new Date().toISOString(),
          tiempo_en_curso: '1 hora',
          validaciones: { limpieza: false, goteo: false, desinfeccion: false }
        }
      ];
      setItemsParaInspeccion(datosPrueba);
      setItemsInspeccionados([]);
      console.log('Usando datos de prueba para desarrollo - Items para inspección:', datosPrueba.length);
    } catch (e: any) {
      const detalle = e?.response?.data?.detail || e?.message || 'No se pudieron cargar los items de inspección';
      setError(String(detalle));
    } finally {
      setCargando(false);
    }
  }, []);

  // Helper: actualizar campos de inventario con fallbacks robustos
  const actualizarInventarioConFallback = useCallback(
    async (itemId: number, campos: Record<string, any>) => {
      try {
        return await apiServiceClient.put(`/inventory/inventario/${itemId}`, campos);
      } catch (e1: any) {
        // Intentar campo por campo para aislar errores
        for (const [k, v] of Object.entries(campos)) {
          try {
            await apiServiceClient.put(`/inventory/inventario/${itemId}`, { [k]: v });
          } catch (e2) {
            console.warn('Campo falló en PUT parcial', k, e2);
          }
        }
      }
    },
    []
  );

  // Actualizar validaciones de un item (estado local)
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
      // Bloquear IDs especiales de grupos del sistema
      if (typeof itemId === 'string' && (itemId === 'ensamblaje-grupo' || itemId === 'listo-despacho-grupo')) {
        throw new Error('No se puede completar la inspección de un grupo del sistema.');
      }

      const item = itemsParaInspeccion.find(i => String(i.id) === String(itemId));
      if (!item) throw new Error('Item no encontrado');

      const { limpieza, goteo, desinfeccion } = item.validaciones!;
      if (!limpieza || !goteo || !desinfeccion) {
        throw new Error('Todas las validaciones deben estar completadas antes de finalizar la inspección');
      }

      // 1) Guardar validaciones
      await actualizarInventarioConFallback(itemId, {
        validacion_limpieza: 'aprobado',
        validacion_goteo: 'aprobado',
        validacion_desinfeccion: 'aprobado'
      });

      // 2) Registrar actividad de inspección completa (best-effort)
      try {
        await apiServiceClient.post('/activities/actividades/', {
          inventario_id: itemId,
          usuario_id: 1,
          descripcion: `${item.nombre_unidad} inspeccionado completamente (limpieza, goteo, desinfección)`,
          estado_nuevo: 'Inspección',
          sub_estado_nuevo: 'Inspeccionada'
        });
      } catch {}

      // 3) Inspección/Inspeccionada (PATCH) con tolerancia a no encontrado
      try {
        await apiServiceClient.patch(`/inventory/inventario/${itemId}/estado`, { estado: 'Inspección', sub_estado: 'Inspeccionada' });
      } catch (e: any) {
        const msg = e?.response?.data?.detail || e?.message || '';
        if (!/no encontrado|not found/i.test(String(msg))) {
          await new Promise(r => setTimeout(r, 200));
          await apiServiceClient.patch(`/inventory/inventario/${itemId}/estado`, { estado: 'Inspección', sub_estado: 'Inspeccionada' });
        }
      }

      // 4) En bodega/Disponible (PATCH) con tolerancia a no encontrado
      try {
        await apiServiceClient.patch(`/inventory/inventario/${itemId}/estado`, { estado: 'En bodega', sub_estado: 'Disponible' });
      } catch (e: any) {
        const msg = e?.response?.data?.detail || e?.message || '';
        if (!/no encontrado|not found/i.test(String(msg))) {
          await new Promise(r => setTimeout(r, 200));
          await apiServiceClient.patch(`/inventory/inventario/${itemId}/estado`, { estado: 'En bodega', sub_estado: 'Disponible' });
        }
      }

      // 5) Limpiar lote
      await actualizarInventarioConFallback(itemId, { lote: null });

      // 6) Actividad movimiento a bodega (best-effort)
      try {
        await apiServiceClient.post('/activities/actividades/', {
          inventario_id: itemId,
          usuario_id: 1,
          descripcion: `${item.nombre_unidad} inspeccionado y movido a En bodega (lote limpiado)`,
          estado_nuevo: 'En bodega',
          sub_estado_nuevo: 'Disponible'
        });
      } catch {}

      // 7) Cancelar cronómetro de inspección
      try {
        const t = timers.find(t => t.tipoOperacion === 'inspeccion' && new RegExp(`^Inspección\s+#${String(itemId)}\s+-`).test(t.nombre));
        if (t) eliminarTimer(t.id);
      } catch {}

      // Actualizar estado local si el backend dijo "no encontrado" para que el flujo no se bloquee
      setItemsParaInspeccion(prev => prev.filter(i => String(i.id) !== String(itemId)));
      setItemsInspeccionados(prev => [
        ...prev,
        item
      ]);
      try { await cargarItemsParaInspeccion(); } catch {}
    } catch (err: any) {
      const detalle = err?.response?.data?.detail || err?.message || 'Error al completar inspección';
      setError(String(detalle));
      throw err;
    }
  }, [itemsParaInspeccion, actualizarInventarioConFallback, timers, eliminarTimer, cargarItemsParaInspeccion]);

  // Completar inspección en lote (robusto, devuelve resumen sin lanzar en fallos parciales)
  const completarInspeccionEnLote = useCallback(
    async (itemIds: number[]): Promise<{ ok: number; fail: Array<{ id: number; reason: string }> }> => {
      const resultado = { ok: 0, fail: [] as Array<{ id: number; reason: string }> };
      if (!itemIds || itemIds.length === 0) return resultado;
      setError(null);

      // Filtrar grupos reservados por seguridad
      const idsValidos = (itemIds || []).filter((itemId: any) => {
        if (typeof itemId === 'string' && (itemId === 'ensamblaje-grupo' || itemId === 'listo-despacho-grupo')) return false;
        return true;
      }) as number[];

      for (const itemId of idsValidos) {
        const item = itemsParaInspeccion.find(i => String(i.id) === String(itemId)) || itemsInspeccionados.find(i => String(i.id) === String(itemId));
        try {
          // 1) Persistir validaciones como aprobadas (idempotente)
          await actualizarInventarioConFallback(itemId, {
            validacion_limpieza: 'aprobado',
            validacion_goteo: 'aprobado',
            validacion_desinfeccion: 'aprobado'
          });

          // 2) Actividad inspección (best-effort)
          try {
            await apiServiceClient.post('/activities/actividades/', {
              inventario_id: itemId,
              usuario_id: 1,
              descripcion: `${item?.nombre_unidad ?? 'Item'} inspeccionado completamente (lote)`,
              estado_nuevo: 'Inspección',
              sub_estado_nuevo: 'Inspeccionada'
            });
          } catch {}

          // 3) Estados: Inspección/Inspeccionada -> En bodega/Disponible (tolerante a no encontrado)
          try {
            await apiServiceClient.patch(`/inventory/inventario/${itemId}/estado`, { estado: 'Inspección', sub_estado: 'Inspeccionada' });
          } catch (e: any) {
            const msg = e?.response?.data?.detail || e?.message || '';
            if (!/no encontrado|not found/i.test(String(msg))) {
              await new Promise(r => setTimeout(r, 150));
              await apiServiceClient.patch(`/inventory/inventario/${itemId}/estado`, { estado: 'Inspección', sub_estado: 'Inspeccionada' });
            }
          }
          try {
            await apiServiceClient.patch(`/inventory/inventario/${itemId}/estado`, { estado: 'En bodega', sub_estado: 'Disponible' });
          } catch (e: any) {
            const msg = e?.response?.data?.detail || e?.message || '';
            if (!/no encontrado|not found/i.test(String(msg))) {
              await new Promise(r => setTimeout(r, 150));
              await apiServiceClient.patch(`/inventory/inventario/${itemId}/estado`, { estado: 'En bodega', sub_estado: 'Disponible' });
            }
          }

          // 4) Limpiar lote
          await actualizarInventarioConFallback(itemId, { lote: null });

          // 5) Actividad movimiento a bodega (best-effort)
          try {
            await apiServiceClient.post('/activities/actividades/', {
              inventario_id: itemId,
              usuario_id: 1,
              descripcion: `${item?.nombre_unidad ?? 'Item'} movido a En bodega (lote limpiado)`,
              estado_nuevo: 'En bodega',
              sub_estado_nuevo: 'Disponible'
            });
          } catch {}

          // 6) Cancelar cronómetro si existe
          try {
            const t = timers.find(t => t.tipoOperacion === 'inspeccion' && new RegExp(`^Inspección\\s+#${String(itemId)}\\s+-`).test(t.nombre));
            if (t) eliminarTimer(t.id);
          } catch {}

          resultado.ok += 1;
        } catch (e: any) {
          const detalle = e?.response?.data?.detail || e?.message || 'Error desconocido';
          resultado.fail.push({ id: Number(itemId), reason: String(detalle) });
        }
      }

  try { await cargarItemsParaInspeccion(); } catch {}
      if (resultado.fail.length > 0) setError(`${resultado.fail.length} fallas en lote`);
      return resultado;
    },
    [itemsParaInspeccion, itemsInspeccionados, actualizarInventarioConFallback, timers, eliminarTimer, cargarItemsParaInspeccion]
  );

  // Devolver items inspeccionados a bodega (acción manual)
  const devolverItemsABodega = useCallback(
    async (itemIds: number[]) => {
      if (!itemIds || itemIds.length === 0) return;
      try {
        setError(null);
        for (const itemId of itemIds) {
          try {
            await apiServiceClient.patch(`/inventory/inventario/${itemId}/estado`, { estado: 'En bodega', sub_estado: 'Disponible' });
          } catch (e) {
            await new Promise(r => setTimeout(r, 180));
            await apiServiceClient.patch(`/inventory/inventario/${itemId}/estado`, { estado: 'En bodega', sub_estado: 'Disponible' });
          }
          await actualizarInventarioConFallback(itemId, { lote: null });

          try {
            const item = itemsParaInspeccion.find(i => String(i.id) === String(itemId)) || itemsInspeccionados.find(i => String(i.id) === String(itemId));
            await apiServiceClient.post('/activities/actividades/', {
              inventario_id: itemId,
              usuario_id: 1,
              descripcion: `${item?.nombre_unidad ?? 'Item'} devuelto a En bodega manualmente desde Inspección`,
              estado_nuevo: 'En bodega',
              sub_estado_nuevo: 'Disponible'
            });
          } catch {}

          try {
            const t = timers.find(t => t.tipoOperacion === 'inspeccion' && new RegExp(`^Inspección\\s+#${String(itemId)}\\s+-`).test(t.nombre));
            if (t) eliminarTimer(t.id);
          } catch {}
        }

        await cargarItemsParaInspeccion();
      } catch (err: any) {
        const detalle = err?.response?.data?.detail || err?.message || 'Error al devolver a bodega';
        setError(String(detalle));
        throw err;
      }
    },
    [actualizarInventarioConFallback, timers, eliminarTimer, cargarItemsParaInspeccion, itemsParaInspeccion, itemsInspeccionados]
  );

  // Agregar item a la cola de escaneos (sin procesar inmediatamente)
  const agregarAColaEscaneo = useCallback((item: ItemInspeccion) => {
    const yaEnCola = colaEscaneos.includes(item.id);
    const yaEscaneado = itemsEscaneados.some(i => i.id === item.id);
    if (!yaEnCola && !yaEscaneado) {
      setColaEscaneos(prev => [...prev, item.id]);
      setItemsEscaneados(prev => [...prev, item]);
      console.log(`📝 Item ${item.nombre_unidad} agregado a cola de escaneo`);
    }
  }, [colaEscaneos, itemsEscaneados]);

  // Procesar cola de escaneos
  const procesarColaEscaneos = useCallback(async () => {
    if (colaEscaneos.length === 0) return;
    setProcesandoEscaneos(true);
    try {
      setError(null);
      const idsValidos = colaEscaneos.filter(itemId => {
        if (typeof itemId === 'string' && (itemId === 'ensamblaje-grupo' || itemId === 'listo-despacho-grupo')) return false;
        return true;
      });
      if (idsValidos.length === 0) return;

      const promesas = idsValidos.map(async (itemId) => {
        const item = itemsParaInspeccion.find(i => String(i.id) === String(itemId));
        if (!item) return null;
        try {
          await actualizarInventarioConFallback(itemId, { validacion_limpieza: 'aprobado', validacion_goteo: 'aprobado', validacion_desinfeccion: 'aprobado' });
          await apiServiceClient.post('/activities/actividades/', { inventario_id: itemId, usuario_id: 1, descripcion: `${item.nombre_unidad} inspeccionado completamente mediante escaneo RFID (limpieza, goteo, desinfección automática)`, estado_nuevo: 'Inspección', sub_estado_nuevo: 'Inspeccionada' });
          await apiServiceClient.patch(`/inventory/inventario/${itemId}/estado`, { estado: 'Inspección', sub_estado: 'Inspeccionada' });
          await apiServiceClient.patch(`/inventory/inventario/${itemId}/estado`, { estado: 'En bodega', sub_estado: 'Disponible' });
          await actualizarInventarioConFallback(itemId, { lote: null });
          await apiServiceClient.post('/activities/actividades/', { inventario_id: itemId, usuario_id: 1, descripcion: `${item.nombre_unidad} inspeccionado (escaneo) y movido a En bodega (lote limpiado)`, estado_nuevo: 'En bodega', sub_estado_nuevo: 'Disponible' });
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
      if (fallidos.length > 0) console.warn(`⚠️ ${fallidos.length} items fallaron`);
      await cargarItemsParaInspeccion();
      setColaEscaneos([]);
      setItemsEscaneados([]);
    } catch (error: any) {
      const detalle = error?.response?.data?.detail || error?.message || 'Error al procesar items escaneados';
      setError(String(detalle));
    } finally {
      setProcesandoEscaneos(false);
    }
  }, [colaEscaneos, itemsParaInspeccion, actualizarInventarioConFallback, timers, eliminarTimer, cargarItemsParaInspeccion]);

  // Completar inspección mediante escaneo RFID (versión individual)
  const completarInspeccionPorEscaneo = useCallback(async (itemId: number) => {
    try {
      const item = itemsParaInspeccion.find(i => i.id === itemId);
      if (!item) throw new Error('Item no encontrado');
      agregarAColaEscaneo(item);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al agregar item a escaneo');
      throw err;
    }
  }, [itemsParaInspeccion, agregarAColaEscaneo]);

  // Cargar al montar
  useEffect(() => { cargarItemsParaInspeccion(); }, [cargarItemsParaInspeccion]);

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
    devolverItemsABodega,
    // Estados y funciones para escaneo masivo
    itemsEscaneados,
    procesandoEscaneos,
    colaEscaneos,
    procesarColaEscaneos
  };
};
