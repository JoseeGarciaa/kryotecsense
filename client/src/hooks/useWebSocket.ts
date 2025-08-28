import { useState, useEffect, useRef } from 'react';

interface WebSocketMessage {
  type: string;
  data: any;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  sendMessage: (message: any) => void;
  lastMessage: WebSocketMessage | null;
}

export const useWebSocket = (url: string): UseWebSocketReturn => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 10; // Aumentamos intentos de reconexión
  const isReconnecting = useRef(false);

  const connect = () => {
    // Evitar múltiples intentos de conexión simultáneos
    if (isReconnecting.current) return;
    
    try {
      isReconnecting.current = true;
      console.log(`🔌 Intentando conectar WebSocket a ${url}...`);
      
      ws.current = new WebSocket(url);

      ws.current.onopen = () => {
        // Solo log inicial importante si es la primera conexión
        if (reconnectAttempts.current === 0) {
          console.log('✅ WebSocket conectado');
        }
        setIsConnected(true);
        reconnectAttempts.current = 0;
        isReconnecting.current = false;
      };

      ws.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          setLastMessage(message);
        } catch (error) {
          console.error('❌ Error parseando mensaje WebSocket:', error);
        }
      };

      ws.current.onclose = (event) => {
        // Solo log de desconexión si hay problema real y no es spam
        if (event.code !== 1000 && reconnectAttempts.current === 0) {
          console.log('🔌 WebSocket desconectado:', event.code);
        }
        setIsConnected(false);
        isReconnecting.current = false;
        
        // Intentar reconectar solo si no fue un cierre intencional
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current - 1), 30000);
          
          // Solo log de reconexión cada 5 intentos para reducir aún más spam
          if (reconnectAttempts.current % 5 === 1) {
            console.log(`🔄 Intentando reconectar en ${delay}ms (intento ${reconnectAttempts.current}/${maxReconnectAttempts})`);
          }
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (reconnectAttempts.current <= maxReconnectAttempts) {
              connect();
            }
          }, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          console.error(`❌ Máximo de intentos de reconexión alcanzado (${maxReconnectAttempts})`);
        }
      };

      ws.current.onerror = (error) => {
        console.error('❌ Error en WebSocket:', error);
        isReconnecting.current = false;
      };

    } catch (error) {
      console.error('❌ Error creando WebSocket:', error);
      isReconnecting.current = false;
    }
  };

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [url]);

  const sendMessage = (message: any) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      try {
        ws.current.send(JSON.stringify(message));
        // console.log('📤 Mensaje enviado:', message.type);
      } catch (error) {
        console.error('❌ Error enviando mensaje:', error);
      }
    } else {
      console.warn('⚠️ WebSocket no está conectado, mensaje no enviado:', message.type);
      
      // Intentar reconectar si no estamos ya intentándolo
      if (!isReconnecting.current && reconnectAttempts.current < maxReconnectAttempts) {
        console.log('🔄 Intentando reconectar para enviar mensaje...');
        connect();
      }
    }
  };

  return {
    isConnected,
    sendMessage,
    lastMessage
  };
};
