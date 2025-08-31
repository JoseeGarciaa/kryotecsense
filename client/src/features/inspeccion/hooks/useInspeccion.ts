import { useState, useCallback, useEffect } from 'react';
import { apiServiceClient } from '../../../api/apiClient';

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
      
      // Pendientes si: (Devolución/Devuelto) o (Inspección/En proceso)
      const itemsPendientes = inventarioCompleto.filter((item: any) => {
        const estado = normalize(item.estado);
        const sub = normalize(item.sub_estado);
        const esDevuelto = estado === 'devolucion' && sub === 'devuelto';
        const esEnProceso = estado === 'inspeccion' && (sub === 'en proceso' || sub === 'en proceso');
        return esDevuelto || esEnProceso;
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
      
      // Datos de prueba para desarrollo
      const datosPrueba: ItemInspeccion[] = [
        {
          id: 2001,
          nombre_unidad: 'Credo Cube 3L',
          categoria: 'Cube',
          lote: 'Lote 1',
          rfid: 'RFID001',
          estado: 'Devolución',
          sub_estado: 'Devuelto',
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
          estado: 'Devolución',
          sub_estado: 'Devuelto',
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
          estado: 'Devolución',
          sub_estado: 'Devuelto',
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
        item.id === itemId 
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
      
      const item = itemsParaInspeccion.find(i => i.id === itemId);
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
        // Actualizar estado y validaciones en el backend
        await Promise.all([
          apiServiceClient.patch(`/inventory/inventario/${itemId}/estado`, {
            estado: 'Inspección',
            sub_estado: 'Inspeccionada'
          }),
          // Actualizar las validaciones en el inventario
          apiServiceClient.patch(`/inventory/inventario/${itemId}/`, {
            validacion_limpieza: 'aprobado',
            validacion_goteo: 'aprobado',
            validacion_desinfeccion: 'aprobado'
          }),
          apiServiceClient.post('/activities/actividades/', {
            inventario_id: itemId,
            usuario_id: 1, // TODO: Obtener del contexto de usuario
            descripcion: `${item.nombre_unidad} inspeccionado completamente (limpieza, goteo, desinfección)`,
            estado_nuevo: 'Inspección',
            sub_estado_nuevo: 'Inspeccionada'
          })
        ]);

        console.log(`✅ Inspección completada para ${item.nombre_unidad}`);
        
        // Recargar datos
        await cargarItemsParaInspeccion();
        
      } catch (backendError) {
        console.warn('Backend no disponible, simulando cambio local:', backendError);
        
        // Simular el cambio localmente
        setItemsParaInspeccion(prev => prev.filter(i => i.id !== itemId));
        setItemsInspeccionados(prev => [...prev, {
          ...item,
          estado: 'Inspección',
          sub_estado: 'Inspeccionada'
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
      const itemsAInspeccionar = itemsParaInspeccion.filter(item => itemIds.includes(item.id));
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
        
        // Procesar todos los items válidos en paralelo
        const promesasEstado = idsValidos.map(itemId => 
          apiServiceClient.patch(`/inventory/inventario/${itemId}/estado`, {
            estado: 'Inspección',
            sub_estado: 'Inspeccionada'
          })
        );

        // Actualizar validaciones para todos los items
        const promesasValidaciones = itemIds.map(itemId => 
          apiServiceClient.patch(`/inventory/inventario/${itemId}/`, {
            validacion_limpieza: 'aprobado',
            validacion_goteo: 'aprobado',
            validacion_desinfeccion: 'aprobado'
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

        await Promise.all([...promesasEstado, ...promesasValidaciones, ...promesasActividades]);
        console.log(`✅ ${itemIds.length} items inspeccionados en backend`);
        
        // Recargar datos
        await cargarItemsParaInspeccion();
        
      } catch (backendError) {
        console.warn('Backend no disponible, simulando cambio local:', backendError);
        
        // Simular cambios localmente
        setItemsParaInspeccion(prev => prev.filter(item => !itemIds.includes(item.id)));
        setItemsInspeccionados(prev => [...prev, ...itemsAInspeccionar.map(item => ({
          ...item,
          estado: 'Inspección',
          sub_estado: 'Inspeccionada'
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
        const item = itemsParaInspeccion.find(i => i.id === itemId);
        if (!item) return null;
        
        try {
          // Actualizar estado y validaciones en el backend
          await Promise.all([
            apiServiceClient.patch(`/inventory/inventario/${itemId}/estado`, {
              estado: 'Inspección',
              sub_estado: 'Inspeccionada'
            }),
            // Actualizar las validaciones en el inventario
            apiServiceClient.patch(`/inventory/inventario/${itemId}/`, {
              validacion_limpieza: 'aprobado',
              validacion_goteo: 'aprobado',
              validacion_desinfeccion: 'aprobado'
            }),
            apiServiceClient.post('/activities/actividades/', {
              inventario_id: itemId,
              usuario_id: 1,
              descripcion: `${item.nombre_unidad} inspeccionado completamente mediante escaneo RFID (limpieza, goteo, desinfección automática)`,
              estado_nuevo: 'Inspección',
              sub_estado_nuevo: 'Inspeccionada'
            })
          ]);
          
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
      setItemsParaInspeccion(prev => prev.filter(item => !colaEscaneos.includes(item.id)));
      setItemsInspeccionados(prev => [...prev, ...itemsExitosos.map(item => ({
        ...item,
        estado: 'Inspección',
        sub_estado: 'Inspeccionada',
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
