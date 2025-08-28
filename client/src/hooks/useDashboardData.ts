import { useState, useEffect } from 'react';
import { apiServiceClient } from '../api/apiClient';
import { useWebSocket } from './useWebSocket';

export interface DashboardMetrics {
  total_items: number;
  en_bodega: number;
  en_operacion: number;
  en_limpieza: number;
  en_devolucion: number;
  otros_estados: number;
  por_validar: number;
  validados: number;
}

export interface ProcessingData {
  mes: string;
  recepcion: number;
  inspeccion: number;
  limpieza: number;
  operacion: number;
}

export interface ActivityItem {
  id: number;
  inventario_id?: number;
  descripcion: string;
  timestamp: string;
  nombre_unidad?: string;
  rfid?: string;
  estado_nuevo?: string;
}

interface UseDashboardDataReturn {
  metrics: DashboardMetrics | null;
  processingData: ProcessingData[];
  recentActivity: ActivityItem[];
  loading: boolean;
  error: string | null;
  isConnected: boolean;
  refreshData: () => void;
}

export const useDashboardData = (): UseDashboardDataReturn => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [processingData, setProcessingData] = useState<ProcessingData[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
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

  const fetchMetrics = async () => {
    try {
      const response = await apiServiceClient.get('/inventory/dashboard/metrics');
      setMetrics(response.data);
    } catch (err) {
      console.error('Error fetching metrics:', err);
      setError('Error al cargar métricas');
    }
  };

  const fetchProcessingData = async () => {
    try {
      const response = await apiServiceClient.get('/inventory/dashboard/processing-data');
      const data = Array.isArray(response.data) ? response.data : [];
      setProcessingData(data);
    } catch (err) {
      console.error('Error fetching processing data:', err);
      setError('Error al cargar datos de procesamiento');
    }
  };

  const fetchRecentActivity = async () => {
    try {
      const response = await apiServiceClient.get('/inventory/dashboard/recent-activity');
      const data = Array.isArray(response.data) ? response.data : [];
      setRecentActivity(data);
    } catch (err) {
      console.error('Error fetching recent activity:', err);
      setError('Error al cargar actividad reciente');
    }
  };

  const refreshData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      await Promise.all([
        fetchMetrics(),
        fetchProcessingData(),
        fetchRecentActivity()
      ]);
    } catch (err) {
      console.error('Error refreshing dashboard data:', err);
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
          lastMessage.type === 'process_update' ||
          lastMessage.type === 'validation_update') {
        // Use a timeout to avoid potential loops
        setTimeout(() => {
          refreshData();
        }, 100);
      }
    }
  }, [lastMessage]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMetrics();
      fetchProcessingData();
      fetchRecentActivity();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return {
    metrics,
    processingData,
    recentActivity,
    loading,
    error,
    isConnected,
    refreshData
  };
};
