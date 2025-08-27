import React, { useState } from 'react';
import { 
  FileText, 
  Eye, 
  Clock, 
  Filter,
  Wifi,
  WifiOff,
  Loader,
  CheckCircle,
  Activity,
  Settings,
  User,
  Plus,
  ChevronDown,
  Package
} from 'lucide-react';
import { useReportsData } from '../../../hooks/useReportsData';
import { apiServiceClient } from '../../../api/apiClient';
import ReportPreviewModal from './ReportPreviewModal';

const Reportes: React.FC = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d'>('30d');
  const [selectedType, setSelectedType] = useState<'todos' | 'trazabilidad' | 'calidad' | 'auditoria'>('todos');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [downloadingReport, setDownloadingReport] = useState<number | null>(null);
  const [previewModal, setPreviewModal] = useState<{ isOpen: boolean; reportId: number; reportTitle: string }>({
    isOpen: false,
    reportId: 0,
    reportTitle: ''
  });
  
  const { 
    reports, 
    metrics, 
    loading, 
    error, 
    isConnected, 
    refreshData 
  } = useReportsData();

  // Función para abrir modal de previsualización
  const openPreviewModal = (reportId: number, reportTitle: string) => {
    setPreviewModal({ isOpen: true, reportId, reportTitle });
  };

  // Función para cerrar modal de previsualización
  const closePreviewModal = () => {
    setPreviewModal({ isOpen: false, reportId: 0, reportTitle: '' });
  };

  // Función para descargar reportes
  const downloadReport = async (reportId: number, format: 'excel' | 'pdf') => {
    try {
      setDownloadingReport(reportId);
      
      const response = await apiServiceClient.get(`/reports/reportes/${reportId}/download/${format}`, {
        responseType: 'blob'
      });
      
      // Crear URL para descarga
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // Obtener el nombre del archivo del header Content-Disposition
      const contentDisposition = response.headers['content-disposition'];
      let filename = `reporte_${reportId}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Error descargando reporte:', error);
      // Aquí podrías mostrar un toast de error
    } finally {
      setDownloadingReport(null);
    }
  };

  // Métricas detalladas con insights clave
  const metricas = metrics ? [
    {
      titulo: 'Reportes de Trazabilidad RFID',
      valor: metrics.reportes_trazabilidad.toLocaleString(),
      cambio: `+${metrics.cambio_trazabilidad}%`,
      descripcion: 'Seguimiento completo de credocubes por RFID',
      insight: 'Trazabilidad en tiempo real',
      icono: Activity,
      color: 'blue',
      tendencia: metrics.cambio_trazabilidad > 0 ? 'up' : 'down'
    },
    {
      titulo: 'Validaciones de Calidad',
      valor: metrics.validaciones_registradas.toLocaleString(),
      cambio: `+${metrics.cambio_validaciones}%`,
      descripcion: 'Validaciones de limpieza, goteo y desinfección',
      insight: 'Control de calidad automatizado',
      icono: CheckCircle,
      color: 'green',
      tendencia: metrics.cambio_validaciones > 0 ? 'up' : 'down'
    },
    {
      titulo: 'Procesos Auditados',
      valor: metrics.procesos_auditados.toLocaleString(),
      cambio: `+${metrics.cambio_procesos}%`,
      descripcion: 'Auditorías de procesos operativos',
      insight: 'Cumplimiento normativo',
      icono: Settings,
      color: 'purple',
      tendencia: metrics.cambio_procesos > 0 ? 'up' : 'down'
    },
    {
      titulo: 'Eficiencia Operativa',
      valor: `${metrics.eficiencia_promedio}%`,
      cambio: `+${metrics.cambio_eficiencia}%`,
      descripcion: 'Rendimiento promedio del sistema',
      insight: 'Optimización continua',
      icono: Filter,
      color: 'orange',
      tendencia: metrics.cambio_eficiencia > 0 ? 'up' : 'down'
    }
  ] : [];

  // Insights clave adicionales
  const insightsAdicionales = metrics ? [
    {
      titulo: 'Tiempo Promedio de Proceso',
      valor: metrics.tiempo_promedio_proceso,
      descripcion: 'Desde ingreso hasta finalización',
      icono: Clock,
      color: 'indigo'
    },
    {
      titulo: 'Tasa de Éxito Global',
      valor: metrics.tasa_exito_global,
      descripcion: 'Procesos completados exitosamente',
      icono: Eye,
      color: 'emerald'
    },
    {
      titulo: 'Credos Activos',
      valor: metrics.credocubes_activos.toLocaleString(),
      descripcion: 'Total en operación actualmente',
      icono: User,
      color: 'cyan'
    },
    {
      titulo: 'Alertas Resueltas',
      valor: metrics.alertas_resueltas.toString(),
      descripcion: 'Incidencias gestionadas hoy',
      icono: Plus,
      color: 'rose'
    }
  ] : [];

  if (loading && !metrics) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader className="w-8 h-8 animate-spin text-primary-600" />
        <span className="ml-2 text-gray-600 dark:text-gray-400">Cargando datos de reportes...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-8">
        <div className="text-red-600 mb-4">{error}</div>
        <button 
          onClick={refreshData}
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case 'Inventario':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'Operaciones':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'Calidad':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'Administración':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const getColorClasses = (color: string) => {
    const colors = {
      blue: 'bg-blue-100 dark:bg-blue-900 text-blue-600',
      green: 'bg-green-100 dark:bg-green-900 text-green-600',
      purple: 'bg-purple-100 dark:bg-purple-900 text-purple-600',
      orange: 'bg-orange-100 dark:bg-orange-900 text-orange-600',
      indigo: 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600',
      emerald: 'bg-emerald-100 dark:bg-emerald-900 text-emerald-600',
      cyan: 'bg-cyan-100 dark:bg-cyan-900 text-cyan-600',
      rose: 'bg-rose-100 dark:bg-rose-900 text-rose-600'
    };
    return colors[color as keyof typeof colors] || colors.blue;
  };

  return (
    <div className="space-y-8">
      {/* Header Mejorado */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Centro de Reportes</h1>
            <p className="text-gray-600 dark:text-gray-400">Análisis detallado y generación de reportes del sistema KryoTecSense</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {/* Estado de Conexión */}
            <div className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700">
              {isConnected ? (
                <Wifi className="w-4 h-4 text-green-500" />
              ) : (
                <WifiOff className="w-4 h-4 text-red-500" />
              )}
              <span className={`text-sm font-medium ${
                isConnected ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}>
                {isConnected ? 'Tiempo Real Activo' : 'Sin Conexión'}
              </span>
            </div>
            
            {/* Botón de Actualización */}
            <button 
              onClick={refreshData}
              className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2 rounded-lg flex items-center space-x-2 transition-colors shadow-sm"
            >
              {loading ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <Activity className="w-4 h-4" />
              )}
              <span>{loading ? 'Actualizando...' : 'Actualizar Datos'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Controles de Segmentación y Filtros */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-1">Filtros y Segmentación</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Personaliza la vista de reportes según tus necesidades</p>
          </div>
          
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Filtro por Período */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Período de Análisis:</label>
              <div className="flex space-x-2">
                {[
                  { key: '7d', label: 'Últimos 7 días' },
                  { key: '30d', label: 'Último mes' },
                  { key: '90d', label: 'Últimos 3 meses' }
                ].map((period) => (
                  <button
                    key={period.key}
                    onClick={() => setSelectedPeriod(period.key as any)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedPeriod === period.key
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {period.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Filtro por Tipo */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tipo de Reporte:</label>
              <div className="flex space-x-2">
                {[
                  { key: 'todos', label: 'Todos', color: 'bg-gray-100 text-gray-800 hover:bg-gray-200' },
                  { key: 'trazabilidad', label: 'Trazabilidad', color: 'bg-blue-100 text-blue-800 hover:bg-blue-200' },
                  { key: 'calidad', label: 'Calidad', color: 'bg-green-100 text-green-800 hover:bg-green-200' },
                  { key: 'auditoria', label: 'Auditoría', color: 'bg-purple-100 text-purple-800 hover:bg-purple-200' }
                ].map((type) => (
                  <button
                    key={type.key}
                    onClick={() => setSelectedType(type.key as any)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedType === type.key
                        ? 'bg-primary-600 text-white'
                        : type.color + ' dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Botón Limpiar Filtros */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Acciones:</label>
              <button
                onClick={() => {
                  setSelectedPeriod('30d');
                  setSelectedType('todos');
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 flex items-center space-x-2"
              >
                <Filter className="w-4 h-4" />
                <span>Limpiar Filtros</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Métricas Principales */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Métricas Principales</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Período: {selectedPeriod === '7d' ? 'Últimos 7 días' : selectedPeriod === '30d' ? 'Último mes' : 'Últimos 3 meses'}
          </span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {metricas.map((metrica, index) => {
            const IconoComponente = metrica.icono;
            const isPositive = metrica.tendencia === 'up';
            
            return (
              <div key={index} className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${getColorClasses(metrica.color)}`}>
                    <IconoComponente className="w-6 h-6" />
                  </div>
                  <div className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${
                    isPositive 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                  }`}>
                    <Plus className={`w-3 h-3 ${isPositive ? 'rotate-0' : 'rotate-45'}`} />
                    <span>{metrica.cambio}</span>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">{metrica.titulo}</h3>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{metrica.valor}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{metrica.descripcion}</p>
                  <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                    <span className="text-xs font-medium text-primary-600 dark:text-primary-400">
                      ✓ {metrica.insight}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Insights Adicionales */}
      <div className="space-y-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Insights Clave del Sistema</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {insightsAdicionales.map((insight, index) => {
            const IconoComponente = insight.icono;
            
            return (
              <div key={index} className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getColorClasses(insight.color)}`}>
                    <IconoComponente className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">{insight.valor}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{insight.titulo}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{insight.descripcion}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>



      {/* Lista de reportes */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Reportes Disponibles</h3>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {reports.map((reporte) => (
            <div key={reporte.id} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                      <FileText className="w-6 h-6 text-blue-600" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <h4 className="text-lg font-medium text-gray-900 dark:text-white">{reporte.nombre}</h4>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getTipoColor(reporte.tipo)}`}>
                        {reporte.tipo}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{reporte.descripcion}</p>
                    <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                      <span>Frecuencia: {reporte.frecuencia}</span>
                      <span>•</span>
                      <span>Última generación: {reporte.ultima_generacion}</span>
                      <span>•</span>
                      <span>Tamaño: {reporte.tamaño}</span>
                      <span>•</span>
                      <span>Formato: {reporte.formato}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {/* Botón de previsualización */}
                  <button 
                    onClick={() => openPreviewModal(reporte.id, reporte.nombre)}
                    className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    aria-label="Previsualizar reporte"
                    title="Previsualizar reporte"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  
                  {/* Botón de descarga Excel */}
                  <button 
                    onClick={() => downloadReport(reporte.id, 'excel')}
                    disabled={downloadingReport === reporte.id}
                    className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 p-2 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Descargar Excel"
                    title="Descargar como Excel"
                  >
                    {downloadingReport === reporte.id ? (
                      <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                      <Package className="w-4 h-4" />
                    )}
                  </button>
                  
                  {/* Botón de descarga PDF */}
                  <button 
                    onClick={() => downloadReport(reporte.id, 'pdf')}
                    disabled={downloadingReport === reporte.id}
                    className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Descargar PDF"
                    title="Descargar como PDF"
                  >
                    {downloadingReport === reporte.id ? (
                      <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                      <FileText className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reportes programados */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Reportes Programados</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="flex items-center space-x-3">
              <Clock className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Trazabilidad RFID Diaria</p>
                <p className="text-xs text-blue-600 dark:text-blue-400">Próxima ejecución: Mañana a las 06:00</p>
              </div>
            </div>
            <button className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium">
              Configurar
            </button>
          </div>
          <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div className="flex items-center space-x-3">
              <Clock className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-200">Eficiencia de Procesos Semanal</p>
                <p className="text-xs text-green-600 dark:text-green-400">Próxima ejecución: Lunes a las 08:00</p>
              </div>
            </div>
            <button className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 text-sm font-medium">
              Configurar
            </button>
          </div>
        </div>
      </div>

      {/* Modal de previsualización */}
      <ReportPreviewModal
        isOpen={previewModal.isOpen}
        onClose={closePreviewModal}
        reportId={previewModal.reportId}
        reportTitle={previewModal.reportTitle}
        onDownload={(format) => {
          downloadReport(previewModal.reportId, format);
          closePreviewModal();
        }}
        isDownloading={downloadingReport === previewModal.reportId}
      />
    </div>
  );
};

export default Reportes;
