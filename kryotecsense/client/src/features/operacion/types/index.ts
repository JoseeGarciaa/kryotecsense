// Archivo: client/src/features/operacion/types/index.ts

// Interfaz para un item del inventario en el Kanban, alineada con el backend
export interface Item {
  id: string | number;
  category: string;
  title: string;
  description: string;
  assignee: Array<{name: string; avatar: string}>;
  date: string;
  nombre_unidad?: string;
  rfid_padre?: string;
  estado?: string;
  sub_estado?: string;
  ultima_actualizacion?: string;
  tipo?: string;
  tipo_base?: string;
  items_grupo?: any[];
  es_grupo?: boolean;
  volumen?: number;
  lote?: string;
  modelo?: any;
  nivel_grupo?: number;
}

// Interfaz para una columna del Kanban
export interface Column {
  name: string;
  items: Item[];
}

// Interfaz para el conjunto de columnas del Kanban
export interface Columns {
  [key: string]: Column;
}
