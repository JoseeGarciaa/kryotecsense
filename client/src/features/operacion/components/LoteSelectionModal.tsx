import React, { useState, useEffect } from 'react';
import { apiServiceClient } from '../../../api/apiClient';
import { Search } from 'lucide-react';

interface LoteSelectionModalProps {
  mostrarModal: boolean;
  onCancelar: () => void;
  onSeleccionarLote: (tics: string[]) => void;
  subEstado: string;
}

interface Lote {
  lote: string;
  tics: {
    id: number;
    nombre_unidad: string;
    rfid: string;
    estado: string;
    sub_estado: string;
  }[];
  estado: string;
  sub_estado: string;
}

const LoteSelectionModal: React.FC<LoteSelectionModalProps> = ({
  mostrarModal,
  onCancelar,
  onSeleccionarLote,
  subEstado
}) => {
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [loteSeleccionado, setLoteSeleccionado] = useState<string | null>(null);
  const [ticsSeleccionados, setTicsSeleccionados] = useState<string[]>([]);
  const [cargando, setCargando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Cargar lotes disponibles
  useEffect(() => {
    if (mostrarModal) {
      cargarLotes();
    }
  }, [mostrarModal]);

  const cargarLotes = async () => {
    try {
      setCargando(true);
      setError(null);
      
      // Obtener inventario agrupado por lotes
      const response = await apiServiceClient.get('/inventory/inventario/');
      const inventario = Array.isArray(response.data) ? response.data : [];
      
      // Validar que inventario sea un array
      if (!Array.isArray(inventario)) {
        console.error('❌ Inventario no es un array en LoteSelectionModal:', inventario);
        throw new Error('Datos de inventario inválidos');
      }
      
      // Agrupar por lote
      const loteMap = new Map<string, any[]>();
      const estadoLoteMap = new Map<string, {estado: string, sub_estado: string}>();
      
      inventario.forEach((item: any) => {
        // Validar que el item tenga las propiedades necesarias
        if (!item || typeof item !== 'object') {
          console.warn('⚠️ Item inválido encontrado:', item);
          return;
        }
        if (item.lote) {
          if (!loteMap.has(item.lote)) {
            loteMap.set(item.lote, []);
            // Guardar el estado del primer item del lote
            estadoLoteMap.set(item.lote, {
              estado: item.estado,
              sub_estado: item.sub_estado
            });
          }
          
          // Solo incluir TICs que tienen categoria 'TIC'
          if (item.categoria === 'TIC') {
            loteMap.get(item.lote)?.push({
              id: item.id,
              nombre_unidad: item.nombre_unidad,
              rfid: item.rfid,
              estado: item.estado,
              sub_estado: item.sub_estado
            });
          }
        }
      });
      
      // Convertir el mapa a un array de objetos
      const lotesArray: Lote[] = Array.from(loteMap.entries()).map(([lote, tics]) => ({
        lote,
        tics,
        estado: estadoLoteMap.get(lote)?.estado || '',
        sub_estado: estadoLoteMap.get(lote)?.sub_estado || ''
      }));
      
      setLotes(lotesArray);
    } catch (error) {
      console.error('Error al cargar lotes:', error);
      setError('Error al cargar los lotes. Por favor, inténtalo de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  const handleSeleccionarLote = (lote: string) => {
    setLoteSeleccionado(lote);
    
    // Obtener TICs del lote seleccionado
    const loteEncontrado = lotes.find(l => l.lote === lote);
    if (loteEncontrado && Array.isArray(loteEncontrado.tics)) {
      // Preseleccionar todos los TICs del lote
      const rfids = loteEncontrado.tics.map(tic => tic.rfid).filter(rfid => rfid); // Filtrar valores falsy
      setTicsSeleccionados(rfids);
    } else {
      setTicsSeleccionados([]);
    }
  };

  const handleToggleTic = (rfid: string) => {
    setTicsSeleccionados(prev => {
      // Validar que prev sea un array
      if (!Array.isArray(prev)) {
        console.error('❌ ticsSeleccionados no es un array:', prev);
        return [rfid]; // Inicializar con el rfid actual
      }
      
      if (prev.includes(rfid)) {
        return prev.filter(id => id !== rfid);
      } else {
        return [...prev, rfid];
      }
    });
  };

  const handleConfirmar = () => {
    if (ticsSeleccionados.length > 0) {
      onSeleccionarLote(ticsSeleccionados);
    } else {
      setError('No hay TICs seleccionados');
    }
  };

  // Filtrar lotes por búsqueda
  const lotesFiltrados = lotes.filter(lote => 
    lote.lote.toLowerCase().includes(busqueda.toLowerCase())
  );

  if (!mostrarModal) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
          Seleccionar TICs por Lote para {subEstado}
        </h3>
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-sm text-yellow-800">
            ⚠️ <strong>IMPORTANTE:</strong> Solo se muestran TICs en este modal. Los VIPs y CUBEs no están disponibles para pre-acondicionamiento.
          </p>
        </div>
        
        <div className="mb-4">
          <div className="relative">
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar lote..."
              className="w-full px-3 py-2 pl-10 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
            />
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
          </div>
        </div>
        
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
            {error}
          </div>
        )}
        
        {cargando ? (
          <div className="flex justify-center items-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Lista de lotes */}
            <div className="border rounded-md p-3">
              <h4 className="font-medium mb-2 text-gray-700 dark:text-gray-300">Lotes disponibles</h4>
              <div className="max-h-60 overflow-y-auto">
                {lotesFiltrados.length > 0 ? (
                  lotesFiltrados.map((lote) => (
                    <div 
                      key={lote.lote}
                      onClick={() => handleSeleccionarLote(lote.lote)}
                      className={`p-2 cursor-pointer rounded-md mb-1 ${
                        loteSeleccionado === lote.lote 
                          ? 'bg-primary-100 border border-primary-300' 
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div className="font-medium">{lote.lote}</div>
                      <div className="text-xs text-gray-500">{lote.tics.length} TICs disponibles</div>
                      <div className="text-xs text-gray-400 mt-1">
                        Estado: {lote.estado}/{lote.sub_estado}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center p-4 text-gray-500">
                    No se encontraron lotes
                  </div>
                )}
              </div>
            </div>
            
            {/* Lista de TICs del lote seleccionado */}
            <div className="border rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-gray-700 dark:text-gray-300">
                  TICs del lote {loteSeleccionado || ""}
                </h4>
                {loteSeleccionado && lotes.find(l => l.lote === loteSeleccionado)?.tics && lotes.find(l => l.lote === loteSeleccionado)!.tics.length > 0 && (
                  <button
                    onClick={() => {
                      const loteActual = lotes.find(l => l.lote === loteSeleccionado);
                      if (loteActual) {
                        const todosSeleccionados = Array.isArray(ticsSeleccionados) && loteActual.tics.every(tic => ticsSeleccionados.includes(tic.rfid));
                        if (todosSeleccionados) {
                          // Deseleccionar todos los TICs del lote actual
                          setTicsSeleccionados(prev => {
                            if (!Array.isArray(prev)) {
                              console.error('❌ ticsSeleccionados no es un array en deseleccionar:', prev);
                              return [];
                            }
                            return prev.filter(rfid => !loteActual.tics.some(tic => tic.rfid === rfid));
                          });
                        } else {
                          // Seleccionar todos los TICs del lote actual
                          const rfidsDelLote = loteActual.tics.map(tic => tic.rfid);
                          setTicsSeleccionados(prev => {
                            if (!Array.isArray(prev)) {
                              console.error('❌ ticsSeleccionados no es un array en seleccionar:', prev);
                              return rfidsDelLote;
                            }
                            const sinDuplicados = prev.filter(rfid => !rfidsDelLote.includes(rfid));
                            return [...sinDuplicados, ...rfidsDelLote];
                          });
                        }
                      }
                    }}
                    className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  >
                    {Array.isArray(ticsSeleccionados) && lotes.find(l => l.lote === loteSeleccionado)?.tics.every(tic => ticsSeleccionados.includes(tic.rfid)) ? 'Deseleccionar todos' : 'Seleccionar todos'}
                  </button>
                )}
              </div>
              <div className="max-h-60 overflow-y-auto">
                {loteSeleccionado ? (
                  lotes.find(l => l.lote === loteSeleccionado)?.tics.map(tic => (
                    <div key={tic.id} className="flex items-center p-2 border-b">
                      <input
                        type="checkbox"
                        id={`tic-${tic.id}`}
                        checked={Array.isArray(ticsSeleccionados) && ticsSeleccionados.includes(tic.rfid)}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleToggleTic(tic.rfid);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="mr-2"
                      />
                      <label htmlFor={`tic-${tic.id}`} className="flex-1 cursor-pointer">
                        <div>{tic.nombre_unidad}</div>
                        <div className="text-xs text-gray-500">{tic.rfid}</div>
                      </label>
                    </div>
                  )) || (
                    <div className="text-center p-4 text-gray-500">
                      No hay TICs disponibles
                    </div>
                  )
                ) : (
                  <div className="text-center p-4 text-gray-500">
                    Selecciona un lote para ver sus TICs
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        <div className="flex justify-end space-x-2 mt-4">
          <button
            onClick={onCancelar}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600"
            disabled={ticsSeleccionados.length === 0}
          >
            Confirmar ({ticsSeleccionados.length} TICs)
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoteSelectionModal;
