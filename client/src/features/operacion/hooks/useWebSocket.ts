import { useEffect, useRef, useState } from 'react';

interface WebSocketMessage {
  type: 'activity_created' | 'inventory_updated' | 'timer_completed';
  data: any;
}

export const useWebSocket = (onMessage?: (message: WebSocketMessage) => void) => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = () => {
    try {
      // Usar la URL del WebSocket basada en el entorno
      // Forzar localhost para desarrollo hasta que el servidor esté listo
      const wsUrl = 'ws://localhost:8000/ws/operaciones/';
      // const wsUrl = import.meta.env.PROD 
      //   ? import.meta.env.VITE_WS_URL || 'wss://api.kryotecsense.com/ws/operaciones/'
      //   : import.meta.env.VITE_WS_LOCAL_URL || 'ws://localhost:8000/ws/operaciones/';
      
      console.log('🔌 Conectando WebSocket:', wsUrl);
      
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('✅ WebSocket conectado');
        setIsConnected(true);
        setConnectionError(null);
        reconnectAttempts.current = 0;
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log('📨 Mensaje WebSocket recibido:', message);
          
          if (onMessage) {
            onMessage(message);
          }
        } catch (error) {
          console.error('❌ Error parseando mensaje WebSocket:', error);
        }
      };
      
      wsRef.current.onclose = (event) => {
        console.log('🔌 WebSocket desconectado:', event.code, event.reason);
        setIsConnected(false);
        
        // Intentar reconectar si no fue un cierre intencional
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          console.log(`🔄 Reintentando conexión en ${delay}ms (intento ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = window.setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          setConnectionError('No se pudo reconectar al servidor. Verifique su conexión.');
        }
      };
      
      wsRef.current.onerror = (error) => {
        console.error('❌ Error WebSocket:', error);
        setConnectionError('Error de conexión WebSocket');
      };
      
    } catch (error) {
      console.error('❌ Error creando WebSocket:', error);
      setConnectionError('Error al crear conexión WebSocket');
    }
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Desconexión intencional');
      wsRef.current = null;
    }
    
    setIsConnected(false);
    setConnectionError(null);
  };

  const sendMessage = (message: WebSocketMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      console.log('📤 Mensaje WebSocket enviado:', message);
    } else {
      console.warn('⚠️ WebSocket no está conectado, no se puede enviar mensaje');
    }
  };

  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, []);

  return {
    isConnected,
    connectionError,
    sendMessage,
    connect,
    disconnect
  };
};
