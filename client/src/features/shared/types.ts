export interface Credocube {
  id: number;
  modelo_id: number;
  nombre_unidad: string;
  rfid: string;
  lote: string | null;
  estado: string;
  sub_estado: string | null;
  validacion_limpieza: string | null;
  validacion_goteo: string | null;
  validacion_desinfeccion: string | null;
  categoria: string | null;
  fecha_ingreso: string | null;
  ultima_actualizacion: string | null;
  fecha_vencimiento: string | null;
  activo: boolean;
}

export interface ModeloCredcube {
  modelo_id: number;
  nombre_modelo: string;
  volumen_litros: number | null;
  descripcion: string | null;
  dim_ext_frente: number | null;
  dim_ext_profundo: number | null;
  dim_ext_alto: number | null;
  dim_int_frente: number | null;
  dim_int_profundo: number | null;
  dim_int_alto: number | null;
  tic_frente: number | null;
  tic_alto: number | null;
  peso_total_kg: number | null;
  tipo: string | null;
}
