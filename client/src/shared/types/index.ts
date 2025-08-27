export interface Usuario {
  id: number;
  nombre: string;
  correo: string;
  rol: string;
}

export interface PropiedadesDashboard {
  alCerrarSesion?: () => void;
}

export interface TemaContexto {
  tema: 'claro' | 'oscuro';
  alternarTema: () => void;
}

export interface EstadoAutenticacion {
  estaAutenticado: boolean;
  usuario: Usuario | null;
  cargando: boolean;
}

export interface PropiedadesLogin {
  alIniciarSesion: () => void;
}

export type Tema = 'claro' | 'oscuro';

export interface ConfiguracionUsuario {
  tema: Tema;
  notificaciones: boolean;
  idioma: string;
}

export interface ModeloCredcube {
  id: number;
  modelo_id: number;
  nombre_modelo: string;
  volumen_litros: number;
  modo_disponible: boolean;
  descripcion?: string | null;
  dim_ext_frente: number;
  dim_ext_profundo: number;
  dim_ext_alto: number;
  dim_int_frente: number;
  dim_int_profundo: number;
  dim_int_alto: number;
  tic_frente: number;
  tic_alto: number;
  cantidad_tics: number;
  peso_total_kg: number;
  precio_unitario_venta: number;
  precio_unitario_alquiler: number;
  tipo?: string | null; // Nueva propiedad para el tipo del modelo
}

export interface Credocube {
  id: number;
  nombre_unidad: string;
  rfid_padre: string;
  modelo_id: number | null;
  rfid_hijo_1: string | null;
  rfid_hijo_2: string | null;
  rfid_hijo_3: string | null;
  rfid_hijo_4: string | null;
  rfid_hijo_5: string | null;
  rfid_hijo_6: string | null;
  rfid_hijo_7: string | null;
  estado: string;
  sub_estado: string | null;
  validacion_limpieza: string | null;
  validacion_goteo: string | null;
  validacion_desinfeccion: string | null;
  activo: boolean;
  fecha_ingreso: string; // O Date, si se convierte
  ultima_actualizacion: string; // O Date, si se convierte
}