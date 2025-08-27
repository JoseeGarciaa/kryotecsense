import { useState, useEffect, useCallback } from 'react';
import { apiServiceClient } from '../../api/apiClient';
import { createUtcTimestamp } from '../utils/dateUtils';
import { useNotificationSound } from '../../hooks/useNotificationSound';

export interface Alerta {
  id: number;
  inventario_id?: number;
  tipo_alerta: string;
  descripcion: string;
  fecha_creacion: string;
  resuelta: boolean;
  fecha_resolucion?: string;
}

export const useAlertas = () => {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [alertasNoLeidas, setAlertasNoLeidas] = useState<Alerta[]>([]);
  const [cargando, setCargando] = useState(false);
  const [previousAlertCount, setPreviousAlertCount] = useState(0);
  
  const { playNotificationSound } = useNotificationSound();

  // Obtener alertas desde el backend
  const obtenerAlertas = useCallback(async (resuelta?: boolean) => {
    try {
      setCargando(true);
      const params = new URLSearchParams();
      if (resuelta !== undefined) {
        params.append('resuelta', resuelta.toString());
      }
      
      const response = await apiServiceClient.get(`/alerts/alertas/?${params.toString()}`);
      const alertasData = response.data;
      
      setAlertas(alertasData);
      
      // Filtrar alertas no resueltas para mostrar como nuevas
      const noResueltas = alertasData.filter((alerta: Alerta) => !alerta.resuelta);
      
      // Verificar si hay nuevas alertas y reproducir sonido
      if (previousAlertCount > 0 && noResueltas.length > previousAlertCount) {
        playNotificationSound();
      }
      
      setAlertasNoLeidas(noResueltas);
      setPreviousAlertCount(noResueltas.length);
      
      return alertasData;
    } catch (error) {
      console.error('Error obteniendo alertas:', error);
      return [];
    } finally {
      setCargando(false);
    }
  }, [previousAlertCount, playNotificationSound]);

  // Marcar alerta como resuelta
  const marcarComoResuelta = useCallback(async (alertaId: number) => {
    try {
      await apiServiceClient.put(`/alerts/alertas/${alertaId}`, {
        resuelta: true
      });
      
      // Actualizar estado local
      setAlertas(prev => prev.map(alerta => 
        alerta.id === alertaId 
          ? { ...alerta, resuelta: true, fecha_resolucion: createUtcTimestamp() }
          : alerta
      ));
      
      setAlertasNoLeidas(prev => prev.filter(alerta => alerta.id !== alertaId));
      
      console.log(`✅ Alerta ${alertaId} marcada como resuelta`);
    } catch (error) {
      console.error('Error marcando alerta como resuelta:', error);
    }
  }, []);

  // Eliminar alerta (solo para administradores)
  const eliminarAlerta = useCallback(async (alertaId: number) => {
    try {
      await apiServiceClient.delete(`/alerts/alertas/${alertaId}`);
      
      // Actualizar estado local
      setAlertas(prev => prev.filter(alerta => alerta.id !== alertaId));
      setAlertasNoLeidas(prev => prev.filter(alerta => alerta.id !== alertaId));
      
      console.log(`🗑️ Alerta ${alertaId} eliminada`);
      return true;
    } catch (error) {
      console.error('Error eliminando alerta:', error);
      return false;
    }
  }, []);

  // Crear nueva alerta manualmente
  const crearAlerta = useCallback(async (alerta: Omit<Alerta, 'id' | 'fecha_creacion' | 'resuelta' | 'fecha_resolucion'>) => {
    try {
      const response = await apiServiceClient.post('/alerts/alertas/', alerta);
      const nuevaAlerta = response.data;
      
      setAlertas(prev => [nuevaAlerta, ...prev]);
      setAlertasNoLeidas(prev => [nuevaAlerta, ...prev]);
      
      console.log('✅ Nueva alerta creada:', nuevaAlerta);
      return nuevaAlerta;
    } catch (error) {
      console.error('Error creando alerta:', error);
      return null;
    }
  }, []);

  // Obtener alertas al montar el hook
  useEffect(() => {
    obtenerAlertas();
  }, [obtenerAlertas]);

  // Actualizar alertas periódicamente
  useEffect(() => {
    const interval = setInterval(() => {
      obtenerAlertas();
    }, 30000); // Actualizar cada 30 segundos

    return () => clearInterval(interval);
  }, [obtenerAlertas]);

  return {
    alertas,
    alertasNoLeidas,
    cargando,
    obtenerAlertas,
    marcarComoResuelta,
    eliminarAlerta,
    crearAlerta,
    cantidadNoLeidas: alertasNoLeidas.length
  };
};
