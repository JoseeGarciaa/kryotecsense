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
      // Derivar URL de WebSocket desde env; backend unificado expone /ws/timers
      const deriveWsUrl = () => {
        const explicit = import.meta.env.VITE_TIMER_WS_URL as string | undefined;
        if (explicit) return explicit;
        const api = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8001';
        const base = api.replace(/\/?$/, '');
        const wsBase = base.startsWith('https') ? base.replace('https', 'wss') : base.replace('http', 'ws');
        return `${wsBase}/ws/timers`;
      };
      const wsUrl = deriveWsUrl();
      
  // Debug log removed: connecting websocket
      
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
  // Debug log removed: websocket connected
        setIsConnected(true);
        setConnectionError(null);
        reconnectAttempts.current = 0;
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          // Solo log mensajes importantes
          // Debug log removed: incoming message types
          
          if (onMessage) {
            onMessage(message);
          }
        } catch (error) {
          console.error('❌ Error parseando mensaje WebSocket:', error);
        }
      };
      
      wsRef.current.onclose = (event) => {
        // Solo log si es un cierre inesperado
  // Debug log removed: websocket disconnected (unexpected)
        setIsConnected(false);
        
        // Intentar reconectar si no fue un cierre intencional
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          // Solo log cada 3 intentos para reducir spam
          // Debug log removed: reconnection attempt
          
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
      // Solo log mensajes importantes
  // Debug log removed: message sent
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
