import React from 'react';
import { Bell, CheckCircle, AlertCircle, Clock, Trash2 } from 'lucide-react';
import { useAlertas } from '../../../shared/hooks/useAlertas';
import { useAuth } from '../../../shared/hooks/useAuth';

const Notificaciones: React.FC = () => {
  const { alertas, alertasNoLeidas, cantidadNoLeidas, marcarComoResuelta, eliminarAlerta, cargando } = useAlertas();
  const usuario = useAuth();

  const getAlertIcon = (tipoAlerta: string) => {
    if (tipoAlerta.includes('TIMER')) return Clock;
    if (tipoAlerta.includes('ERROR')) return AlertCircle;
    return Bell;
  };

  const getAlertColor = (tipoAlerta: string) => {
    if (tipoAlerta.includes('ATEMPERAMIENTO')) return 'border-l-orange-400 bg-orange-50 dark:bg-orange-900/20';
    if (tipoAlerta.includes('CONGELAMIENTO')) return 'border-l-blue-400 bg-blue-50 dark:bg-blue-900/20';
    if (tipoAlerta.includes('ERROR')) return 'border-l-red-400 bg-red-50 dark:bg-red-900/20';
    return 'border-l-gray-400 bg-gray-50 dark:bg-gray-900/20';
  };

  const formatearFecha = (fecha: string) => {
    return new Date(fecha).toLocaleString('es-ES', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleMarcarResuelta = async (alertaId: number) => {
    await marcarComoResuelta(alertaId);
  };

  const handleEliminarAlerta = async (alertaId: number) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar esta alerta? Esta acción no se puede deshacer.')) {
      const exito = await eliminarAlerta(alertaId);
      if (!exito) {
        alert('Error al eliminar la alerta. Inténtalo de nuevo.');
      }
    }
  };

  // Verificar si el usuario es administrador
  const esAdministrador = usuario?.rol === 'administrador' || usuario?.rol === 'admin';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">Notificaciones</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Centro de notificaciones y alertas del sistema
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-primary-100 dark:bg-primary-900 px-3 py-2 rounded-lg">
            <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
              {cantidadNoLeidas} sin leer
            </span>
          </div>
        </div>
      </div>

      {/* Estadísticas rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-light-card dark:bg-dark-card p-6 rounded-lg border border-light-border dark:border-dark-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total de Alertas</p>
              <p className="text-2xl font-bold text-blue-600">{alertas.length}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
              <Bell className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-light-card dark:bg-dark-card p-6 rounded-lg border border-light-border dark:border-dark-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">No Leídas</p>
              <p className="text-2xl font-bold text-orange-600">{cantidadNoLeidas}</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900 rounded-lg flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>

        <div className="bg-light-card dark:bg-dark-card p-6 rounded-lg border border-light-border dark:border-dark-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Resueltas</p>
              <p className="text-2xl font-bold text-green-600">{alertas.filter(a => a.resuelta).length}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Lista de Notificaciones */}
      <div className="bg-light-card dark:bg-dark-card rounded-lg border border-light-border dark:border-dark-border">
        <div className="p-6 border-b border-light-border dark:border-dark-border">
          <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">
            Todas las Notificaciones
          </h2>
        </div>

        <div className="divide-y divide-light-border dark:divide-dark-border">
          {cargando ? (
            <div className="p-8 text-center text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
              Cargando notificaciones...
            </div>
          ) : alertas.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Bell className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-lg font-medium text-gray-600 dark:text-gray-400">No hay notificaciones</p>
              <p className="text-sm text-gray-500">Cuando recibas alertas aparecerán aquí</p>
            </div>
          ) : (
            alertas.map((alerta) => {
              const Icon = getAlertIcon(alerta.tipo_alerta);
              const colorClass = getAlertColor(alerta.tipo_alerta);
              
              return (
                <div
                  key={alerta.id}
                  className={`p-6 ${colorClass} border-l-4 ${!alerta.resuelta ? 'font-medium' : 'opacity-75'}`}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <Icon size={20} className="text-gray-600 dark:text-gray-400 mt-1" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                            {alerta.descripcion}
                          </p>
                          
                          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                            <span>{formatearFecha(alerta.fecha_creacion)}</span>
                            <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full">
                              {alerta.tipo_alerta}
                            </span>
                            {alerta.inventario_id && (
                              <span>ID Inventario: {alerta.inventario_id}</span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 ml-4">
                          {alerta.resuelta ? (
                            <div className="flex items-center gap-1 text-green-600">
                              <CheckCircle size={16} />
                              <span className="text-xs">Resuelta</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleMarcarResuelta(alerta.id)}
                              className="flex items-center gap-1 px-3 py-1 text-xs text-green-600 hover:text-green-800 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-green-500"
                              title="Marcar como resuelta"
                            >
                              <CheckCircle size={14} />
                              Resolver
                            </button>
                          )}
                          
                          {/* Botón de eliminar solo para administradores */}
                          {esAdministrador && (
                            <button
                              onClick={() => handleEliminarAlerta(alerta.id)}
                              className="flex items-center gap-1 px-3 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                              title="Eliminar alerta (solo administradores)"
                            >
                              <Trash2 size={14} />
                              Eliminar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default Notificaciones;
