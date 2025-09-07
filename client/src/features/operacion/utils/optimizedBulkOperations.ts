/**
 * Utilidades optimizadas para operaciones en lote.
 * Acelera los cambios de estado usando paralelismo y procesamiento por lotes.
 */

import { apiServiceClient } from '../../../api/apiClient';

export interface BulkStateUpdate {
  id: number;
  estado?: string;
  sub_estado?: string;
}

export interface BulkActivityData {
  inventario_id?: number;
  usuario_id?: number;
  descripcion: string;
  estado_nuevo: string;
  sub_estado_nuevo?: string;
}

export interface BulkUpdateResponse {
  success: number;
  errors: string[];
  total: number;
}

export class OptimizedBulkOperations {
  private readonly BATCH_SIZE = 50; // Procesar en lotes de 50 items
  private readonly MAX_PARALLEL_REQUESTS = 5;

  /**
   * Actualiza múltiples items de inventario en lotes optimizados.
   */
  async bulkUpdateInventoryStates(updates: BulkStateUpdate[]): Promise<BulkUpdateResponse> {
    console.log(`🚀 Iniciando actualización optimizada de ${updates.length} items`);
    
    try {
      const response = await apiServiceClient.post('/inventory/inventario/bulk-update', {
        updates: updates
      });
      
      console.log(`✅ Actualización en lote completada: ${response.data.success}/${response.data.total} exitosos`);
      return response.data;
      
    } catch (error: any) {
      console.error('❌ Error en actualización en lote:', error);
      throw new Error(`Error en actualización masiva: ${error.response?.data?.detail || error.message}`);
    }
  }

  /**
   * Crea múltiples actividades en lotes optimizados.
   */
  async bulkCreateActivities(activities: BulkActivityData[]): Promise<BulkUpdateResponse> {
    console.log(`🚀 Iniciando creación optimizada de ${activities.length} actividades`);
    
    try {
      const response = await apiServiceClient.post('/inventory/inventario/bulk-activities', {
        activities: activities
      });
      
      console.log(`✅ Creación en lote completada: ${response.data.success}/${response.data.total} exitosos`);
      return response.data;
      
    } catch (error: any) {
      console.error('❌ Error en creación en lote:', error);
      throw new Error(`Error en creación masiva: ${error.response?.data?.detail || error.message}`);
    }
  }

  /**
   * Ejecuta cambios de estado + actividades en paralelo (la más optimizada).
   */
  async bulkStateChangeWithActivities(updates: Array<{
    id: number;
    inventory_data?: { estado?: string; sub_estado?: string };
    activity_data?: BulkActivityData;
  }>): Promise<BulkUpdateResponse> {
    console.log(`🚀 Iniciando operación paralela optimizada para ${updates.length} items`);
    
    try {
      const response = await apiServiceClient.post('/inventory/inventario/bulk-state-change', updates);
      
      console.log(`✅ Operación paralela completada: ${response.data.success}/${response.data.total} exitosos`);
      return response.data;
      
    } catch (error: any) {
      console.error('❌ Error en operación paralela:', error);
      throw new Error(`Error en operación masiva: ${error.response?.data?.detail || error.message}`);
    }
  }

  /**
   * Procesa una lista grande de items dividiéndola en lotes más pequeños para evitar timeouts.
   */
  async processInBatches<T, R>(
    items: T[],
    processor: (batch: T[]) => Promise<R>,
    batchSize: number = this.BATCH_SIZE
  ): Promise<R[]> {
    console.log(`🔄 Procesando ${items.length} items en lotes de ${batchSize}`);
    
    const results: R[] = [];
    const batches: T[][] = [];
    
    // Dividir en lotes
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    
    // Procesar lotes con límite de paralelismo
    for (let i = 0; i < batches.length; i += this.MAX_PARALLEL_REQUESTS) {
      const currentBatches = batches.slice(i, i + this.MAX_PARALLEL_REQUESTS);
      
      const batchPromises = currentBatches.map((batch, index) => {
        const batchNumber = i + index + 1;
        console.log(`⚡ Procesando lote ${batchNumber}/${batches.length} (${batch.length} items)`);
        return processor(batch);
      });
      
      try {
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        console.log(`✅ Lotes ${i + 1}-${Math.min(i + this.MAX_PARALLEL_REQUESTS, batches.length)} completados`);
      } catch (error) {
        console.error(`❌ Error en lotes ${i + 1}-${Math.min(i + this.MAX_PARALLEL_REQUESTS, batches.length)}:`, error);
        throw error;
      }
    }
    
    return results;
  }

  /**
   * Optimización específica para drag & drop de múltiples items.
   */
  async optimizedDragDropStateChange(
    items: any[],
    newState: string,
    newSubState?: string
  ): Promise<{ success: number; errors: string[] }> {
    console.log(`🎯 Optimizando drag & drop para ${items.length} items hacia ${newState}`);
    
    try {
      // Preparar datos para operación paralela
    const updates = items.map(item => ({
        id: item.id || item.inventario_id,
        inventory_data: {
      estado: newState,
      // Evitar el genérico "En proceso": usar subEstado provisto o un valor explícito por estado
  sub_estado: ((): string | undefined => {
        if (newSubState) return newSubState;
        switch (newState) {
          case 'Pre acondicionamiento':
            return 'Congelación';
          case 'Acondicionamiento':
            return 'Ensamblaje';
          case 'Operación':
          case 'operación':
            return 'En transito';
          case 'Devolución':
            return 'Pendiente';
          case 'Inspección':
            return 'Pendiente';
          case 'En bodega':
            return 'Disponible';
          default:
    return undefined;
        }
      })(),
      // Cuando regresan a bodega, limpiar el lote anterior
      ...(newState === 'En bodega' ? { lote: null } : {})
        },
        activity_data: {
          inventario_id: item.id || item.inventario_id,
          usuario_id: 1,
      descripcion: `${item.nombre_unidad || item.title} movido a ${newState}${newState === 'En bodega' ? ' (lote limpiado)' : ''}`,
          estado_nuevo: newState,
      sub_estado_nuevo: ((): string | undefined => {
            if (newSubState) return newSubState;
            switch (newState) {
              case 'Pre acondicionamiento':
                return 'Congelación';
              case 'Acondicionamiento':
                return 'Ensamblaje';
              case 'Operación':
              case 'operación':
                return 'En transito';
              case 'Devolución':
                return 'Pendiente';
              case 'Inspección':
                return 'Pendiente';
              case 'En bodega':
                return 'Disponible';
              default:
        return undefined;
            }
          })()
        }
      }));
      
      // Ejecutar operación optimizada
      const result = await this.bulkStateChangeWithActivities(updates);
      
      // Mostrar resultados
      if (result.success > 0) {
        const message = result.success === 1 
          ? `✅ 1 item movido a ${newState} exitosamente`
          : `✅ ${result.success} items movidos a ${newState} exitosamente`;
        
        if (result.errors.length > 0) {
          console.warn(`⚠️ ${message}, pero hubo ${result.errors.length} errores:`, result.errors);
        } else {
          console.log(message);
        }
      }
      
      return {
        success: result.success,
        errors: result.errors
      };
      
    } catch (error: any) {
      console.error('❌ Error en drag & drop optimizado:', error);
      throw error;
    }
  }

  /**
   * Optimización para mover items a bodega (operación común y lenta).
   */
  async optimizedMoveToBodega(items: any[]): Promise<{ success: number; errors: string[] }> {
    console.log(`🏠 Optimizando movimiento a bodega para ${items.length} items`);
    
    return this.optimizedDragDropStateChange(items, 'En bodega', undefined);
  }

  /**
   * Optimización para operaciones de Pre acondicionamiento.
   */
  async optimizedMoveToPreAcondicionamiento(
    items: any[],
    subEstado: 'Congelación' | 'Atemperamiento' = 'Congelación'
  ): Promise<{ success: number; errors: string[] }> {
    console.log(`❄️ Optimizando movimiento a Pre acondicionamiento (${subEstado}) para ${items.length} items`);
    
    return this.optimizedDragDropStateChange(items, 'Pre acondicionamiento', subEstado);
  }

  /**
   * Optimización para operaciones de acondicionamiento.
   */
  async optimizedMoveToAcondicionamiento(
    items: any[],
    subEstado: string = 'Ensamblaje'
  ): Promise<{ success: number; errors: string[] }> {
    console.log(`🌡️ Optimizando movimiento a acondicionamiento (${subEstado}) para ${items.length} items`);
    
    return this.optimizedDragDropStateChange(items, 'Acondicionamiento', subEstado);
  }
}

// Exportar instancia singleton
export const bulkOperations = new OptimizedBulkOperations();

/**
 * Hook para usar operaciones optimizadas en componentes React.
 */
export const useOptimizedOperations = () => {
  const executeOptimizedDragDrop = async (
    items: any[],
    targetState: string,
    targetSubState?: string
  ) => {
    try {
      const result = await bulkOperations.optimizedDragDropStateChange(
        items,
        targetState,
        targetSubState
      );
      
      return {
        success: result.success > 0,
        message: result.success === 1 
          ? `✅ 1 item movido exitosamente`
          : `✅ ${result.success} items movidos exitosamente`,
        errors: result.errors
      };
      
    } catch (error: any) {
      return {
        success: false,
        message: `❌ Error: ${error.message}`,
        errors: [error.message]
      };
    }
  };

  return {
    executeOptimizedDragDrop,
    bulkOperations
  };
};
