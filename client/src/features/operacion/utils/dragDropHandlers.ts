import { DropResult } from '@hello-pangea/dnd';
import { apiServiceClient } from '../../../api/apiClient';
import { bulkOperations } from './optimizedBulkOperations';

export const createDragDropHandlers = (
  columns: any,
  setColumns: any,
  inventarioCompleto: any[],
  actualizarColumnasDesdeBackend: () => Promise<void>,
  moverItemABodegaConReagrupacion?: (item: any) => Promise<void>,
  createInspectionTimer?: (id: string | number, nombre: string | undefined) => void
) => {
  
  // Función para mover un grupo completo de TICs a pre-acondicionamiento (OPTIMIZADA)
  const moverGrupoTicsAPreAcondicionamiento = async (grupoTics: any) => {
    try {
      console.log(`🚀 [OPTIMIZADO] Moviendo grupo completo de TICs: ${grupoTics.items_grupo.length} items`);
      
      // Usar operaciones optimizadas en lote
      const result = await bulkOperations.optimizedMoveToPreAcondicionamiento(
        grupoTics.items_grupo,
        'Congelación'
      );
      
      // Actualizar las columnas una sola vez al final
      await actualizarColumnasDesdeBackend();
      
      if (result.success > 0) {
        const message = `✅ ${result.success} TIC(s) del grupo movidos a pre-acondicionamiento exitosamente`;
        if (result.errors.length > 0) {
          alert(`${message}\n\n⚠️ Algunos items tuvieron errores:\n${result.errors.join('\n')}`);
        } else {
          alert(message);
        }
      } else {
        alert(`❌ No se pudieron mover los TICs:\n${result.errors.join('\n')}`);
      }
      
    } catch (error: any) {
      console.error('Error moviendo grupo de TICs:', error);
      alert(`❌ Error al mover el grupo de TICs a pre-acondicionamiento: ${error.message}`);
    }
  };

  // Manejador principal de drag & drop
  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const { source, destination } = result;
    
    // Validar drag & drop de grupos
    const sourceColumn = columns[source.droppableId];
    const itemMovido = sourceColumn.items[source.index];
    
    // Prevenir drag & drop solo de los grupos hardcodeados del sistema específicos
    if (typeof itemMovido.id === 'string' && 
        (itemMovido.id === 'ensamblaje-grupo' || itemMovido.id === 'listo-despacho-grupo')) {
      alert('⚠️ Este elemento no se puede mover. Es un grupo del sistema.');
      return;
    }
    
    if (itemMovido.es_grupo) {
      // Verificar si el grupo tiene items
      if (!itemMovido.items_grupo || itemMovido.items_grupo.length === 0) {
        alert('⚠️ Este grupo está vacío. No hay items para mover.');
        return;
      }
      
      // Permitir mover grupos a pre-acondicionamiento
      if (destination.droppableId === 'pre-acondicionamiento') {
        if (itemMovido.tipo_base !== 'TICS' && itemMovido.tipo_base !== 'TIC' && 
            itemMovido.tipo_base !== 'CREDOS' && itemMovido.tipo_base !== 'VIPS') {
          alert('⚠️ Solo los grupos de TICs, CREDOS y VIPS pueden moverse a pre-acondicionamiento.');
          return;
        }
        // Mover todo el grupo
        await moverGrupoTicsAPreAcondicionamiento(itemMovido);
        return;
      }
      
      // Permitir mover grupos de pre-acondicionamiento a acondicionamiento
      if (destination.droppableId === 'acondicionamiento') {
        if (itemMovido.es_proceso_principal || itemMovido.es_lote) {
          // Mover grupo completo de pre-acondicionamiento a acondicionamiento
          await moverGrupoPreAcondicionamientoAAcondicionamiento(itemMovido);
          return;
        }
      }
      
      // Prevenir mover grupos hardcodeados a bodega
      if (destination.droppableId === 'en-bodega') {
        alert('⚠️ Los grupos del sistema no se pueden mover a bodega.');
        return;
      }
      
      // Para otros destinos, mostrar error
      alert('⚠️ Los grupos de TICs solo se pueden mover entre pre-acondicionamiento y acondicionamiento.');
      return;
    }
    
    // Validaciones específicas por destino
    if (destination.droppableId === 'pre-acondicionamiento') {
      const nombre = itemMovido.nombre_unidad?.toUpperCase() || '';
  if (typeof nombre === 'string' && !nombre.includes('TIC') && !nombre.includes('CREDO') && !nombre.includes('VIP')) {
        alert('⚠️ Solo los TICs, CREDOS y VIPS pueden ir a pre-acondicionamiento.');
        return;
      }
      
      // Si viene de acondicionamiento, mover de vuelta a pre-acondicionamiento
      if (source.droppableId === 'acondicionamiento') {
        await moverItemAPreAcondicionamiento(itemMovido);
        return;
      }
    }
    
    // Validación: TICs, CREDOS y VIPS pueden ir a acondicionamiento
    if (destination.droppableId === 'acondicionamiento') {
      const nombre = itemMovido.nombre_unidad?.toUpperCase() || '';
      if (!nombre.includes('TIC') && !nombre.includes('CREDO') && !nombre.includes('VIP')) {
        alert('⚠️ Solo los TICs, CREDOS y VIPS pueden ir a acondicionamiento.');
        return;
      }
      
      // Si viene de pre-acondicionamiento, mover a acondicionamiento
      if (source.droppableId === 'pre-acondicionamiento') {
        await moverItemAAcondicionamiento(itemMovido);
        return;
      }
    }
    
    // Validación: TICs, CREDOS y VIPS pueden ir a devolución
    if (destination.droppableId === 'devolucion') {
      const nombre = itemMovido.nombre_unidad?.toUpperCase() || '';
      if (!nombre.includes('TIC') && !nombre.includes('CREDO') && !nombre.includes('VIP')) {
        alert('⚠️ Solo los TICs, CREDOS y VIPS pueden ir a devolución.');
        return;
      }
    }
    
    // Validación: TICs, CREDOS y VIPS pueden ir a operación
    if (destination.droppableId === 'operacion') {
      const nombre = itemMovido.nombre_unidad?.toUpperCase() || '';
      if (!nombre.includes('TIC') && !nombre.includes('CREDO') && !nombre.includes('VIP')) {
        alert('⚠️ Solo los TICs, CREDOS y VIPS pueden ir a operación.');
        return;
      }
    }
    
    // Validación: TICs, CREDOS y VIPS pueden ir a inspección
    if (destination.droppableId === 'inspeccion') {
      const nombre = itemMovido.nombre_unidad?.toUpperCase() || '';
      if (!nombre.includes('TIC') && !nombre.includes('CREDO') && !nombre.includes('VIP')) {
        alert('⚠️ Solo los TICs, CREDOS y VIPS pueden ir a inspección.');
        return;
      }
    }
    
    // Continuar con el drag & drop normal para items individuales
    if (source.droppableId === destination.droppableId) {
      const column = columns[source.droppableId];
      const copiedItems = [...column.items];
      const [removed] = copiedItems.splice(source.index, 1);
      copiedItems.splice(destination.index, 0, removed);
      setColumns({
        ...columns,
        [source.droppableId]: {
          ...column,
          items: copiedItems,
        },
      });
    } else {
      // Mover item entre columnas diferentes
      const sourceColumn = columns[source.droppableId];
      const destColumn = columns[destination.droppableId];
      const sourceItems = [...sourceColumn.items];
      const destItems = [...destColumn.items];
      const [removed] = sourceItems.splice(source.index, 1);
      
      try {
        // Si se mueve a bodega y tenemos la función de reagrupación, usarla
        if (destination.droppableId === 'en-bodega' && moverItemABodegaConReagrupacion) {
          await moverItemABodegaConReagrupacion(removed);
          return; // La función ya maneja la actualización de columnas
        }
        
        // Crear actividad en el backend para el movimiento (OPTIMIZADA)
        await crearActividadMovimiento(removed, destination.droppableId);
        
        destItems.splice(destination.index, 0, removed);
        setColumns({
          ...columns,
          [source.droppableId]: {
            ...sourceColumn,
            items: sourceItems,
          },
          [destination.droppableId]: {
            ...destColumn,
            items: destItems,
          },
        });
        
        // Actualizar desde backend para mantener consistencia
        await actualizarColumnasDesdeBackend();
        
      } catch (error: any) {
        console.error('❌ Error en drag & drop:', error);
        alert(`❌ ${error.message || 'Error al mover el item'}`);
        return;
      }
    }
  };

  // Función para mover un grupo completo de pre-acondicionamiento a acondicionamiento - OPTIMIZADA
  const moverGrupoPreAcondicionamientoAAcondicionamiento = async (grupoPreAcondicionamiento: any) => {
    try {
      console.log(`🚀 [OPTIMIZADO] Moviendo grupo de pre-acondicionamiento a acondicionamiento: ${grupoPreAcondicionamiento.items_grupo?.length || 1} items`);
      
      // Si es un grupo con items_grupo, usar operaciones en lote
      if (grupoPreAcondicionamiento.items_grupo && grupoPreAcondicionamiento.items_grupo.length > 0) {
        
        // === VERSIÓN OPTIMIZADA: Mover todos los items en lote ===
        const result = await bulkOperations.optimizedMoveToAcondicionamiento(
          grupoPreAcondicionamiento.items_grupo,
          'En proceso'
        );
        
        console.log(`✅ [OPTIMIZADO] ${result.success} items movidos a acondicionamiento`);
        
        if (result.errors.length > 0) {
          console.warn('⚠️ Algunos items tuvieron errores:', result.errors);
        }
        
        // Actualizar las columnas
        await actualizarColumnasDesdeBackend();
        
        // Mostrar resultados
        const mensaje = `✅ ${result.success} TIC(s) movido(s) a acondicionamiento exitosamente`;
        if (result.errors.length > 0) {
          alert(`${mensaje}\n\n⚠️ Algunos items tuvieron errores:\n${result.errors.join('\n')}`);
        } else {
          alert(mensaje);
        }
        
      } else {
        // Si es un item individual, mantener lógica existente
        const nuevaActividad = {
          inventario_id: grupoPreAcondicionamiento.inventario_id,
          usuario_id: 1,
          descripcion: `TIC movido a acondicionamiento - ${grupoPreAcondicionamiento.nombre_unidad}`,
          estado_nuevo: 'Acondicionamiento',
          sub_estado_nuevo: 'En proceso'
        };
        
        await apiServiceClient.post('/activities/actividades/', nuevaActividad);
        console.log(`✅ Actividad creada para ${grupoPreAcondicionamiento.nombre_unidad}`);
        
        // Actualizar las columnas
        await actualizarColumnasDesdeBackend();
        alert(`✅ 1 TIC movido a acondicionamiento exitosamente`);
      }
      
    } catch (error) {
      console.error('Error moviendo grupo a acondicionamiento:', error);
      alert('❌ Error al mover el grupo a acondicionamiento');
    }
  };

  // Función para mover un item individual de acondicionamiento a pre-acondicionamiento
  const moverItemAPreAcondicionamiento = async (item: any) => {
    try {
      console.log(`🚀 Moviendo item de acondicionamiento a pre-acondicionamiento: ${item.nombre_unidad}`);
      
      const nuevaActividad = {
        inventario_id: item.inventario_id || item.id,
        usuario_id: 1, // Usuario actual
        descripcion: `TIC movido de vuelta a pre-acondicionamiento - ${item.nombre_unidad}`,
        estado_nuevo: 'Pre-acondicionamiento',
        sub_estado_nuevo: 'Congelación'
      };
      
      await apiServiceClient.post('/activities/actividades/', nuevaActividad);
      console.log(`✅ Actividad creada para ${item.nombre_unidad}`);
      
      // Actualizar las columnas
      await actualizarColumnasDesdeBackend();
      
      alert(`✅ ${item.nombre_unidad} movido de vuelta a pre-acondicionamiento`);
      
    } catch (error) {
      console.error('Error moviendo item a pre-acondicionamiento:', error);
      alert('❌ Error al mover el item a pre-acondicionamiento');
    }
  };

  // Función para mover un item individual de pre-acondicionamiento a acondicionamiento
  const moverItemAAcondicionamiento = async (item: any) => {
    try {
      console.log(`🚀 Moviendo item de pre-acondicionamiento a acondicionamiento: ${item.nombre_unidad}`);
      
      const nuevaActividad = {
        inventario_id: item.inventario_id || item.id,
        usuario_id: 1, // Usuario actual
        descripcion: `TIC movido a acondicionamiento desde pre-acondicionamiento - ${item.nombre_unidad}`,
        estado_nuevo: 'Acondicionamiento',
        sub_estado_nuevo: 'En proceso'
      };
      
      await apiServiceClient.post('/activities/actividades/', nuevaActividad);
      console.log(`✅ Actividad creada para ${item.nombre_unidad}`);
      
      // Actualizar las columnas
      await actualizarColumnasDesdeBackend();
      
      alert(`✅ ${item.nombre_unidad} movido a acondicionamiento`);
      
    } catch (error) {
      console.error('Error moviendo item a acondicionamiento:', error);
      alert('❌ Error al mover el item a acondicionamiento');
    }
  };

  // Función para crear actividad cuando se mueve un item (OPTIMIZADA)
  const crearActividadMovimiento = async (item: any, destino: string) => {
    try {
      // Mapear columnas a estados
      const estadosPorColumna: { [key: string]: { estado: string; subEstado: string } } = {
        'en-bodega': { estado: 'En bodega', subEstado: 'Disponible' },
        'pre-acondicionamiento': { estado: 'Pre-acondicionamiento', subEstado: 'En proceso' },
        'acondicionamiento': { estado: 'Acondicionamiento', subEstado: 'En proceso' },
        'operacion': { estado: 'Operación', subEstado: 'En proceso' },
        'devolucion': { estado: 'Devolución', subEstado: 'En proceso' },
        'inspeccion': { estado: 'Inspección', subEstado: 'En proceso' }
      };
      
      const estadoDestino = estadosPorColumna[destino];
      if (!estadoDestino) {
        console.warn(`⚠️ Estado desconocido para columna: ${destino}`);
        return;
      }
      
      // Validaciones adicionales (mantener las validaciones de negocio)
      if (destino === 'acondicionamiento') {
        const nombre = item.nombre_unidad?.toUpperCase() || '';
        if (!nombre.includes('TIC')) {
          throw new Error('Solo los TICs pueden ir a acondicionamiento. Los CREDOS y VIPS no pasan por este proceso.');
        }
      }
      
      if (destino === 'pre-acondicionamiento') {
        const nombre = item.nombre_unidad?.toUpperCase() || '';
        if (!nombre.includes('TIC')) {
          throw new Error('Solo los TICs pueden ir a pre-acondicionamiento. Los CREDOS y VIPS no pasan por este proceso.');
        }
      }
      
      // Validaciones para devolución - pueden ir TICs, CREDOS y VIPS
      if (destino === 'devolucion') {
        const nombre = item.nombre_unidad?.toUpperCase() || '';
        if (!nombre.includes('TIC') && !nombre.includes('CREDO') && !nombre.includes('VIP')) {
          throw new Error('Solo los TICs, CREDOS y VIPS pueden ir a devolución.');
        }
      }
      
      // Validaciones para operación - pueden ir TICs, CREDOS y VIPS
      if (destino === 'operacion') {
        const nombre = item.nombre_unidad?.toUpperCase() || '';
        if (!nombre.includes('TIC') && !nombre.includes('CREDO') && !nombre.includes('VIP')) {
          throw new Error('Solo los TICs, CREDOS y VIPS pueden ir a operación.');
        }
      }
      
      // Validaciones para inspección - pueden ir TICs, CREDOS y VIPS
      if (destino === 'inspeccion') {
        const nombre = item.nombre_unidad?.toUpperCase() || '';
        if (!nombre.includes('TIC') && !nombre.includes('CREDO') && !nombre.includes('VIP')) {
          throw new Error('Solo los TICs, CREDOS y VIPS pueden ir a inspección.');
        }
      }
      
      // Usar operaciones optimizadas para item individual
      const updates = [{
        id: item.id || item.inventario_id,
        inventory_data: {
          estado: estadoDestino.estado,
          sub_estado: estadoDestino.subEstado
        },
        activity_data: {
          inventario_id: item.id || item.inventario_id,
          usuario_id: 1,
          descripcion: `${item.nombre_unidad || item.title} movido a ${estadoDestino.estado}`,
          estado_nuevo: estadoDestino.estado,
          sub_estado_nuevo: estadoDestino.subEstado
        }
      }];
      
      const result = await bulkOperations.bulkStateChangeWithActivities(updates);
      
      if (result.success === 0 && result.errors.length > 0) {
        throw new Error(result.errors[0]);
      }
      
      console.log(`✅ [OPTIMIZADO] Actividad y estado actualizados para ${item.nombre_unidad || item.title}`);

      // Si el destino es Inspección, crear un temporizador de 36h para la inspección
      try {
        if (destino === 'inspeccion' && typeof createInspectionTimer === 'function') {
          const id = item.id || item.inventario_id;
          const nombre = item.nombre_unidad || item.title;
          if (id) {
            createInspectionTimer(id, nombre);
          }
        }
      } catch (timerErr) {
        console.warn('⚠️ No se pudo crear el temporizador de inspección:', timerErr);
      }
      
    } catch (error: any) {
      console.error('❌ Error creando actividad de movimiento:', error);
      throw error;
    }
  };

  return {
    onDragEnd,
    moverGrupoTicsAPreAcondicionamiento
  };
};
