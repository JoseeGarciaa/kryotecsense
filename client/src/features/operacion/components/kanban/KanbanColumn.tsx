import React, { useState } from 'react';
import KanbanCard from './KanbanCard';
import { Item, Column as ColumnType } from '../../types';
import { ArrowLeft, MoreHorizontal, Package } from 'lucide-react';
import InfoItemModal from '../InfoItemModal';

interface KanbanColumnProps {
    column: any; // Using any to bypass type issues
    items: any[]; // Using any to bypass type issues
    columnId: string;
    onCardClick?: (item: any) => void;
    // Props para cronómetro (opcionales)
    obtenerTiempoRestante?: (itemId: string) => React.ReactNode;
    iniciarCronometro?: (itemId: string, horas: number, minutos: number) => void;
    detenerCronometro?: (itemId: string) => void;
    moverABodega?: (item: any) => void;
    // Props para navegación
    grupoExpandido?: string | null;
    subgrupoExpandido?: string | null;
    setGrupoExpandido?: (grupo: string | null) => void;
    setSubgrupoExpandido?: (subgrupo: string | null) => void;
    navegacionPreAcondicionamiento?: string | null;
    setNavegacionPreAcondicionamiento?: (navegacion: string | null) => void;
    subgrupoPreAcondicionamiento?: string | null;
    navegacionAcondicionamiento?: string | null;
    setNavegacionAcondicionamiento?: (navegacion: string | null) => void;
    subgrupoAcondicionamiento?: string | null;
    volverNivelAnteriorBodega?: () => void;
    volverNivelAnteriorPreAcondicionamiento?: () => void;
    volverNivelAnteriorAcondicionamiento?: () => void;
    manejarVolverNivel?: (funcionVolver: () => void) => void;
    // Prop para determinar si estamos en vista general o específica
    isViewOnly?: boolean;
    // Función para contar timers activos
    contarTimersActivos?: (columnId: string) => { activos: number, completados: number };
    // Tiempos promedio por fase
    tiemposPromedio?: { [key: string]: { totalSegundos: number, cantidad: number, tiempoPromedio: string } };
    // Información del lote con temporizador más próximo a completarse
    infoLoteActivo?: {
        lote: string;
        totalTics: number;
        timersActivos: number;
        timersCompletados: number;
        tiempoRestante: string | null;
    } | null;
    // Nuevas props para bodega
    inventarioCompleto?: any[];
    agregarNuevoItemABodega?: (itemData: any) => Promise<boolean>;
    // Props para selección múltiple
    modoSeleccionMultiple?: boolean;
    itemsSeleccionados?: any[];
    onToggleSeleccion?: (item: any) => void;
}

const columnColors: { [key: string]: string } = {
  'default': 'border-t-primary-400',
  'pre-acondicionamiento': 'border-t-primary-600',
  'acondicionamiento': 'border-t-primary-500',
  'En transito': 'border-t-primary-400',
  'inspeccion': 'border-t-primary-300',
  'devolucion': 'border-t-primary-700',
  'en-inspeccion': 'border-t-primary-300',
};

const KanbanColumn: React.FC<KanbanColumnProps> = ({ 
  column, 
  items, 
  columnId, 
  onCardClick, 
  obtenerTiempoRestante, 
  iniciarCronometro, 
  detenerCronometro, 
  moverABodega,
  grupoExpandido,
  subgrupoExpandido,
  setGrupoExpandido,
  setSubgrupoExpandido,
  navegacionPreAcondicionamiento,
  setNavegacionPreAcondicionamiento,
  subgrupoPreAcondicionamiento,
  volverNivelAnteriorBodega,
  volverNivelAnteriorPreAcondicionamiento,
  volverNivelAnteriorAcondicionamiento,
  navegacionAcondicionamiento,
  setNavegacionAcondicionamiento,
  subgrupoAcondicionamiento,
  manejarVolverNivel,
  isViewOnly,
  contarTimersActivos,
  tiemposPromedio,
  infoLoteActivo,
  inventarioCompleto,
  agregarNuevoItemABodega,
  modoSeleccionMultiple,
  itemsSeleccionados,
  onToggleSeleccion
}) => {
    const headerColor = columnColors[column.name.toLowerCase().replace(/ /g, '-')] || columnColors['default'];
    
    // Estados para los modales
    // Eliminado el modal de agregar a bodega (no se usa)
    const [mostrarModalInfo, setMostrarModalInfo] = useState(false);
    const [filtroModalInfo, setFiltroModalInfo] = useState<'tics' | 'vips' | 'cajas' | null>(null);
    
    // Log optimizado - solo cuando hay cambios significativos
    // (Removido log constante que causaba spam en consola)

    // Modal de agregar items a bodega eliminado por requerimiento

    // Función para obtener datos de inventario de bodega
    const obtenerDatosBodega = () => {
        if (!inventarioCompleto) {
            console.log('🚨 KanbanColumn: inventarioCompleto es null/undefined');
            return { tics: [], vips: [], cajas: [] };
        }

        console.log('🔍 KanbanColumn obtenerDatosBodega: Total items:', inventarioCompleto.length);
        console.log('🔍 KanbanColumn obtenerDatosBodega: Todos los items:', inventarioCompleto);

        // Solo items que están específicamente en estado "En bodega" (case-insensitive)
        const itemsBodega = inventarioCompleto.filter(item => {
            const estado = item.estado?.toLowerCase();
            const esBodega = estado === 'en bodega';
            console.log(`🔍 Item ${item.id}: estado="${item.estado}" -> normalizado="${estado}" -> esBodega=${esBodega}`);
            return esBodega;
        });

        console.log('🏪 KanbanColumn: Items filtrados en bodega:', itemsBodega.length);
        console.log('🏪 KanbanColumn: Items bodega detalle:', itemsBodega);

        const resultado = {
            tics: itemsBodega.filter(item => {
                const categoria = item.categoria?.toLowerCase();
                const esTic = categoria === 'tic';
                console.log(`🔍 Item ${item.id}: categoria="${item.categoria}" -> normalizado="${categoria}" -> esTic=${esTic}`);
                return esTic;
            }),
            vips: itemsBodega.filter(item => {
                const categoria = item.categoria?.toLowerCase();
                const esVip = categoria === 'vip';
                console.log(`🔍 Item ${item.id}: categoria="${item.categoria}" -> normalizado="${categoria}" -> esVip=${esVip}`);
                return esVip;
            }),
            cajas: itemsBodega.filter(item => {
                const categoria = item.categoria?.toLowerCase();
                const esCube = categoria === 'cube';
                console.log(`🔍 Item ${item.id}: categoria="${item.categoria}" -> normalizado="${categoria}" -> esCube=${esCube}`);
                return esCube;
            })
        };

        console.log('📊 KanbanColumn resultado obtenerDatosBodega:', {
            tics: resultado.tics.length,
            vips: resultado.vips.length, 
            cajas: resultado.cajas.length,
            resultado
        });

        return resultado;
    };

    // Función personalizada para manejar clics en cards de bodega
    const manejarClickCardBodega = (item: any) => {
        // Si es un grupo principal (TICS, CAJAS, VIPS), mostrar modal filtrado
        if (item?.es_grupo_principal && columnId === 'en-bodega') {
            console.log('🔍 Click en grupo principal:', item.tipo, 'es_grupo_principal:', item.es_grupo_principal);
            
            // Mapear tipos de useBodega a tipos de filtro
            let tipoFiltro: 'tics' | 'vips' | 'cajas' | null = null;
            switch (item.tipo) {
                case 'TICS':
                    tipoFiltro = 'tics';
                    break;
                case 'VIPS':
                    tipoFiltro = 'vips';
                    break;
                case 'CAJAS':
                    tipoFiltro = 'cajas';
                    break;
            }
            
            if (tipoFiltro) {
                console.log('🎯 Abriendo modal filtrado para:', tipoFiltro);
                setFiltroModalInfo(tipoFiltro);
                setMostrarModalInfo(true);
                return;
            }
        }
        
        // Para otros casos, usar el comportamiento normal
        if (onCardClick) {
            onCardClick(item);
        }
    };

    return (
        <div className="w-full lg:w-80 lg:flex-shrink-0 bg-white rounded-lg shadow-sm border border-gray-200 mb-4 lg:mb-0">
            <div className={`flex justify-between items-center p-3 sm:p-4 rounded-t-lg border-t-4 ${headerColor} bg-gray-50`}>
                <div className="flex items-center gap-2">
                    {/* Botón Volver para En bodega cuando hay navegación activa */}
                    {columnId === 'en-bodega' && (grupoExpandido || subgrupoExpandido) && (
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log('🔙 Botón Volver Bodega clickeado', { grupoExpandido, subgrupoExpandido });
                                if (manejarVolverNivel && volverNivelAnteriorBodega) {
                                    manejarVolverNivel(volverNivelAnteriorBodega);
                                } else if (volverNivelAnteriorBodega) {
                                    volverNivelAnteriorBodega();
                                }
                            }}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded"
                            title="Volver a vista anterior"
                        >
                            <ArrowLeft size={12} />
                            Volver
                        </button>
                    )}
                    
                    {/* Botón Volver para Pre-acondicionamiento cuando hay navegación activa */}
                    {columnId === 'pre-acondicionamiento' && (navegacionPreAcondicionamiento || subgrupoPreAcondicionamiento) && (
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log('🔙 Botón Volver Pre-acondicionamiento clickeado');
                                if (manejarVolverNivel && volverNivelAnteriorPreAcondicionamiento) {
                                    manejarVolverNivel(volverNivelAnteriorPreAcondicionamiento);
                                } else if (volverNivelAnteriorPreAcondicionamiento) {
                                    volverNivelAnteriorPreAcondicionamiento();
                                }
                            }}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-orange-100 hover:bg-orange-200 text-orange-700 rounded"
                            title="Volver a vista de sub-estados"
                        >
                            <ArrowLeft size={12} />
                            Volver
                        </button>
                    )}
                    
                    {/* Botón Volver para Acondicionamiento cuando hay navegación activa */}
                    {columnId === 'acondicionamiento' && (navegacionAcondicionamiento || subgrupoAcondicionamiento) && (
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log('🔙 Botón Volver Acondicionamiento clickeado');
                                if (manejarVolverNivel && volverNivelAnteriorAcondicionamiento) {
                                    manejarVolverNivel(volverNivelAnteriorAcondicionamiento);
                                } else if (volverNivelAnteriorAcondicionamiento) {
                                    volverNivelAnteriorAcondicionamiento();
                                }
                            }}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-100 hover:bg-purple-200 text-purple-700 rounded"
                            title="Volver a vista anterior"
                        >
                            <ArrowLeft size={12} />
                            Volver
                        </button>
                    )}
                    
                    <div className="flex flex-col">
                        <h2 className="font-bold text-base sm:text-lg text-gray-800">{column.name}</h2>
                        
                        {/* Mostrar temporizador del lote más próximo */}
                        {infoLoteActivo && infoLoteActivo.tiempoRestante && (
                            <div className="flex items-center gap-2 mt-1">
                                <span className="flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs">
                                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                                    Lote {infoLoteActivo.lote}: {infoLoteActivo.tiempoRestante}
                                </span>
                                <span className="text-xs text-gray-500">
                                    ({infoLoteActivo.timersActivos} de {infoLoteActivo.totalTics} TICs)
                                </span>
                            </div>
                        )}
                        
                        {/* Mostrar tiempo promedio para todas las fases */}
                        {tiemposPromedio && tiemposPromedio[columnId] && (
                            <div className="flex items-center gap-2 mt-1">
                                <span className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                    Promedio: {tiemposPromedio[columnId].tiempoPromedio}
                                </span>
                                <span className="text-xs text-gray-500">
                                    ({tiemposPromedio[columnId].cantidad} lotes)
                                </span>
                            </div>
                        )}
                        
                        {/* Mostrar timers activos solo para pre-acondicionamiento */}
                        {columnId === 'pre-acondicionamiento' && contarTimersActivos && (
                            <div className="flex items-center gap-2 mt-1">
                                {(() => {
                                    const { activos, completados } = contarTimersActivos(columnId);
                                    return (
                                        <div className="flex items-center gap-2 text-xs">
                                            {activos > 0 && (
                                                <span className="flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded-full">
                                                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                                                    {activos} activos
                                                </span>
                                            )}
                                            {completados > 0 && (
                                                <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full">
                                                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                                    {completados} listos
                                                </span>
                                            )}
                                            {activos === 0 && completados === 0 && (
                                                <span className="text-gray-500">Sin temporizadores</span>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                    </div>
                </div>
                {!isViewOnly && (
                    <div className="flex items-center gap-1">
                        {/* Botón de información (3 puntos) - solo para bodega */}
                        {columnId === 'en-bodega' && (
                            <button 
                                onClick={() => {
                                    setFiltroModalInfo(null); // Sin filtro para mostrar todos
                                    setMostrarModalInfo(true);
                                }}
                                aria-label="Ver información de bodega" 
                                className="text-gray-500 hover:text-blue-600 p-1"
                                title="Ver información detallada de items en bodega"
                            >
                                <MoreHorizontal size={18} />
                            </button>
                        )}
                        
                        {/* Botón de agregar a bodega eliminado */}
                    </div>
                )}
            </div>
            <div className="p-2 sm:p-3 transition-colors duration-200 min-h-[300px] sm:min-h-[400px] lg:min-h-[500px]">
                        {items.map((item, index) => (
                                        <KanbanCard 
                                            key={item.id} 
                                            item={item} 
                                            index={index} 
                                            onCardClick={columnId === 'en-bodega' ? manejarClickCardBodega : onCardClick}
                                obtenerTiempoRestante={obtenerTiempoRestante}
                                iniciarCronometro={iniciarCronometro}
                                detenerCronometro={detenerCronometro}
                                moverABodega={moverABodega}
                                            columnId={columnId}
                                            isViewOnly={isViewOnly}
                                modoSeleccionMultiple={modoSeleccionMultiple}
                                estaSeleccionado={itemsSeleccionados?.some(selected => selected.id === item.id) || false}
                                onToggleSeleccion={onToggleSeleccion}
                            />
                        ))}
            </div>
            
            {/* Modal de información para bodega (se mantiene) */}
            {columnId === 'en-bodega' && (
                <InfoItemModal
                    isOpen={mostrarModalInfo}
                    onClose={() => {
                        setMostrarModalInfo(false);
                        setFiltroModalInfo(null); // Resetear filtro al cerrar
                    }}
                    inventoryData={obtenerDatosBodega()}
                    filtroCategoria={filtroModalInfo}
                />
            )}
        </div>
    );
};

export default KanbanColumn;
