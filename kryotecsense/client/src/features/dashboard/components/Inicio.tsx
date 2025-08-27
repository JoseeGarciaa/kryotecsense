import React, { useState } from 'react';
import { 
  Package,
  Activity,
  CheckCircle,
  Plus,
  Loader,
  Clock,
  Filter
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useDashboardData } from '../../../hooks/useDashboardData';
import './BarChart.css';

// Registrar componentes de Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const Inicio: React.FC = () => {
  const [selectedFilter, setSelectedFilter] = useState<'todos' | 'credo' | 'vip' | 'tics'>('todos');
  const [selectedPeriod, setSelectedPeriod] = useState<'6m' | '3m' | '1m'>('6m');
  
  const { 
    metrics, 
    processingData, 
    recentActivity, 
    loading, 
    error,
    refreshData 
  } = useDashboardData();

  // Configuración del gráfico segmentado por tipos de contenedores
  const getChartDatasets = () => {
    // Simulamos datos por tipo usando los datos de procesamiento existentes
    // En una implementación real, estos datos deberían venir del backend
    const baseDatasets = [
      {
        label: 'CUBE',
        data: processingData.map(item => Math.round(item.recepcion * 0.6) || 0), // 60% CUBEs
        backgroundColor: 'rgba(59, 130, 246, 0.7)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1,
      },
      {
        label: 'VIP',
        data: processingData.map(item => Math.round(item.inspeccion * 0.3) || 0), // 30% VIPs
        backgroundColor: 'rgba(16, 185, 129, 0.7)',
        borderColor: 'rgba(16, 185, 129, 1)',
        borderWidth: 1,
      },
      {
        label: 'TICs',
        data: processingData.map(item => Math.round(item.limpieza * 0.1) || 0), // 10% TICs
        backgroundColor: 'rgba(245, 158, 11, 0.7)',
        borderColor: 'rgba(245, 158, 11, 1)',
        borderWidth: 1,
      },
    ];

    if (selectedFilter === 'todos') {
      return baseDatasets;
    } else {
      return baseDatasets.filter(dataset => {
        if (selectedFilter === 'credo') return dataset.label === 'CUBE';
        if (selectedFilter === 'vip') return dataset.label === 'VIP';
        if (selectedFilter === 'tics') return dataset.label === 'TICs';
        return false;
      });
    }
  };

  const getChartTitle = () => {
    const filterText = selectedFilter === 'todos' ? 'Todos los Tipos' : 
                      selectedFilter === 'credo' ? 'Tipo CUBE' :
                      selectedFilter === 'vip' ? 'Tipo VIP' : 'Tipo TICs';
    const periodText = selectedPeriod === '1m' ? 'Último Mes' :
                      selectedPeriod === '3m' ? 'Últimos 3 Meses' : 'Últimos 6 Meses';
    return `Inventario por Tipo - ${filterText} (${periodText})`;
  };

  const chartData = {
    labels: processingData.map(item => item.mes),
    datasets: getChartDatasets(),
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          boxWidth: 12,
          boxHeight: 12,
          padding: 15,
          font: {
            size: 12
          }
        }
      },
      title: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        cornerRadius: 8,
        padding: 12
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          font: {
            size: 11
          }
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)',
          drawBorder: false
        },
        ticks: {
          font: {
            size: 11
          },
          maxTicksLimit: 6
        }
      },
    },
    elements: {
      bar: {
        borderRadius: 4,
        borderSkipped: false
      }
    }
  };

  const getColorClasses = (color: string) => {
    const colors = {
      primary: 'bg-primary-100 dark:bg-primary-900 text-primary-600 dark:text-primary-300',
      blue: 'bg-primary-100 dark:bg-primary-900 text-primary-600 dark:text-primary-300',
      orange: 'bg-primary-200 dark:bg-primary-800 text-primary-700 dark:text-primary-200',
      green: 'bg-primary-50 dark:bg-primary-950 text-primary-500 dark:text-primary-400',
      purple: 'bg-primary-300 dark:bg-primary-700 text-primary-800 dark:text-primary-100'
    };
    return colors[color as keyof typeof colors] || colors.primary;
  };

  if (loading && !metrics) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader className="w-8 h-8 animate-spin text-primary-600" />
        <span className="ml-2 text-gray-600 dark:text-gray-400">Cargando datos del dashboard...</span>
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

  // Métricas dinámicas basadas en datos reales con insights mejorados
  const metricas = metrics ? [
    {
      titulo: 'Total Activos',
      valor: metrics.total_items.toLocaleString(),
      cambio: '+5%',
      tendencia: 'up',
      icono: Package,
      color: 'primary',
      descripcion: 'Inventario total disponible en el sistema',
      insight: metrics.total_items > 50 ? 'Inventario robusto' : 'Inventario limitado'
    },
    {
      titulo: 'En Proceso',
      valor: (metrics.en_operacion + metrics.en_limpieza).toLocaleString(),
      cambio: '+3%',
      tendencia: 'up',
      icono: Activity,
      color: 'primary',
      descripcion: 'Items actualmente en operaciones y limpieza',
      insight: (metrics.en_operacion + metrics.en_limpieza) > 10 ? 'Alta actividad' : 'Actividad normal'
    },
    {
      titulo: 'Tasa de Éxito',
      valor: `${Math.round((metrics.validados / Math.max(metrics.total_items, 1)) * 100)}%`,
      cambio: '+2%',
      tendencia: 'up',
      icono: CheckCircle,
      color: 'primary',
      descripcion: 'Porcentaje de validaciones exitosas',
      insight: (metrics.validados / Math.max(metrics.total_items, 1)) > 0.8 ? 'Excelente calidad' : 'Revisar procesos'
    },
    {
      titulo: 'Disponibles',
      valor: metrics.en_bodega.toLocaleString(),
      cambio: '+1%',
      tendencia: 'up',
      icono: Activity,
      color: 'primary',
      descripcion: 'Items listos para uso inmediato',
      insight: metrics.en_bodega > 10 ? 'Stock adecuado' : 'Stock bajo'
    }
  ] : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400">Bienvenido al panel de control de KryoTecSense</p>
        </div>
      </div>

      {/* Controles de Segmentación */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-1">Segmentación y Filtros</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Filtra los datos por tipo de contenedor y período de tiempo</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Filtro por Tipo */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tipo de Contenedor:</label>
              <div className="flex space-x-2">
                {[
                  { key: 'todos', label: 'Todos', color: 'bg-gray-100 text-gray-800 hover:bg-gray-200' },
                  { key: 'credo', label: 'CUBE', color: 'bg-blue-100 text-blue-800 hover:bg-blue-200' },
                  { key: 'vip', label: 'VIP', color: 'bg-green-100 text-green-800 hover:bg-green-200' },
                  { key: 'tics', label: 'TICs', color: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' }
                ].map((filter) => (
                  <button
                    key={filter.key}
                    onClick={() => setSelectedFilter(filter.key as any)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedFilter === filter.key
                        ? 'bg-primary-600 text-white'
                        : filter.color
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Filtro por Período */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Período:</label>
              <div className="flex space-x-2">
                {[
                  { key: '1m', label: 'Último Mes' },
                  { key: '3m', label: 'Últimos 3M' },
                  { key: '6m', label: 'Últimos 6M' }
                ].map((period) => (
                  <button
                    key={period.key}
                    onClick={() => setSelectedPeriod(period.key as any)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
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

            {/* Botón Limpiar Filtros */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Acciones:</label>
              <button
                onClick={() => {
                  setSelectedFilter('todos');
                  setSelectedPeriod('6m');
                }}
                className="px-3 py-2 rounded-lg text-sm font-medium transition-colors bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 flex items-center space-x-2"
              >
                <Filter className="w-4 h-4" />
                <span>Limpiar Filtros</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metricas.map((metrica, index) => {
          const IconoComponente = metrica.icono;
          const TendenciaIcono = metrica.tendencia === 'up' ? Plus : Loader;
          
          return (
            <div key={index} className="bg-light-card dark:bg-dark-card p-6 rounded-xl border border-light-border dark:border-dark-border hover:shadow-lg transition-all duration-300">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${getColorClasses(metrica.color)}`}>
                  <IconoComponente className="w-6 h-6" />
                </div>
                <div className="text-right">
                  <p className={`text-sm flex items-center ${
                    metrica.tendencia === 'up' ? 'text-green-600 dark:text-green-400' : 'text-red-600'
                  }`}>
                    <TendenciaIcono className="w-4 h-4 mr-1" />
                    {metrica.cambio}
                  </p>
                  <p className="text-xs text-purple-600 dark:text-purple-400 font-medium mt-1">
                    {metrica.insight}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{metrica.titulo}</p>
                <p className="text-2xl font-bold text-light-text dark:text-dark-text mb-2">{metrica.valor}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{metrica.descripcion}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Gráfico y Actividad */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Gráfico de Inventario por Tipos */}
        <div className="xl:col-span-2 bg-light-card dark:bg-dark-card p-6 rounded-xl border border-light-border dark:border-dark-border">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-light-text dark:text-dark-text">
                {getChartTitle()}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Últimos 6 meses - Datos segmentados por tipo de contenedor
              </p>
            </div>
            <CheckCircle className="w-5 h-5 text-gray-500" />
          </div>
          <div className="h-48 sm:h-56">
            <Bar data={chartData} options={chartOptions} />
          </div>
        </div>

        {/* Actividad Reciente */}
        <div className="bg-light-card dark:bg-dark-card p-6 rounded-xl border border-light-border dark:border-dark-border">
          <h3 className="text-lg font-semibold text-light-text dark:text-dark-text mb-4">Actividad Reciente</h3>
          <div className="space-y-4 max-h-64 overflow-y-auto">
            {recentActivity.length > 0 ? recentActivity.map((actividad) => (
              <div key={actividad.id} className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-primary-600 rounded-full mt-2 flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 dark:text-white font-medium">
                    {actividad.descripcion || 'Actividad sin descripción'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {new Date(actividad.timestamp).toLocaleString('es-ES', {
                      year: 'numeric',
                      month: 'short', 
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                  {actividad.nombre_unidad && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {actividad.nombre_unidad} - {actividad.rfid}
                    </p>
                  )}
                </div>
              </div>
            )) : (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">No hay actividad reciente</p>
              </div>
            )}
          </div>
          <button 
            onClick={refreshData}
            className="mt-4 text-sm text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 font-medium flex items-center"
          >
            {loading ? (
              <Loader className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              'Actualizar datos'
            )}
          </button>
        </div>
      </div>

      {/* Indicadores de Rendimiento y Alertas */}
      {metrics && (
        <div className="bg-light-card dark:bg-dark-card p-6 rounded-xl border border-light-border dark:border-dark-border">
          <h3 className="text-lg font-semibold text-light-text dark:text-dark-text mb-4">Análisis de Rendimiento</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-1">
                {Math.round((metrics.validados / Math.max(metrics.total_items, 1)) * 100) || 0}%
              </div>
              <div className="text-sm text-blue-700 dark:text-blue-300 font-medium">Tasa de Validación</div>
              <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                {(metrics.validados / Math.max(metrics.total_items, 1)) > 0.8 ? '🎯 Objetivo alcanzado' : '⚠️ Requiere atención'}
              </div>
            </div>
            
            <div className="text-center p-4 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400 mb-1">
                {Math.round((metrics.en_bodega / Math.max(metrics.total_items, 1)) * 100) || 0}%
              </div>
              <div className="text-sm text-green-700 dark:text-green-300 font-medium">Disponibilidad</div>
              <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                {(metrics.en_bodega / Math.max(metrics.total_items, 1)) > 0.3 ? '✅ Stock saludable' : '🔴 Stock crítico'}
              </div>
            </div>
            
            <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-lg">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mb-1">
                {Math.round(((metrics.en_operacion + metrics.en_limpieza) / Math.max(metrics.total_items, 1)) * 100) || 0}%
              </div>
              <div className="text-sm text-purple-700 dark:text-purple-300 font-medium">Utilización</div>
              <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                {((metrics.en_operacion + metrics.en_limpieza) / Math.max(metrics.total_items, 1)) > 0.5 ? '🚀 Alta productividad' : '📈 Capacidad disponible'}
              </div>
            </div>
            
            <div className="text-center p-4 bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-lg">
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400 mb-1">
                {metrics.por_validar || 0}
              </div>
              <div className="text-sm text-orange-700 dark:text-orange-300 font-medium">Pendientes</div>
              <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                {(metrics.por_validar || 0) > 5 ? '⏰ Acción requerida' : '✨ Al día'}
              </div>
            </div>
          </div>
          
          {/* Alertas y Recomendaciones Específicas */}
          <div className="mt-6 p-4 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <h4 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-3">⚡ Alertas del Sistema</h4>
            <div className="space-y-2 text-sm">
              {(metrics.en_bodega / Math.max(metrics.total_items, 1)) < 0.2 && (
                <div className="flex items-center space-x-2 text-red-700 dark:text-red-300">
                  <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                  <span>🚨 Stock crítico: Solo {Math.round((metrics.en_bodega / Math.max(metrics.total_items, 1)) * 100)}% disponible</span>
                </div>
              )}
              {(metrics.por_validar || 0) > 10 && (
                <div className="flex items-center space-x-2 text-orange-700 dark:text-orange-300">
                  <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                  <span>⏰ Alto volumen de validaciones pendientes: {metrics.por_validar} items</span>
                </div>
              )}
              {((metrics.en_operacion + metrics.en_limpieza) / Math.max(metrics.total_items, 1)) > 0.7 && (
                <div className="flex items-center space-x-2 text-blue-700 dark:text-blue-300">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  <span>📊 Alta utilización del sistema: {Math.round(((metrics.en_operacion + metrics.en_limpieza) / Math.max(metrics.total_items, 1)) * 100)}% en uso</span>
                </div>
              )}
              {((metrics.en_bodega / Math.max(metrics.total_items, 1)) >= 0.2 && (metrics.por_validar || 0) <= 10 && ((metrics.en_operacion + metrics.en_limpieza) / Math.max(metrics.total_items, 1)) <= 0.7) && (
                <div className="flex items-center space-x-2 text-green-700 dark:text-green-300">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  <span>✅ Sistema operando de manera óptima - todos los indicadores en rango normal</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inicio;
