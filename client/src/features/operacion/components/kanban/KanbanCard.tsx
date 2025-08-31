import React, { useState, useEffect } from 'react';
import { MoreHorizontal, Clock, ArrowLeft, Play, Pause } from 'lucide-react';
import TimeConfigModal from '../TimeConfigModal';

// Using a flexible 'any' type for the item prop to avoid type conflicts for now.
// This allows the component to render without strict type checking, which we can refine later.
interface KanbanCardProps {
    item: any;
    index: number;
    onCardClick?: (item: any, columnId?: string) => void;
    // Props para cronómetro (opcionales)
  obtenerTiempoRestante?: (itemId: string) => React.ReactNode;
    iniciarCronometro?: (itemId: string, horas: number, minutos: number) => void;
    detenerCronometro?: (itemId: string) => void;
    moverABodega?: (item: any) => void;
    columnId?: string;
  isViewOnly?: boolean;
    // Props para selección múltiple
    modoSeleccionMultiple?: boolean;
    estaSeleccionado?: boolean;
    onToggleSeleccion?: (item: any) => void;
}

const KanbanCard: React.FC<KanbanCardProps> = ({
  item,
  index,
  onCardClick,
  obtenerTiempoRestante,
  iniciarCronometro,
  detenerCronometro,
  moverABodega,
  columnId,
  isViewOnly,
  modoSeleccionMultiple,
  estaSeleccionado,
  onToggleSeleccion
}) => {
  const [mostrarModalTiempo, setMostrarModalTiempo] = useState(false);
  
  // Renderizar tiempo de forma directa; el componente que retorna puede animarse internamente (InlineCountdown)
  const tiempoRestante = ((): React.ReactNode => {
    const mostrarTimerEnOperacion = columnId === 'operacion' && !isViewOnly;
    const mostrarTimerEnPre = columnId === 'pre-acondicionamiento';
    if (
      obtenerTiempoRestante &&
      item?.id &&
      (mostrarTimerEnPre || mostrarTimerEnOperacion) &&
      item.id.toString().startsWith('TIC')
    ) {
      return obtenerTiempoRestante(item.id.toString());
    }
    return '';
  })();
  
  // Solo log esencial para debug si es necesario
  // console.log(`🏇 KanbanCard ${index}:`, item.title);
    
  // Todas las tarjetas ahora son no arrastrables
  return (
    <div
      onClick={(e) => {
        console.log('💆 Card clicked:', {
          id: item.id,
          title: item.title,
          es_grupo: item.es_grupo,
          es_proceso_principal: item.es_proceso_principal,
          onCardClick: !!onCardClick,
          modoSeleccionMultiple: modoSeleccionMultiple
        });
        
        // Si estamos en modo selección múltiple, manejar selección
        if (modoSeleccionMultiple && onToggleSeleccion) {
          // Verificar que no sea un grupo del sistema
          const esGrupoSistema = typeof item.id === 'string' && 
                                 (item.id === 'ensamblaje-grupo' || item.id === 'listo-despacho-grupo');
          
          if (!esGrupoSistema) {
            e.preventDefault();
            e.stopPropagation();
            onToggleSeleccion(item);
            return;
          }
        }
        
        // Comportamiento normal de click
        if (onCardClick) {
          e.preventDefault();
          e.stopPropagation();
          onCardClick(item, columnId);
        }
      }}
      className={`bg-white p-3 sm:p-4 mb-3 rounded-lg shadow-sm border transition-all duration-200 hover:shadow-md ${
        estaSeleccionado 
          ? 'border-blue-500 bg-blue-50 shadow-md' 
          : 'border-gray-200'
      } ${
        item.es_grupo 
          ? 'cursor-pointer hover:bg-blue-50 border-blue-200' 
          : modoSeleccionMultiple 
            ? 'cursor-pointer hover:bg-gray-50' 
            : ''
      }`}>
      {/* Contenido de la tarjeta */}
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          {/* Checkbox para selección múltiple */}
          {modoSeleccionMultiple && (
            <input
              type="checkbox"
              checked={estaSeleccionado || false}
              onChange={() => {}} // El onChange se maneja en el onClick del div padre
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
              onClick={(e) => e.stopPropagation()} // Evitar doble trigger
              aria-label={`Seleccionar ${item.title || 'item'}`}
            />
          )}
          <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
            {item.category}
          </span>
        </div>
        <button aria-label="Options" className="text-gray-400 hover:text-gray-600 p-1">
          <MoreHorizontal size={16} />
        </button>
      </div>

      <h3 className="font-bold text-gray-800 mb-1 text-sm sm:text-base leading-tight">{item.title}</h3>
      <p className="text-xs sm:text-sm text-gray-600 mb-3 line-clamp-2">{item.description}</p>
      
      {/* Cronómetro y botones para pre-acondicionamiento */}
  {(!isViewOnly && (columnId === 'pre-acondicionamiento' || columnId === 'operacion')) && (
        <div className="mb-3 p-2 bg-orange-50 rounded border">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-orange-600" />
              <span className="text-xs font-medium text-orange-700">
                {tiempoRestante || 'Sin tiempo'}
              </span>
            </div>
            <div className="flex gap-1">
              {!tiempoRestante && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMostrarModalTiempo(true);
                  }}
                  className="p-1 rounded-full bg-green-100 hover:bg-green-200 text-green-600"
                  title="Iniciar cronómetro"
                >
                  <Play size={12} />
                </button>
              )}
              {tiempoRestante && tiempoRestante !== '¡Listo!' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (detenerCronometro && item.id) {
                      detenerCronometro(item.id.toString());
                    }
                  }}
                  className="p-1 rounded-full bg-red-100 hover:bg-red-200 text-red-600"
                  title="Detener cronómetro"
                >
                  <Pause size={12} />
                </button>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (moverABodega) {
                  moverABodega(item);
                }
              }}
              className="text-xs py-1 px-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded flex items-center gap-1"
            >
              <ArrowLeft size={10} />
              Mover a bodega
            </button>
          </div>
        </div>
      )}

      {/* Botón "Devolver a bodega" para otras fases (excepto bodega) */}
      {columnId && columnId !== 'en-bodega' && columnId !== 'pre-acondicionamiento' && moverABodega && (
        <div className="mb-3 p-2 bg-gray-50 rounded border border-gray-200">
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-600 font-medium">Opciones:</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                console.log('🔴 Click en botón "Devolver a bodega":', {
                  item: item,
                  columnId: columnId,
                  moverABodega: !!moverABodega
                });
                if (moverABodega) {
                  moverABodega(item);
                } else {
                  console.error('❌ Función moverABodega no disponible');
                }
              }}
              className="text-xs py-1.5 px-3 bg-red-100 hover:bg-red-200 text-red-700 rounded-full flex items-center gap-1 transition-all duration-200 hover:shadow-sm border border-red-200"
              title="Devolver este TIC a bodega"
            >
              <ArrowLeft size={10} />
              Devolver a bodega
            </button>
          </div>
        </div>
      )}
      
      {/* Asignados */}
      <div className="flex justify-between items-center">
        <div className="flex items-center -space-x-1">
          {item.assignee && item.assignee.slice(0, 3).map((user: { avatar: string; name: string }, i: number) => (
            <div key={i} className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center text-white text-xs font-medium">
              {user.name?.charAt(0) || 'S'}
            </div>
          ))}
          {item.assignee && item.assignee.length > 3 && (
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gray-400 border-2 border-white flex items-center justify-center text-white text-xs font-medium">
              +{item.assignee.length - 3}
            </div>
          )}
        </div>
        <div className="flex items-center text-xs text-gray-500">
          <span className="text-xs text-gray-400">{item.date || item.category}</span>
        </div>
      </div>
      
      {/* Modal para configurar tiempo con horas y minutos */}
      <TimeConfigModal
        isOpen={mostrarModalTiempo}
        onClose={() => setMostrarModalTiempo(false)}
        onConfirm={(horas, minutos) => {
          if (iniciarCronometro && item.id) {
            iniciarCronometro(item.id.toString(), horas, minutos);
          }
          setMostrarModalTiempo(false);
        }}
        itemName={item.nombre_unidad || item.title || 'TIC'}
      />
    </div>
  );
};

export default KanbanCard;
