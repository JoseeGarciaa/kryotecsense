import { useState, useEffect } from 'react';
import { 
  Menu,
  X,
  Home,
  Package,
  Activity,
  Shield,
  FileText,
  LogOut,
  User,
  ChevronDown,
  Settings,
  Bell,
  ChevronRight,
  Maximize,
  Minimize,
  Sun,
  Moon,
  ClipboardList
} from 'lucide-react';
import { useTema } from '../hooks/useTema';
import { useAuth } from '../hooks/useAuth';
import AlertasDropdown from './AlertasDropdown';


interface NavbarProps {
  seccionActiva: string;
  onSeccionChange: (seccion: string) => void;
  onCerrarSesion: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ seccionActiva, onSeccionChange, onCerrarSesion }) => {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [menuUsuarioAbierto, setMenuUsuarioAbierto] = useState(false);
  const [modoSidebar, setModoSidebar] = useState<'expanded' | 'collapsed' | 'hover'>('hover');
  const usuario = useAuth();
  const [modoSidebarMenuAbierto, setModoSidebarMenuAbierto] = useState(false);
  const [nombreUsuario, setNombreUsuario] = useState(localStorage.getItem('nombreUsuario') || 'Usuario Admin');
    const { tema, alternarTema } = useTema();

  
  // Recuperar la preferencia del usuario del localStorage al cargar
  useEffect(() => {
    const savedMode = localStorage.getItem('sidebarMode');
    if (savedMode && (savedMode === 'expanded' || savedMode === 'collapsed' || savedMode === 'hover')) {
      setModoSidebar(savedMode as 'expanded' | 'collapsed' | 'hover');
    }

    // Escuchar cambios desde configuración
    const handleSidebarModeChange = () => {
      const newMode = localStorage.getItem('sidebarMode');
      if (newMode && (newMode === 'expanded' || newMode === 'collapsed' || newMode === 'hover')) {
        setModoSidebar(newMode as 'expanded' | 'collapsed' | 'hover');
      }
    };

    const handleUserNameChange = (event: Event) => {
      console.log('Evento userNameChanged recibido', (event as CustomEvent)?.detail);
      const newName = localStorage.getItem('nombreUsuario');
      console.log('Nuevo nombre desde localStorage:', newName);
      if (newName) {
        setNombreUsuario(newName);
        console.log('Nombre actualizado en navbar:', newName);
      }
    };

    window.addEventListener('sidebarModeChanged', handleSidebarModeChange);
    window.addEventListener('userNameChanged', handleUserNameChange);
    return () => {
      window.removeEventListener('sidebarModeChanged', handleSidebarModeChange);
      window.removeEventListener('userNameChanged', handleUserNameChange);
    };
  }, []);
  


  // Estado para controlar qué submenús están abiertos
  const [submenuAbierto, setSubmenuAbierto] = useState<string | null>(null);

  // Función para manejar la apertura/cierre de submenús
  const toggleSubmenu = (id: string) => {
    setSubmenuAbierto(submenuAbierto === id ? null : id);
  };

  // Fases de operación para el submenú
  const fasesOperacion = [
    { id: 'operacion/all', nombre: 'Todas las fases' },
    { id: 'operacion/en-bodega', nombre: 'En bodega' },
    { id: 'operacion/pre-acondicionamiento', nombre: 'Registrar pre acondicionamiento' },
    { id: 'operacion/acondicionamiento', nombre: 'Acondicionamiento' },
    { id: 'operacion/operacion', nombre: 'Operación' },
    { id: 'operacion/devolucion', nombre: 'Devolución' },
    { id: 'operacion/inspeccion', nombre: 'Inspección' },
  ];

  const elementosMenuBase = [
    { id: 'inicio', nombre: 'Inicio', icono: Home },
    { id: 'registro', nombre: 'Registro', icono: ClipboardList },
    { id: 'inventario', nombre: 'Inventario', icono: Package },
    { id: 'operacion', nombre: 'Operación', icono: Activity, tieneSubmenu: true, submenu: fasesOperacion },
    { id: 'administracion', nombre: 'Administración', icono: Shield, soloAdmin: true },
    { id: 'reportes', nombre: 'Reportes', icono: FileText },
  ];

  // Filtrar elementos del menú según el rol del usuario
  const elementosMenu = elementosMenuBase.filter(item => {
    if (item.soloAdmin) {
      return usuario?.rol === 'administrador' || usuario?.rol === 'admin';
    }
    return true;
  });

  return (
    <>
      {/* Sidebar Desktop */}
      <div className={`hidden md:flex ${modoSidebar === 'collapsed' || modoSidebar === 'hover' ? 'md:w-16' : 'md:w-64'} md:flex-col md:fixed md:inset-y-0 transition-all duration-300 ease-in-out ${modoSidebar === 'hover' ? 'group hover:md:w-64' : ''}`}>
        <div className="flex flex-col flex-grow pt-5 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
          <div className="flex items-center flex-shrink-0 px-4">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">K</span>
              </div>
              <span className={`ml-2 text-xl font-bold text-light-text dark:text-dark-text ${modoSidebar === 'collapsed' || modoSidebar === 'hover' ? 'hidden' : 'block'} ${modoSidebar === 'hover' ? 'group-hover:block' : ''}`}>KryoTecSense</span>
            </div>
          </div>
          
          <div className="mt-8 flex-grow flex flex-col">
            <nav className="flex-1 px-2 space-y-1">
              {elementosMenu.map((item) => {
                const IconoComponente = item.icono;
                return (
                  <div key={item.id} className="relative">
                    <button
                      onClick={() => item.tieneSubmenu ? toggleSubmenu(item.id) : onSeccionChange(item.id)}
                      className={`group flex items-center justify-between px-2 py-2 text-sm font-medium rounded-md w-full text-left transition-colors duration-200 ${
                        seccionActiva.startsWith(item.id)
                          ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-200'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                      }`}
                      title={modoSidebar === 'collapsed' ? item.nombre : ''}
                    >
                      <div className="flex items-center">
                        <IconoComponente className={`${(modoSidebar === 'collapsed' || modoSidebar === 'hover') ? 'group-hover:mr-3 mx-auto' : 'mr-3'} h-5 w-5`} />
                        <span className={`${modoSidebar === 'collapsed' || modoSidebar === 'hover' ? 'hidden' : 'block'} ${modoSidebar === 'hover' ? 'group-hover:block' : ''}`}>
                          {item.nombre}
                        </span>
                      </div>
                      {item.tieneSubmenu && (
                        <ChevronRight className={`h-4 w-4 transition-transform ${submenuAbierto === item.id ? 'transform rotate-90' : ''} ${modoSidebar === 'collapsed' || modoSidebar === 'hover' ? 'hidden' : 'block'} ${modoSidebar === 'hover' ? 'group-hover:block' : ''}`} />
                      )}
                    </button>
                    
                    {/* Submenú para elementos con submenu */}
                    {item.tieneSubmenu && submenuAbierto === item.id && (
                      <div className={`pl-4 mt-1 space-y-1 ${modoSidebar === 'collapsed' || modoSidebar === 'hover' ? 'hidden' : 'block'} ${modoSidebar === 'hover' ? 'group-hover:block' : ''}`}>
                        {item.submenu?.map((subItem) => (
                          <button
                            key={subItem.id}
                            onClick={() => onSeccionChange(subItem.id)}
                            className={`flex items-center px-2 py-1.5 text-sm font-medium rounded-md w-full text-left transition-colors duration-200 ${
                              seccionActiva === subItem.id
                                ? 'bg-primary-50 dark:bg-primary-800 text-primary-700 dark:text-primary-200'
                                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                            }`}
                          >
                            <span className="ml-2">{subItem.nombre}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>

          {/* User Menu Desktop */}
          <div className="flex-shrink-0 flex border-t border-light-border dark:border-dark-border p-4">
            <div className="flex-shrink-0 w-full group block relative">
              <button 
                onClick={() => setMenuUsuarioAbierto(!menuUsuarioAbierto)}
                className="flex items-center w-full focus:outline-none"
              >
                <div className="h-9 w-9 rounded-full bg-primary-100 dark:bg-primary-800 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary-600 dark:text-primary-300" />
                </div>
                <div className={`ml-3 flex-1 ${modoSidebar === 'collapsed' || modoSidebar === 'hover' ? 'hidden' : 'block'} ${modoSidebar === 'hover' ? 'group-hover:block' : ''}`}>
                  <p className="text-sm font-medium text-light-text dark:text-dark-text">{nombreUsuario}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{usuario.correo}</p>
                </div>
                <ChevronDown className={`h-4 w-4 text-gray-400 ${modoSidebar === 'collapsed' || modoSidebar === 'hover' ? 'hidden' : 'block'} ${modoSidebar === 'hover' ? 'group-hover:block' : ''}`} />
              </button>
              
              {/* Menú desplegable de usuario */}
              {menuUsuarioAbierto && (
                <div className="absolute bottom-full mb-2 left-0 w-56 bg-light-card dark:bg-dark-card rounded-md shadow-lg py-1 z-50 border border-light-border dark:border-dark-border">
                  <div className="flex items-center justify-between px-4 py-2 text-sm text-light-text dark:text-dark-text border-b border-light-border dark:border-dark-border">
                    <div>
                      <p className="font-medium">{nombreUsuario}</p>
                      <p className="text-gray-500 dark:text-gray-400">{usuario.correo}</p>
                    </div>
                    <button
                      onClick={() => setMenuUsuarioAbierto(false)}
                      className="p-1 hover:bg-primary-50 dark:hover:bg-primary-900 rounded"
                      title="Cerrar menú"
                    >
                      <X className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                    </button>
                  </div>
                  <button
                    onClick={() => { onSeccionChange('configuracion'); setMenuUsuarioAbierto(false); }}
                    className="block w-full text-left px-4 py-2 text-sm text-light-text dark:text-dark-text hover:bg-primary-50 dark:hover:bg-primary-900 hover:text-primary-700 dark:hover:text-primary-300"
                  >
                    <Settings className="inline h-4 w-4 mr-2 text-primary-600 dark:text-primary-400" />
                    Configuración
                  </button>
                  <button
                    onClick={() => { onSeccionChange('notificaciones'); setMenuUsuarioAbierto(false); }}
                    className="block w-full text-left px-4 py-2 text-sm text-light-text dark:text-dark-text hover:bg-primary-50 dark:hover:bg-primary-900 hover:text-primary-700 dark:hover:text-primary-300"
                  >
                    <Bell className="inline h-4 w-4 mr-2 text-primary-600 dark:text-primary-400" />
                    Notificaciones
                  </button>
                  <button
                    onClick={() => { alternarTema(); setMenuUsuarioAbierto(false); }}
                    className="block w-full text-left px-4 py-2 text-sm text-light-text dark:text-dark-text hover:bg-primary-50 dark:hover:bg-primary-900 hover:text-primary-700 dark:hover:text-primary-300"
                  >
                    {tema === 'claro' ? 
                      <Sun className="inline h-4 w-4 mr-2 text-primary-600 dark:text-primary-400" /> : 
                      <Moon className="inline h-4 w-4 mr-2 text-primary-600 dark:text-primary-400" />
                    }
                    Modo {tema === 'claro' ? 'oscuro' : 'claro'}
                  </button>
                  <div className="relative block w-full">
                    <div 
                      onClick={() => setModoSidebarMenuAbierto(!modoSidebarMenuAbierto)}
                      className="block w-full text-left px-4 py-2 text-sm text-light-text dark:text-dark-text hover:bg-primary-50 dark:hover:bg-primary-900 hover:text-primary-700 dark:hover:text-primary-300 cursor-pointer"
                    >
                      {modoSidebar === 'expanded' ? 
                        <Minimize className="inline h-4 w-4 mr-2 text-primary-600 dark:text-primary-400" /> : 
                        modoSidebar === 'collapsed' ? 
                        <Maximize className="inline h-4 w-4 mr-2 text-primary-600 dark:text-primary-400" /> : 
                        <ChevronRight className="inline h-4 w-4 mr-2 text-primary-600 dark:text-primary-400" />
                      }
                      Control de barra
                    </div>
                    {modoSidebarMenuAbierto && (
                      <div className="absolute left-full ml-2 top-0 w-48 bg-light-card dark:bg-dark-card rounded-md shadow-lg py-1 z-50 border border-light-border dark:border-dark-border">
                        <button
                          onClick={() => {
                            setModoSidebar('expanded');
                            localStorage.setItem('sidebarMode', 'expanded');
                            setModoSidebarMenuAbierto(false);
                          }}
                          className={`flex items-center w-full px-4 py-2 text-sm text-left ${modoSidebar === 'expanded' ? 'bg-primary-50 dark:bg-primary-900 text-primary-700 dark:text-primary-200' : 'text-light-text dark:text-dark-text hover:bg-primary-50 dark:hover:bg-primary-900 hover:text-primary-700 dark:hover:text-primary-300'}`}
                        >
                          <div className={`w-3 h-3 rounded-full border-2 mr-3 ${modoSidebar === 'expanded' ? 'bg-primary-600 border-primary-600' : 'border-gray-400'}`}></div>
                          Expandido
                        </button>
                        <button
                          onClick={() => {
                            setModoSidebar('collapsed');
                            localStorage.setItem('sidebarMode', 'collapsed');
                            setModoSidebarMenuAbierto(false);
                          }}
                          className={`flex items-center w-full px-4 py-2 text-sm text-left ${modoSidebar === 'collapsed' ? 'bg-primary-50 dark:bg-primary-900 text-primary-700 dark:text-primary-200' : 'text-light-text dark:text-dark-text hover:bg-primary-50 dark:hover:bg-primary-900 hover:text-primary-700 dark:hover:text-primary-300'}`}
                        >
                          <div className={`w-3 h-3 rounded-full border-2 mr-3 ${modoSidebar === 'collapsed' ? 'bg-primary-600 border-primary-600' : 'border-gray-400'}`}></div>
                          Colapsado
                        </button>
                        <button
                          onClick={() => {
                            setModoSidebar('hover');
                            localStorage.setItem('sidebarMode', 'hover');
                            setModoSidebarMenuAbierto(false);
                          }}
                          className={`flex items-center w-full px-4 py-2 text-sm text-left ${modoSidebar === 'hover' ? 'bg-primary-50 dark:bg-primary-900 text-primary-700 dark:text-primary-200' : 'text-light-text dark:text-dark-text hover:bg-primary-50 dark:hover:bg-primary-900 hover:text-primary-700 dark:hover:text-primary-300'}`}
                        >
                          <div className={`w-3 h-3 rounded-full border-2 mr-3 ${modoSidebar === 'hover' ? 'bg-primary-600 border-primary-600' : 'border-gray-400'}`}></div>
                          Expandir al pasar
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => { onCerrarSesion(); setMenuUsuarioAbierto(false); }}
                    className="block w-full text-left px-4 py-2 text-sm text-light-text dark:text-dark-text hover:bg-primary-50 dark:hover:bg-primary-900 hover:text-primary-700 dark:hover:text-primary-300"
                  >
                    <LogOut className="inline h-4 w-4 mr-2 text-primary-600 dark:text-primary-400" />
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
          

        </div>
      </div>

      {/* Mobile Header */}
      <div className="md:hidden">
        <div className="bg-light-bg dark:bg-dark-bg shadow-sm border-b border-light-border dark:border-dark-border">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <button
                  onClick={() => setMenuAbierto(!menuAbierto)}
                  aria-label={menuAbierto ? 'Cerrar menú' : 'Abrir menú'}
                  className="p-2 rounded-md text-light-text dark:text-dark-text hover:bg-primary-50 dark:hover:bg-primary-900 hover:text-primary-700 dark:hover:text-primary-300 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
                >
                  {menuAbierto ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                </button>
                <div className="flex items-center ml-4">
                  <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-sm">K</span>
                  </div>
                  <span className="ml-2 text-xl font-bold text-light-text dark:text-dark-text">KryoTecSense</span>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                {/* Componente de alertas */}
                <AlertasDropdown />
                
                <div className="relative">
                  <button
                    onClick={() => setMenuUsuarioAbierto(!menuUsuarioAbierto)}
                    aria-label="Abrir menú de usuario"
                    className="flex items-center p-2 rounded-md text-light-text dark:text-dark-text hover:bg-primary-50 dark:hover:bg-primary-900 hover:text-primary-700 dark:hover:text-primary-300"
                  >
                    <div className="h-8 w-8 rounded-full bg-primary-100 dark:bg-primary-800 flex items-center justify-center">
                      <User className="h-5 w-5 text-primary-600 dark:text-primary-300" />
                    </div>
                    <ChevronDown className="ml-1 h-4 w-4" />
                  </button>
                  
                  {menuUsuarioAbierto && (
                    <div className="absolute right-0 mt-2 w-48 bg-light-card dark:bg-dark-card rounded-md shadow-lg py-1 z-50 border border-light-border dark:border-dark-border">
                      <div className="flex items-center justify-between px-4 py-2 text-sm text-light-text dark:text-dark-text border-b border-light-border dark:border-dark-border">
                        <div>
                          <p className="font-medium">{nombreUsuario}</p>
                          <p className="text-gray-500 dark:text-gray-400">{usuario.correo}</p>
                        </div>
                        <button
                          onClick={() => setMenuUsuarioAbierto(false)}
                          className="p-1 hover:bg-primary-50 dark:hover:bg-primary-900 rounded"
                          title="Cerrar menú"
                        >
                          <X className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                        </button>
                      </div>
                      <button
                        onClick={() => { onSeccionChange('configuracion'); setMenuUsuarioAbierto(false); }}
                        className="block w-full text-left px-4 py-2 text-sm text-light-text dark:text-dark-text hover:bg-primary-50 dark:hover:bg-primary-900 hover:text-primary-700 dark:hover:text-primary-300"
                      >
                        <Settings className="inline h-4 w-4 mr-2 text-primary-600 dark:text-primary-400" />
                        Configuración
                      </button>
                      <button
                        onClick={() => { onSeccionChange('notificaciones'); setMenuUsuarioAbierto(false); }}
                        className="block w-full text-left px-4 py-2 text-sm text-light-text dark:text-dark-text hover:bg-primary-50 dark:hover:bg-primary-900 hover:text-primary-700 dark:hover:text-primary-300"
                      >
                        <Bell className="inline h-4 w-4 mr-2 text-primary-600 dark:text-primary-400" />
                        Notificaciones
                      </button>
                      <button
                        onClick={() => { alternarTema(); setMenuUsuarioAbierto(false); }}
                        className="block w-full text-left px-4 py-2 text-sm text-light-text dark:text-dark-text hover:bg-primary-50 dark:hover:bg-primary-900 hover:text-primary-700 dark:hover:text-primary-300"
                      >
                        {tema === 'claro' ? 
                          <Sun className="inline h-4 w-4 mr-2 text-primary-600 dark:text-primary-400" /> : 
                          <Moon className="inline h-4 w-4 mr-2 text-primary-600 dark:text-primary-400" />
                        }
                        Modo {tema === 'claro' ? 'oscuro' : 'claro'}
                      </button>
                      <div className="relative block w-full">
                        <div 
                          onClick={() => setModoSidebarMenuAbierto(!modoSidebarMenuAbierto)}
                          className="block w-full text-left px-4 py-2 text-sm text-light-text dark:text-dark-text hover:bg-primary-50 dark:hover:bg-primary-900 hover:text-primary-700 dark:hover:text-primary-300 cursor-pointer"
                        >
                          {modoSidebar === 'expanded' ? 
                            <Minimize className="inline h-4 w-4 mr-2 text-primary-600 dark:text-primary-400" /> : 
                            modoSidebar === 'collapsed' ? 
                            <Maximize className="inline h-4 w-4 mr-2 text-primary-600 dark:text-primary-400" /> : 
                            <ChevronRight className="inline h-4 w-4 mr-2 text-primary-600 dark:text-primary-400" />
                          }
                          Control de barra
                        </div>
                        {modoSidebarMenuAbierto && (
                          <div className="absolute right-0 mt-2 w-48 bg-light-card dark:bg-dark-card rounded-md shadow-lg py-1 z-50 border border-light-border dark:border-dark-border">
                            <button
                              onClick={() => {
                                setModoSidebar('expanded');
                                localStorage.setItem('sidebarMode', 'expanded');
                                setModoSidebarMenuAbierto(false);
                              }}
                              className={`flex items-center w-full px-4 py-2 text-sm text-left ${modoSidebar === 'expanded' ? 'bg-primary-50 dark:bg-primary-900 text-primary-700 dark:text-primary-200' : 'text-light-text dark:text-dark-text hover:bg-primary-50 dark:hover:bg-primary-900 hover:text-primary-700 dark:hover:text-primary-300'}`}
                            >
                              <div className={`w-3 h-3 rounded-full border-2 mr-3 ${modoSidebar === 'expanded' ? 'bg-primary-600 border-primary-600' : 'border-gray-400'}`}></div>
                              Expandido
                            </button>
                            <button
                              onClick={() => {
                                setModoSidebar('collapsed');
                                localStorage.setItem('sidebarMode', 'collapsed');
                                setModoSidebarMenuAbierto(false);
                              }}
                              className={`flex items-center w-full px-4 py-2 text-sm text-left ${modoSidebar === 'collapsed' ? 'bg-primary-50 dark:bg-primary-900 text-primary-700 dark:text-primary-200' : 'text-light-text dark:text-dark-text hover:bg-primary-50 dark:hover:bg-primary-900 hover:text-primary-700 dark:hover:text-primary-300'}`}
                            >
                              <div className={`w-3 h-3 rounded-full border-2 mr-3 ${modoSidebar === 'collapsed' ? 'bg-primary-600 border-primary-600' : 'border-gray-400'}`}></div>
                              Colapsado
                            </button>
                            <button
                              onClick={() => {
                                setModoSidebar('hover');
                                localStorage.setItem('sidebarMode', 'hover');
                                setModoSidebarMenuAbierto(false);
                              }}
                              className={`flex items-center w-full px-4 py-2 text-sm text-left ${modoSidebar === 'hover' ? 'bg-primary-50 dark:bg-primary-900 text-primary-700 dark:text-primary-200' : 'text-light-text dark:text-dark-text hover:bg-primary-50 dark:hover:bg-primary-900 hover:text-primary-700 dark:hover:text-primary-300'}`}
                            >
                              <div className={`w-3 h-3 rounded-full border-2 mr-3 ${modoSidebar === 'hover' ? 'bg-primary-600 border-primary-600' : 'border-gray-400'}`}></div>
                              Expandir al pasar
                            </button>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => { onCerrarSesion(); setMenuUsuarioAbierto(false); }}
                        className="block w-full text-left px-4 py-2 text-sm text-light-text dark:text-dark-text hover:bg-primary-50 dark:hover:bg-primary-900 hover:text-primary-700 dark:hover:text-primary-300"
                      >
                        <LogOut className="inline h-4 w-4 mr-2 text-primary-600 dark:text-primary-400" />
                        Cerrar sesión
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {menuAbierto && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-light-bg dark:bg-dark-bg border-b border-light-border dark:border-dark-border">
              {elementosMenu.map((item) => {
                const IconoComponente = item.icono;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onSeccionChange(item.id);
                      setMenuAbierto(false);
                    }}
                    className={`group flex items-center px-3 py-2 text-base font-medium rounded-md w-full text-left transition-colors duration-200 ${
                      seccionActiva === item.id
                        ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-200'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    <IconoComponente className="mr-3 h-6 w-6" />
                    {item.nombre}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default Navbar;
