import React from 'react';

interface NavigationButtonsProps {
  grupoExpandido: string | null;
  subgrupoExpandido: string | null;
  onVolverAVistaAgrupada: () => void;
  onVolverASubgrupos: () => void;
  onEscanearTics: () => void;
}

const NavigationButtons: React.FC<NavigationButtonsProps> = ({
  grupoExpandido,
  subgrupoExpandido,
  onVolverAVistaAgrupada,
  onVolverASubgrupos,
  onEscanearTics
}) => {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center space-x-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Operación</h1>
        
        {/* Botones de navegación */}
        {subgrupoExpandido && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onVolverASubgrupos();
            }}
            className="flex items-center px-3 py-1 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-md transition-colors duration-150 font-medium shadow-sm"
          >
            ← Volver a Subgrupos
          </button>
        )}
        
        {grupoExpandido && !subgrupoExpandido && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onVolverAVistaAgrupada();
            }}
            className="flex items-center px-3 py-1 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-md transition-colors duration-150 font-medium shadow-sm"
          >
            ← Volver a Vista Agrupada
          </button>
        )}
      </div>
      
      {/* Botón de escaneo RFID */}
      <button
        onClick={onEscanearTics}
        className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        📱 Escanear TICs para Pre acondicionamiento
      </button>
    </div>
  );
};

export default NavigationButtons;
