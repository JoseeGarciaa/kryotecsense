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

  // Loader principal (usa backend; sin datos demo)
  const cargarItemsParaInspeccion = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const resp = await apiServiceClient.get('/inventory/inventario/');
      const data = Array.isArray(resp.data) ? resp.data : [];

      const normalize = (s: string | null | undefined) => {
        if (!s) return '';
        try {
          return s
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
        } catch {
          return String(s).toLowerCase().trim();
        }
      };

      // Mapear inventario a estructura local, separando pendientes vs inspeccionados
      const pendientes: ItemInspeccion[] = [];
      const inspeccionados: ItemInspeccion[] = [];
      for (const item of data) {
        const est = normalize(item.estado);
        const sub = normalize(item.sub_estado);
        const base: ItemInspeccion = {
          id: Number(item.id),
          nombre_unidad: item.nombre_unidad,
          rfid: item.rfid || '',
          lote: item.lote ?? null,
          categoria: (item.categoria as any) || 'TIC',
          estado: item.estado,
          sub_estado: item.sub_estado,
          validaciones: {
            limpieza: normalize(item.validacion_limpieza) === 'aprobado',
            goteo: normalize(item.validacion_goteo) === 'aprobado',
            desinfeccion: normalize(item.validacion_desinfeccion) === 'aprobado'
          }
        };

        // Caso 1: Items en Inspección (Pendiente o Inspeccionada)
        if (est === 'inspeccion') {
          if (sub === 'pendiente') pendientes.push(base);
          else inspeccionados.push(base);
          continue;
        }

        // Caso 2: Items ya movidos a En bodega pero con todas las validaciones aprobadas
        // Esto asegura que, al completar inspección, se sigan mostrando como "Inspeccionados" en la UI
        if (est === 'en bodega') {
          const { limpieza, goteo, desinfeccion } = base.validaciones!;
          if (limpieza && goteo && desinfeccion) {
            inspeccionados.push(base);
          }
        }
      }

      setItemsParaInspeccion(pendientes);
      setItemsInspeccionados(inspeccionados);
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
    // Actualizar UI inmediata
    setItemsParaInspeccion(prev => prev.map(item =>
      String(item.id) === String(itemId)
        ? { ...item, validaciones: { ...item.validaciones!, ...validaciones } }
        : item
    ));

    // Persistir en backend los campos de validación cambiados
    try {
      const payload: Record<string, string | null> = {};
      if (typeof validaciones.limpieza === 'boolean') {
        payload['validacion_limpieza'] = validaciones.limpieza ? 'aprobado' : null;
      }
      if (typeof validaciones.goteo === 'boolean') {
        payload['validacion_goteo'] = validaciones.goteo ? 'aprobado' : null;
      }
      if (typeof validaciones.desinfeccion === 'boolean') {
        payload['validacion_desinfeccion'] = validaciones.desinfeccion ? 'aprobado' : null;
      }
      if (Object.keys(payload).length > 0) {
        actualizarInventarioConFallback(itemId, payload);
      }
    } catch {}
  }, [actualizarInventarioConFallback]);

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

      // Actualizar estado local inmediatamente para feedback instantáneo
      setItemsParaInspeccion(prev => prev.filter(i => String(i.id) !== String(itemId)));
      setItemsInspeccionados(prev => {
        const ya = prev.some(i => String(i.id) === String(itemId));
        if (ya) return prev;
        // Reflejar que ya está inspeccionado aunque el backend tarde en responder
        return [...prev, { ...item, estado: 'Inspección', sub_estado: 'Inspeccionada' }];
      });
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
