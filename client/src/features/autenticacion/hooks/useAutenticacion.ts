import { useState } from 'react';
import { EstadoAutenticacion } from '../../../shared/types';

export const useAutenticacion = () => {
  const [estado, setEstado] = useState<EstadoAutenticacion>({
    estaAutenticado: false,
    usuario: null,
    cargando: false
  });

  const iniciarSesion = async (email: string, password: string) => {
    setEstado(prev => ({ ...prev, cargando: true }));
    
    // Simular llamada a API
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        setEstado({
          estaAutenticado: true,
          usuario: {
            id: 1,
            correo: email,
            nombre: 'Usuario Demo',
            rol: 'admin'
          },
          cargando: false
        });
        resolve();
      }, 1000);
    });
  };

  const cerrarSesion = () => {
    setEstado({
      estaAutenticado: false,
      usuario: null,
      cargando: false
    });
  };

  return {
    estado,
    iniciarSesion,
    cerrarSesion
  };
};