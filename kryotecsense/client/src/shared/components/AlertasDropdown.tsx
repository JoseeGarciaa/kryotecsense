import React, { useState, useRef, useEffect } from 'react';
import { Bell, X, CheckCircle, AlertCircle, Clock, MoreHorizontal, Trash2 } from 'lucide-react';
import { useAlertas, Alerta } from '../hooks/useAlertas';
import { useOnClickOutside } from '../hooks/useOnClickOutside';

interface AlertasDropdownProps {
  className?: string;
}

const AlertasDropdown: React.FC<AlertasDropdownProps> = ({ className = '' }) => {
  const { alertas, alertasNoLeidas, cantidadNoLeidas, marcarComoResuelta, eliminarAlerta, cargando } = useAlertas();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAlertas, setSelectedAlertas] = useState<Set<number>>(new Set());
  const [selectAllMode, setSelectAllMode] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Cerrar el dropdown cuando se hace clic fuera
  useOnClickOutside(dropdownRef, () => {
    setIsOpen(false);
  });

  const getAlertIcon = (tipoAlerta: string) => {
    if (tipoAlerta && tipoAlerta.includes('TIMER')) return Clock;
  if (tipoAlerta && tipoAlerta.includes('ERROR')) return AlertCircle;
    return Bell;
  };

  const getAlertColor = (tipoAlerta: string) => {
    if (tipoAlerta && tipoAlerta.includes('ATEMPERAMIENTO')) return 'border-orange-400 bg-orange-50';
  if (tipoAlerta && tipoAlerta.includes('CONGELAMIENTO')) return 'border-blue-400 bg-blue-50';
  if (tipoAlerta && tipoAlerta.includes('ERROR')) return 'border-red-400 bg-red-50';
    return 'border-gray-400 bg-gray-50';
  };

  const formatearFecha = (fecha: string) => {
    return new Date(fecha).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleToggleDropdown = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    console.log('🔔 Toggle dropdown clicked, current state:', isOpen);
    setIsOpen(!isOpen);
  };

  const handleMarcarResuelta = async (alertaId: number, event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    console.log('✅ Marcando alerta como resuelta:', alertaId);
    await marcarComoResuelta(alertaId);
    // Limpiar selección si esta alerta estaba seleccionada
    setSelectedAlertas(prev => {
      const newSet = new Set(prev);
      newSet.delete(alertaId);
      return newSet;
    });
  };

  // Manejar selección individual de alerta
  const handleSelectAlerta = (alertaId: number, isSelected: boolean) => {
    setSelectedAlertas(prev => {
      const newSet = new Set(prev);
      if (isSelected) {
        newSet.add(alertaId);
      } else {
        newSet.delete(alertaId);
      }
      return newSet;
    });
  };

  // Eliminada funcionalidad de selección múltiple

  // Marcar todas las alertas seleccionadas como leídas
  const handleMarcarSeleccionadasComoLeidas = async () => {
    const promises = Array.from(selectedAlertas).map(alertaId => marcarComoResuelta(alertaId));
    await Promise.all(promises);
    setSelectedAlertas(new Set());
  };

  // Eliminar todas las alertas seleccionadas
  const handleEliminarSeleccionadas = async () => {
    if (eliminarAlerta) {
      const promises = Array.from(selectedAlertas).map(alertaId => eliminarAlerta(alertaId));
      await Promise.all(promises);
      setSelectedAlertas(new Set());
    }
  };

  // Resetear selección cuando se cierre el dropdown
  useEffect(() => {
    if (!isOpen) {
      setSelectedAlertas(new Set());
    }
  }, [isOpen]);

  // Debug: mostrar estado en consola
  useEffect(() => {
    console.log('🔔 AlertasDropdown - Estado:', { isOpen, cantidadNoLeidas, totalAlertas: alertas.length });
  }, [isOpen, cantidadNoLeidas, alertas.length]);

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* Botón de campana con badge */}
      <button
        onClick={handleToggleDropdown}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
        title="Alertas"
        type="button"
      >
        <Bell size={20} />
        {cantidadNoLeidas > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
            {cantidadNoLeidas > 9 ? '9+' : cantidadNoLeidas}
          </span>
        )}
      </button>

      {/* Dropdown de alertas */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-semibold text-gray-900">Alertas</h3>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                }}
                className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <X size={18} />
              </button>
            </div>
            
            {/* Eliminado: selección múltiple y controles relacionados */}
          </div>

          {/* Lista de alertas */}
          <div className="max-h-80 overflow-y-auto">
            {cargando ? (
              <div className="p-4 text-center text-gray-500">
                Cargando alertas...
              </div>
            ) : alertas.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                No hay alertas
              </div>
            ) : (
              alertas.slice(0, 10).map((alerta: Alerta) => {
                const Icon = getAlertIcon(alerta.tipo_alerta);
                const colorClass = getAlertColor(alerta.tipo_alerta);
                const isSelected = selectedAlertas.has(alerta.id);
                
                return (
                  <div
                    key={alerta.id}
                    className={`p-3 border-l-4 ${colorClass} ${!alerta.resuelta ? 'font-medium' : 'opacity-75'} hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => handleSelectAlerta(alerta.id, !isSelected)}
                        className="mt-1 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {isSelected ? (
                          <CheckCircle size={16} className="text-blue-600" />
                        ) : (
                          <div className="w-4 h-4 border-2 border-gray-300 rounded"></div>
                        )}
                      </button>
                      <Icon size={16} className="mt-1 text-gray-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 mb-1">
                          {alerta.descripcion}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">
                            {formatearFecha(alerta.fecha_creacion)}
                          </span>
                          {!alerta.resuelta && !isSelected && (
                            <button
                              onClick={(e) => handleMarcarResuelta(alerta.id, e)}
                              className="text-xs text-green-600 hover:text-green-800 flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-green-500 rounded px-2 py-1"
                              title="Marcar como resuelta"
                            >
                              <CheckCircle size={12} />
                              Resolver
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {alertas.length > 10 && (
            <div className="px-4 py-2 border-t border-gray-200 text-center">
              <span className="text-xs text-gray-500">
                Mostrando 10 de {alertas.length} alertas
              </span>
            </div>
          )}
        </div>
      )}

    </div>
  );
};

export default AlertasDropdown;
