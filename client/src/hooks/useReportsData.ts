import { useState, useEffect } from 'react';
import { apiServiceClient } from '../api/apiClient';
import { useWebSocket } from './useWebSocket';

export interface ReportItem {
  id: number;
  nombre: string;
  descripcion: string;
  tipo: string;
  frecuencia: string;
  ultima_generacion: string;
  tamaño: string;
  formato: string;
}

export interface ReportMetrics {
  reportes_trazabilidad: number;
  validaciones_registradas: number;
  procesos_auditados: number;
  eficiencia_promedio: number;
  cambio_trazabilidad: number;
  cambio_validaciones: number;
  cambio_procesos: number;
  cambio_eficiencia: number;
  // Insights adicionales
  tiempo_promedio_proceso: string;
  tasa_exito_global: string;
  credocubes_activos: number;
  alertas_resueltas: number;
}

interface UseReportsDataReturn {
  reports: ReportItem[];
  metrics: ReportMetrics | null;
  loading: boolean;
  error: string | null;
  isConnected: boolean;
  refreshData: () => void;
}

export const useReportsData = (): UseReportsDataReturn => {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [metrics, setMetrics] = useState<ReportMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // WebSocket connection - derive from env (backend provides /ws/timers)
  const deriveWsUrl = () => {
    const explicit = import.meta.env.VITE_TIMER_WS_URL as string | undefined;
    if (explicit) return explicit;
    const api = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8001';
    const base = api.replace(/\/?$/,'');
    const wsBase = base.startsWith('https') ? base.replace('https','wss') : base.replace('http','ws');
    return `${wsBase}/ws/timers`;
  };
  const { isConnected, lastMessage } = useWebSocket(deriveWsUrl());

  const fetchReports = async () => {
    try {
      const response = await apiServiceClient.get('/reports/reportes/disponibles');
      const data = Array.isArray(response.data) ? response.data : [];
      setReports(data);
    } catch (err) {
      console.error('Error fetching reports:', err);
      setError('Error cargando reportes disponibles');
    }
  };

  const fetchMetrics = async () => {
    try {
      const response = await apiServiceClient.get('/reports/reportes/metrics');
      setMetrics(response.data);
    } catch (err) {
      console.error('Error fetching report metrics:', err);
      setError('Error cargando métricas de reportes');
    }
  };

  const refreshData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      await Promise.all([
        fetchReports(),
        fetchMetrics()
      ]);
    } catch (err) {
      console.error('Error refreshing reports data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initial data load
  useEffect(() => {
    refreshData();
  }, []);

  // Handle WebSocket messages for real-time updates
  useEffect(() => {
    if (lastMessage) {
      // Refresh data when receiving updates
      if (lastMessage.type === 'inventory_update' || 
          lastMessage.type === 'validation_update' ||
          lastMessage.type === 'report_generated') {
        // Use a timeout to avoid potential loops
        setTimeout(() => {
          refreshData();
        }, 100);
      }
    }
  }, [lastMessage]);

  // Auto-refresh every 60 seconds (less frequent than dashboard)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchReports();
      fetchMetrics();
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  return {
    reports,
    metrics,
    loading,
    error,
    isConnected,
    refreshData
  };
};
