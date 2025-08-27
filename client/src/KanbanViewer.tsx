import React from 'react';
import Operacion from './features/operacion/components/Operacion';

// Componente independiente para visualizar el tablero Kanban
const KanbanViewer: React.FC = () => {
  return (
  <div className="min-h-screen bg-white">
      <header className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            KryoTecSense - Tablero Kanban
          </h1>
        </div>
      </header>
      <main>
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <Operacion />
        </div>
      </main>
    </div>
  );
};

export default KanbanViewer;
