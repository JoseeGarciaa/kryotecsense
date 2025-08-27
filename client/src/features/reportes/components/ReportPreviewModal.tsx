import React, { useState } from 'react';
import { X, FileText, Package, Eye } from 'lucide-react';

interface ReportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportId: number;
  reportTitle: string;
  onDownload: (format: 'excel' | 'pdf') => void;
  isDownloading: boolean;
}

const ReportPreviewModal: React.FC<ReportPreviewModalProps> = ({
  isOpen,
  onClose,
  reportId,
  reportTitle,
  onDownload,
  isDownloading
}) => {
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Datos de ejemplo para la previsualización - Mover afuera del componente o usar useCallback
  const generatePreviewData = React.useCallback(() => {
    switch (reportId) {
      case 1: // Trazabilidad RFID
        return [
          { 'Nombre Unidad': 'CRYO-001', 'RFID': 'RF001234', 'Estado': 'Operación', 'Categoría': 'Estándar', 'Lote': 'LT001', 'Fecha Creación': '2025-01-15' },
          { 'Nombre Unidad': 'CRYO-002', 'RFID': 'RF001235', 'Estado': 'En bodega', 'Categoría': 'Premium', 'Lote': 'LT002', 'Fecha Creación': '2025-01-16' },
          { 'Nombre Unidad': 'CRYO-003', 'RFID': 'RF001236', 'Estado': 'Acondicionamiento', 'Categoría': 'Estándar', 'Lote': 'LT001', 'Fecha Creación': '2025-01-17' },
        ];
      case 2: // Eficiencia de Procesos
        return [
          { 'Nombre Unidad': 'CRYO-001', 'RFID': 'RF001234', 'Estado': 'Operación', 'Descripción': 'Proceso iniciado', 'Fecha Actividad': '2025-01-15 10:30' },
          { 'Nombre Unidad': 'CRYO-002', 'RFID': 'RF001235', 'Estado': 'En bodega', 'Descripción': 'Almacenamiento', 'Fecha Actividad': '2025-01-16 14:20' },
          { 'Nombre Unidad': 'CRYO-003', 'RFID': 'RF001236', 'Estado': 'Acondicionamiento', 'Descripción': 'Control de calidad', 'Fecha Actividad': '2025-01-17 09:15' },
        ];
      case 3: // Validaciones de Calidad
        return [
          { 'Nombre Unidad': 'CRYO-001', 'RFID': 'RF001234', 'Validación Limpieza': 'Aprobado', 'Validación Goteo': 'Aprobado', 'Validación Desinfección': 'Aprobado' },
          { 'Nombre Unidad': 'CRYO-002', 'RFID': 'RF001235', 'Validación Limpieza': 'Pendiente', 'Validación Goteo': 'N/A', 'Validación Desinfección': 'N/A' },
          { 'Nombre Unidad': 'CRYO-003', 'RFID': 'RF001236', 'Validación Limpieza': 'Aprobado', 'Validación Goteo': 'Rechazado', 'Validación Desinfección': 'Pendiente' },
        ];
      default:
        return [{ 'Mensaje': 'No hay datos disponibles para este reporte' }];
    }
  }, [reportId]);

  React.useEffect(() => {
    if (isOpen) {
      setPreviewData(generatePreviewData());
    }
  }, [isOpen, generatePreviewData]);

  const headers = previewData.length > 0 ? Object.keys(previewData[0]) : [];

  // Early return después de todos los hooks
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <Eye className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Previsualización: {reportTitle}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-auto max-h-[60vh]">
          {previewData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700">
                    {headers.map((header) => (
                      <th
                        key={header}
                        className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {previewData.map((row, index) => (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      {headers.map((header) => (
                        <td
                          key={header}
                          className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap"
                        >
                          {row[header]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500 dark:text-gray-400">No hay datos disponibles para previsualizar</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Mostrando primeras {previewData.length} filas del reporte
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => onDownload('excel')}
              disabled={isDownloading}
              className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Package className="w-4 h-4" />
              <span>Descargar Excel</span>
            </button>
            <button
              onClick={() => onDownload('pdf')}
              disabled={isDownloading}
              className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <FileText className="w-4 h-4" />
              <span>Descargar PDF</span>
            </button>
            <button
              onClick={onClose}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportPreviewModal;
