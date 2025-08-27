import { useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';

interface DecodedToken {
  sub: string;  // correo del usuario
  id: number;
  rol: string;
  tenant: string; // esquema del tenant
  exp: number;
}

interface AuthUser {
  correo: string;
  id: number;
  rol: string;
  tenant: string;
  isAuthenticated: boolean;
}

export const useAuth = () => {
  const [usuario, setUsuario] = useState<AuthUser>({
    correo: '',
    id: 0,
    rol: '',
    tenant: '',
    isAuthenticated: false
  });

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    
    if (token) {
      try {
        const decodedToken = jwtDecode<DecodedToken>(token);
        const currentTime = Date.now() / 1000;
        
        if (decodedToken.exp > currentTime) {
          setUsuario({
            correo: decodedToken.sub,
            id: decodedToken.id,
            rol: decodedToken.rol,
            tenant: decodedToken.tenant || 'tenant_base',
            isAuthenticated: true
          });
        } else {
          // Token expirado
          localStorage.removeItem('accessToken');
          setUsuario({
            correo: '',
            id: 0,
            rol: '',
            tenant: '',
            isAuthenticated: false
          });
        }
      } catch (error) {
        console.error('Error al decodificar el token:', error);
        localStorage.removeItem('accessToken');
      }
    }
  }, []);

  return usuario;
};
