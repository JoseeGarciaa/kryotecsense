import React from 'react';
import { Wifi, WifiOff, AlertCircle } from 'lucide-react';

interface WebSocketIndicatorProps {
  isConnected: boolean;
  error?: string | null;
}

export const WebSocketIndicator: React.FC<WebSocketIndicatorProps> = ({ 
  isConnected, 
  error 
}) => {
  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm">
        <AlertCircle size={16} />
        <span>Error conexión</span>
      </div>
    );
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
        <Wifi size={16} />
  {/* Eliminado: texto 'Conectado' */}
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm">
      <WifiOff size={16} />
  {/* Eliminado: texto 'Desconectado' */}
    </div>
  );
};
