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
    categoria: string;
  }[];
  estado: string;
  sub_estado: string;
}

interface ItemSinLote {
  id: number;
  nombre_unidad: string;
  rfid: string;
  estado: string;
  sub_estado: string;
  categoria: string;
}

const LoteSelectionModal: React.FC<LoteSelectionModalProps> = ({
  mostrarModal,
  onCancelar,
  onSeleccionarLote,
  subEstado
}) => {
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [itemsSinLote, setItemsSinLote] = useState<ItemSinLote[]>([]);
  const [loteSeleccionado, setLoteSeleccionado] = useState<string | null>(null);
  const [ticsSeleccionados, setTicsSeleccionados] = useState<string[]>([]);
  const [cargando, setCargando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [vistaActual, setVistaActual] = useState<'lotes' | 'sin-lote'>('lotes');

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

  // Normalizar objetivo (a dónde quiero mover)
  const objetivo = (subEstado || '').toLowerCase();
  const objetivoNorm = objetivo.replace(/[^a-z]/g, ''); // e.g., 'atemperamiento'
  const esObjetivoAtemperamiento = objetivoNorm === 'atemperamiento';

  console.log('[Lotes] Cargando lotes → objetivo:', objetivo, '(norm:', objetivoNorm, ')');
      
      // Obtener inventario
      const response = await apiServiceClient.get('/inventory/inventario/');
      const inventario = Array.isArray(response.data) ? response.data : [];
      
      if (!Array.isArray(inventario)) {
        console.error('❌ Inventario no es un array en LoteSelectionModal:', inventario);
        throw new Error('Datos de inventario inválidos');
      }

      // Agrupar por lote únicamente TICs en Pre-acondicionamiento y en el sub-estado fuente
      const loteMap = new Map<string, any[]>();
      const estadoLoteMap = new Map<string, {estado: string, sub_estado: string}>();
      const itemsSinLoteArray: ItemSinLote[] = [];

      let totalCandidatos = 0;
      let totalConLote = 0;
      let totalSinLote = 0;

      inventario.forEach((item: any) => {
        if (!item || typeof item !== 'object') return;

        const categoriaLower = String(item.categoria || '').toLowerCase();
        // Acepta cualquier variante que contenga 'tic' (e.g., 'TIC', 'tics', 'tic 3l')
        const categoriaOk = categoriaLower.includes('tic');

        const estadoLower = String(item.estado || '').toLowerCase();
        const estadoNorm = estadoLower.replace(/[^a-z]/g, '');
        const estadoOk = estadoNorm === 'preacondicionamiento';

        const subLower = String(item.sub_estado || '').toLowerCase();
        const subNorm = subLower.replace(/[^a-z]/g, '');
        // Si voy a atemperamiento, tomar como fuente cualquier sub_estado que contenga 'congel'
        // Si el objetivo es otro, usar contains del objetivo normalizado
        const subOk = esObjetivoAtemperamiento
          ? subLower.includes('congel') || subNorm.includes('congelacion') || subNorm.includes('congelamiento')
          : subLower.includes(objetivo) || subNorm.includes(objetivoNorm);

        if (!categoriaOk || !estadoOk || !subOk) return;

        totalCandidatos++;

        if (item.lote) {
          if (!loteMap.has(item.lote)) {
            loteMap.set(item.lote, []);
            estadoLoteMap.set(item.lote, { estado: item.estado, sub_estado: item.sub_estado });
          }
          loteMap.get(item.lote)?.push({
            id: item.id,
            nombre_unidad: item.nombre_unidad,
            rfid: item.rfid,
            estado: item.estado,
            sub_estado: item.sub_estado,
            categoria: item.categoria
          });
          totalConLote++;
        } else {
          itemsSinLoteArray.push({
            id: item.id,
            nombre_unidad: item.nombre_unidad,
            rfid: item.rfid,
            estado: item.estado,
            sub_estado: item.sub_estado,
            categoria: item.categoria
          });
          totalSinLote++;
        }
      });

      const lotesArray: Lote[] = Array.from(loteMap.entries()).map(([lote, tics]) => ({
        lote,
        tics,
        estado: estadoLoteMap.get(lote)?.estado || '',
        sub_estado: estadoLoteMap.get(lote)?.sub_estado || ''
      }));

      // Ordenar lotes por nombre asc
      lotesArray.sort((a, b) => a.lote.localeCompare(b.lote));

      setLotes(lotesArray);
      setItemsSinLote(itemsSinLoteArray);

  console.log(`[Lotes] Candidatos: ${totalCandidatos} → ${lotesArray.length} lotes, ${itemsSinLoteArray.length} items sin lote (con lote: ${totalConLote}, sin lote: ${totalSinLote})`);
      if (lotesArray.length > 0) {
        console.log('[Lotes] Ejemplo primer lote:', lotesArray[0]);
      }
    } catch (error) {
      console.error('Error al cargar lotes:', error);
      setError('Error al cargar los lotes. Por favor, inténtalo de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  const handleSeleccionarLote = (lote: string) => {
    setLoteSeleccionado(lote);
    setVistaActual('lotes');
    
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

  const handleSeleccionarItemsSinLote = () => {
    setLoteSeleccionado(null);
    setVistaActual('sin-lote');
    setTicsSeleccionados([]);
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
      setError('No hay items seleccionados');
    }
  };

  const renderVistaLotes = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
      {/* Lista de lotes */}
      <div className="border rounded-md p-3">
        <h4 className="font-medium mb-2 text-gray-700 dark:text-gray-300">Lotes disponibles</h4>
  <div className="max-h-48 sm:max-h-60 overflow-y-auto">
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
                <div className="text-xs text-gray-500">{lote.tics.length} items disponibles</div>
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
      
      {/* Lista de items del lote seleccionado */}
      <div className="border rounded-md p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-medium text-gray-700 dark:text-gray-300">
            Items del lote {loteSeleccionado || ""}
          </h4>
          {loteSeleccionado && lotes.find(l => l.lote === loteSeleccionado)?.tics && lotes.find(l => l.lote === loteSeleccionado)!.tics.length > 0 && (
            <button
              onClick={() => {
                const loteActual = lotes.find(l => l.lote === loteSeleccionado);
                if (loteActual) {
                  const todosSeleccionados = Array.isArray(ticsSeleccionados) && loteActual.tics.every(tic => ticsSeleccionados.includes(tic.rfid));
                  if (todosSeleccionados) {
                    setTicsSeleccionados(prev => {
                      if (!Array.isArray(prev)) return [];
                      return prev.filter(rfid => !loteActual.tics.some(tic => tic.rfid === rfid));
                    });
                  } else {
                    const rfidsDelLote = loteActual.tics.map(tic => tic.rfid);
                    setTicsSeleccionados(prev => {
                      if (!Array.isArray(prev)) return rfidsDelLote;
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
  <div className="max-h-48 sm:max-h-60 overflow-y-auto">
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
                  <div className="flex items-center justify-between">
                    <span>{tic.nombre_unidad}</span>
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded">{tic.categoria}</span>
                  </div>
                  <div className="text-xs text-gray-500">{tic.rfid}</div>
                </label>
              </div>
            )) || (
              <div className="text-center p-4 text-gray-500">
                No hay items disponibles
              </div>
            )
          ) : (
            <div className="text-center p-4 text-gray-500">
              Selecciona un lote para ver sus items
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderVistaItemsSinLote = () => (
    <div className="mb-4">
      <div className="border rounded-md p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-medium text-gray-700 dark:text-gray-300">
            Items sin lote ({itemsSinLoteFiltrados.length})
          </h4>
          {itemsSinLoteFiltrados.length > 0 && (
            <button
              onClick={() => {
                const todosSeleccionados = itemsSinLoteFiltrados.every(item => ticsSeleccionados.includes(item.rfid));
                if (todosSeleccionados) {
                  setTicsSeleccionados(prev => prev.filter(rfid => !itemsSinLoteFiltrados.some(item => item.rfid === rfid)));
                } else {
                  const rfidsItems = itemsSinLoteFiltrados.map(item => item.rfid);
                  setTicsSeleccionados(prev => [...prev.filter(rfid => !rfidsItems.includes(rfid)), ...rfidsItems]);
                }
              }}
              className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              {itemsSinLoteFiltrados.every(item => ticsSeleccionados.includes(item.rfid)) ? 'Deseleccionar todos' : 'Seleccionar todos'}
            </button>
          )}
        </div>
  <div className="max-h-64 sm:max-h-96 overflow-y-auto">
          {itemsSinLoteFiltrados.length > 0 ? (
            itemsSinLoteFiltrados.map(item => (
              <div key={item.id} className="flex items-center p-2 border-b">
                <input
                  type="checkbox"
                  id={`item-${item.id}`}
                  checked={ticsSeleccionados.includes(item.rfid)}
                  onChange={(e) => {
                    e.stopPropagation();
                    handleToggleTic(item.rfid);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="mr-2"
                />
                <label htmlFor={`item-${item.id}`} className="flex-1 cursor-pointer">
                  <div className="flex items-center justify-between">
                    <span>{item.nombre_unidad}</span>
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded">{item.categoria}</span>
                  </div>
                  <div className="text-xs text-gray-500">{item.rfid}</div>
                  <div className="text-xs text-gray-400">Estado: {item.estado}/{item.sub_estado}</div>
                </label>
              </div>
            ))
          ) : (
            <div className="text-center p-4 text-gray-500">
              <div>No hay items sin lote disponibles</div>
              <div className="text-xs mt-1">Todos los items están organizados en lotes</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Filtrar lotes por búsqueda
  const lotesFiltrados = lotes.filter(lote => 
    lote.lote.toLowerCase().includes(busqueda.toLowerCase())
  );

  // Filtrar items sin lote por búsqueda
  const itemsSinLoteFiltrados = itemsSinLote.filter(item =>
    item.nombre_unidad.toLowerCase().includes(busqueda.toLowerCase()) ||
    item.rfid.toLowerCase().includes(busqueda.toLowerCase())
  );

  if (!mostrarModal) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-[92vw] max-w-md sm:max-w-lg md:max-w-2xl p-4 sm:p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Seleccionar items por lote
          </h3>
          {subEstado && (
            <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600">
              Destino: {subEstado}
            </span>
          )}
        </div>
  <div className="mb-3 sm:mb-4 p-2 sm:p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-sm text-blue-800">
            ℹ️ Items disponibles: <span className="font-medium">{lotes.length}</span> lotes • <span className="font-medium">{itemsSinLote.length}</span> items sin lote
          </p>
        </div>
        
        
        {/* Pestañas para alternar entre lotes e items sin lote */}
        <div className="mb-4">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setVistaActual('lotes')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                vistaActual === 'lotes'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Por Lotes ({lotes.length})
            </button>
            <button
              onClick={() => setVistaActual('sin-lote')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                vistaActual === 'sin-lote'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Items Individuales ({itemsSinLote.length})
            </button>
          </div>
        </div>

    <div className="mb-3 sm:mb-4">
          <div className="relative">
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={vistaActual === 'lotes' ? "Buscar lote..." : "Buscar item..."}
      className="w-full px-3 py-2 pl-10 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white text-sm"
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
          <div className="flex justify-center items-center p-6 sm:p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
          </div>
        ) : (
          vistaActual === 'lotes' ? renderVistaLotes() : renderVistaItemsSinLote()
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
