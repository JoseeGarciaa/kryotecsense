import React from 'react';
import { Wifi, WifiOff } from 'lucide-react';

interface WebSocketStatusProps {
  isConnected: boolean;
  className?: string;
}

export const WebSocketStatus: React.FC<WebSocketStatusProps> = ({ 
  isConnected, 
  className = '' 
}) => {
  if (isConnected) {
    return (
      <div className={`flex items-center gap-1 text-green-600 text-xs ${className}`}>
        <Wifi className="w-3 h-3" />
        <span>Sincronizado</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1 text-red-600 text-xs ${className}`}>
      <WifiOff className="w-3 h-3" />
      <span>Desconectado</span>
    </div>
  );
};

export default WebSocketStatus;
