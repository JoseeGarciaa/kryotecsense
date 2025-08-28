import { useState } from 'react';
import { PropiedadesDashboard } from '../../../shared/types';
import Navbar from '../../../shared/components/Navbar';
import Inicio from './Inicio';
import RegistroMejorado from '../../registro/components/RegistroMejorado';
import Inventario from '../../inventario/components/Inventario';
import Operacion from '../../operacion/components/Operacion';
import { Devolucion } from '../../devolucion';
import { Inspeccion } from '../../inspeccion';
import Administracion from '../../administracion/components/Administracion';
import Reportes from '../../reportes/components/Reportes';
import Configuracion from '../../configuracion/components/Configuracion';
import Notificaciones from '../../notificaciones/components/Notificaciones';

const Dashboard: React.FC<PropiedadesDashboard> = ({ alCerrarSesion }) => {
  const [seccionActiva, setSeccionActiva] = useState('inicio');

  const handleCerrarSesion = () => {
    localStorage.removeItem('accessToken');
    if (alCerrarSesion) {
      alCerrarSesion();
    }
    window.location.href = '/login';
  };

  const renderSeccionActiva = () => {
    // Verificar si la sección activa es una subsección de operación
    if (seccionActiva.startsWith('operacion/')) {
      const fase = seccionActiva.split('/')[1];
      // Manejar las fases especiales por separado
      if (fase === 'devolucion') {
        return <Devolucion />;
      }
      if (fase === 'inspeccion') {
        return <Inspeccion />;
      }
      return <Operacion fase={fase} />;
    }
    
    switch (seccionActiva) {
      case 'inicio':
        return <Inicio />;
      case 'registro':
        return <RegistroMejorado />;
      case 'inventario':
        return <Inventario />;
      case 'operacion':
        return <Operacion />;
      case 'administracion':
        return <Administracion />;
      case 'reportes':
        return <Reportes />;
      case 'configuracion':
        return <Configuracion />;
      case 'notificaciones':
        return <Notificaciones />;
      default:
        return <Inicio />;
    }
  };

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg">
      <Navbar 
        seccionActiva={seccionActiva}
        onSeccionChange={setSeccionActiva}
        onCerrarSesion={handleCerrarSesion}
      />
      
      {/* Main content */}
      <div className={`md:pl-64 transition-all duration-300`}>
        <main className="p-6">
          {renderSeccionActiva()}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
