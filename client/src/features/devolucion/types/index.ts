export interface ItemDevolucion {
  id: number;
  nombre_unidad: string;
  rfid: string;
  lote?: string;
  categoria: 'TIC' | 'VIP' | 'Cube';
  estado: string;
  sub_estado: string;
  fecha_ingreso?: string;
  ultima_actualizacion?: string;
  fecha_devolucion?: string;
  modelo_id?: number;
  validacion_limpieza?: string;
  validacion_goteo?: string;
  validacion_desinfeccion?: string;
  activo?: boolean;
}

export interface ItemEscaneado {
  id: number | string;
  codigo: string;
  rfid: string;
  nombre_unidad: string;
  categoria: 'TIC' | 'VIP' | 'Cube';
  timestamp: string;
}

export interface DevolucionStats {
  totalPendientes: number;
  totalDevueltos: number;
  porCategoria: {
    cubes: number;
    vips: number;
    tics: number;
  };
}

export interface DevolucionRequest {
  items: ItemEscaneado[];
  usuario_id: number;
  observaciones?: string;
}

export interface DevolucionResponse {
  success: boolean;
  items_procesados: number;
  errores: string[];
  timestamp: string;
}

export interface ActividadDevolucion {
  inventario_id: number;
  usuario_id: number;
  descripcion: string;
  estado_nuevo: string;
  sub_estado_nuevo: string;
  timestamp?: string;
}

export interface EstadoUpdate {
  estado: string;
  sub_estado: string;
}

// Estados específicos para devolución
export const ESTADOS_DEVOLUCION = {
  PENDIENTE: 'En bodega',
  DEVUELTO: 'Devolución'
} as const;

export const SUB_ESTADOS_DEVOLUCION = {
  DISPONIBLE: 'Disponible',
  DEVUELTO: 'Devuelto'
} as const;

// Categorías de items
export const CATEGORIAS_ITEMS = {
  TIC: 'TIC',
  VIP: 'VIP',
  CUBE: 'Cube'
} as const;

export type EstadoDevolucion = typeof ESTADOS_DEVOLUCION[keyof typeof ESTADOS_DEVOLUCION];
export type SubEstadoDevolucion = typeof SUB_ESTADOS_DEVOLUCION[keyof typeof SUB_ESTADOS_DEVOLUCION];
export type CategoriaItem = typeof CATEGORIAS_ITEMS[keyof typeof CATEGORIAS_ITEMS];
