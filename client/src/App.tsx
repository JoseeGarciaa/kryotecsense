import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
} from 'react-router-dom';
import PaginaLogin from './features/autenticacion/components/PaginaLogin';
import Dashboard from './features/dashboard/components/Dashboard';
import KanbanViewer from './KanbanViewer';
import { TimerProvider } from './contexts/TimerContext';

// SOLUCIÓN TEMPORAL: Acceso directo al Dashboard y Kanban sin autenticación
// para poder probar el tablero Kanban rediseñado

function App() {
  return (
    <TimerProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<PaginaLogin />} />

          {/* Acceso directo al Dashboard sin autenticación */}
          <Route path="/" element={<Dashboard />} />
          <Route path="/kanban" element={<Dashboard />} />
          
          {/* Acceso directo al visor de Kanban independiente */}
          <Route path="/kanban-viewer" element={<KanbanViewer />} />


          {/* Redirigir cualquier otra ruta no encontrada a la página principal */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </TimerProvider>
  );
}

export default App;