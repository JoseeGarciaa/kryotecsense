import React from 'react';
import { X, Package, Clock, CheckCircle, AlertCircle } from 'lucide-react';

interface InfoItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  inventoryData: {
    tics: any[];
    vips: any[];
    cajas: any[];
  };
  filtroCategoria?: 'tics' | 'vips' | 'cajas' | null; // Nuevo prop para filtrar por categoría
}

const InfoItemModal: React.FC<InfoItemModalProps> = ({
  isOpen,
  onClose,
  inventoryData,
  filtroCategoria = null
}) => {
  // Early return antes de cualquier lógica de renderizado
  if (!isOpen) return null;

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'aprobado':
        return <CheckCircle className="text-green-500" size={16} />;
      case 'rechazado':
        return <X className="text-red-500" size={16} />;
      case 'pendiente':
        return <AlertCircle className="text-yellow-500" size={16} />;
      default:
        return <Package className="text-gray-400" size={16} />;
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'No disponible';
    try {
      return new Date(dateString).toLocaleString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Fecha inválida';
    }
  };

  // Obtiene el primer valor de fecha disponible entre varias claves posibles
  const getFirstDateValue = (item: any, keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = item?.[key];
      if (value) return value as string;
    }
    return undefined;
  };

  const renderItemCard = (item: any, tipo: string) => (
    <div key={item.id} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-gray-800 flex items-center gap-2">
          <span className={`px-2 py-1 text-xs rounded-full font-medium ${
            tipo === 'TIC' ? 'bg-blue-100 text-blue-700' :
            tipo === 'VIP' ? 'bg-purple-100 text-purple-700' :
            'bg-green-100 text-green-700'
          }`}>
            {tipo}
          </span>
          {item.nombre_unidad}
        </h4>
      </div>
      
      <div className="space-y-2 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-gray-600">RFID:</span>
            <p className="font-mono text-xs bg-white px-2 py-1 rounded border">
              {item.rfid || 'No disponible'}
            </p>
          </div>
          <div>
            <span className="text-gray-600">Lote:</span>
            <p className="font-mono text-xs bg-white px-2 py-1 rounded border">
              {item.lote || 'No disponible'}
            </p>
          </div>
        </div>

        <div>
          <span className="text-gray-600 flex items-center gap-1">
            <Clock size={14} />
            Creado:
          </span>
          <p className="text-xs text-gray-700">
            {formatDate(
              getFirstDateValue(item, [
                'fecha_ingreso',
                'fecha_creacion',
                'created_at',
                'fecha'
              ]) as any
            )}
          </p>
        </div>

        {(() => {
          const updated = getFirstDateValue(item, [
            'ultima_actualizacion',
            'fecha_actualizacion',
            'updated_at'
          ]);
          return updated ? (
            <div>
              <span className="text-gray-600 flex items-center gap-1">
                <Clock size={14} />
                Actualizado:
              </span>
              <p className="text-xs text-gray-700">
                {formatDate(updated)}
              </p>
            </div>
          ) : null;
        })()}

        {/* Validaciones */}
        <div className="border-t pt-2">
          <span className="text-gray-600 text-xs font-medium">Validaciones:</span>
          <div className="grid grid-cols-1 gap-1 mt-1">
            <div className="flex items-center justify-between text-xs">
              <span>Limpieza:</span>
              <div className="flex items-center gap-1">
                {getStatusIcon(item.validacion_limpieza)}
                <span className={`font-medium ${
                  item.validacion_limpieza === 'Aprobado' ? 'text-green-600' :
                  item.validacion_limpieza === 'Rechazado' ? 'text-red-600' :
                  item.validacion_limpieza === 'Pendiente' ? 'text-yellow-600' :
                  'text-gray-500'
                }`}>
                  {item.validacion_limpieza || 'No requerido'}
                </span>
              </div>
            </div>
            
            <div className="flex items-center justify-between text-xs">
              <span>Goteo:</span>
              <div className="flex items-center gap-1">
                {getStatusIcon(item.validacion_goteo)}
                <span className={`font-medium ${
                  item.validacion_goteo === 'Aprobado' ? 'text-green-600' :
                  item.validacion_goteo === 'Rechazado' ? 'text-red-600' :
                  item.validacion_goteo === 'Pendiente' ? 'text-yellow-600' :
                  'text-gray-500'
                }`}>
                  {item.validacion_goteo || 'No requerido'}
                </span>
              </div>
            </div>
            
            <div className="flex items-center justify-between text-xs">
              <span>Desinfección:</span>
              <div className="flex items-center gap-1">
                {getStatusIcon(item.validacion_desinfeccion)}
                <span className={`font-medium ${
                  item.validacion_desinfeccion === 'Aprobado' ? 'text-green-600' :
                  item.validacion_desinfeccion === 'Rechazado' ? 'text-red-600' :
                  item.validacion_desinfeccion === 'Pendiente' ? 'text-yellow-600' :
                  'text-gray-500'
                }`}>
                  {item.validacion_desinfeccion || 'No requerido'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Aplicar filtro si se especifica
  const datosFiltrados = filtroCategoria ? {
    tics: filtroCategoria === 'tics' ? inventoryData.tics : [],
    vips: filtroCategoria === 'vips' ? inventoryData.vips : [],
    cajas: filtroCategoria === 'cajas' ? inventoryData.cajas : []
  } : inventoryData;

  const totalItems = datosFiltrados.tics.length + datosFiltrados.vips.length + datosFiltrados.cajas.length;

  // Título dinámico basado en el filtro
  const getTitulo = () => {
    if (filtroCategoria === 'tics') return 'TICs en Bodega';
    if (filtroCategoria === 'vips') return 'VIPs en Bodega';
    if (filtroCategoria === 'cajas') return 'CAJAs en Bodega';
    return 'Información de Items en Bodega';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Package className="text-blue-600" size={20} />
            <h3 className="text-lg font-semibold text-gray-800">
              {getTitulo()}
            </h3>
            <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-sm font-medium">
              {totalItems} items
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(90vh-80px)]">
          {totalItems === 0 ? (
            <div className="text-center py-12">
              <Package className="mx-auto text-gray-400 mb-4" size={48} />
              <h3 className="text-lg font-medium text-gray-600 mb-2">
                No hay items en bodega
              </h3>
              <p className="text-gray-500">
                Utiliza el botón "+" para agregar items a la bodega
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* TICs */}
              {datosFiltrados.tics.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-sm">
                      {datosFiltrados.tics.length}
                    </span>
                    TICs
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {datosFiltrados.tics.map(item => renderItemCard(item, 'TIC'))}
                  </div>
                </div>
              )}

              {/* VIPs */}
              {datosFiltrados.vips.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-sm">
                      {datosFiltrados.vips.length}
                    </span>
                    VIPs
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {datosFiltrados.vips.map(item => renderItemCard(item, 'VIP'))}
                  </div>
                </div>
              )}

              {/* CAJAs */}
              {datosFiltrados.cajas.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-sm">
                      {datosFiltrados.cajas.length}
                    </span>
                    CAJAs
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {datosFiltrados.cajas.map(item => renderItemCard(item, 'CAJA'))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InfoItemModal;
