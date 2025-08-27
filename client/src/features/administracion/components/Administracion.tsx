import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Filter } from 'lucide-react';
import { apiServiceClient } from '../../../api/apiClient';
import { useTema } from '../../../shared/hooks/useTema';
import { useAuth } from '../../../shared/hooks/useAuth';

// Interfaces basadas en el esquema de la base de datos
interface Usuario {
  id: number;
  nombre: string;
  correo: string;
  telefono: string | null;
  rol: string;
  activo: boolean;
  fecha_creacion: string;
  ultimo_ingreso: string | null;
}

interface NuevoUsuario {
  nombre: string;
  correo: string;
  telefono: string;
  password: string;
  rol: string;
  activo: boolean;
}

const Administracion: React.FC = () => {
  const { tema } = useTema();
  const usuario = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Estados para modales y formularios
  const [mostrarModalNuevo, setMostrarModalNuevo] = useState(false);
  const [mostrarModalEditar, setMostrarModalEditar] = useState(false);
  const [mostrarModalPassword, setMostrarModalPassword] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null);
  const [usuarioCambioPassword, setUsuarioCambioPassword] = useState<Usuario | null>(null);
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');
  const [nuevoUsuario, setNuevoUsuario] = useState<NuevoUsuario>({
    nombre: '',
    correo: '',
    telefono: '',
    password: '',
    rol: 'operador',
    activo: true
  });

  // Función para formatear fechas
  const formatearFecha = (fechaStr: string | null): string => {
    if (!fechaStr) return 'Nunca';
    
    try {
      const fecha = new Date(fechaStr);
      return fecha.toLocaleString('es-CO', { 
        year: 'numeric', 
        month: 'numeric', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return 'Fecha inválida';
    }
  };

  // Función para obtener color según rol
  const getRolColor = (rol: string) => {
    switch (rol.toLowerCase()) {
      case 'administrador':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'supervisor':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'operador':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  // Función para capitalizar primera letra
  const capitalizar = (texto: string): string => {
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  };

  // Cargar usuarios desde el backend
  useEffect(() => {
    const cargarUsuarios = async () => {
      try {
        setCargando(true);
        // Usar el endpoint con autenticación que respeta el tenant del usuario
        const response = await apiServiceClient.get('/auth/usuarios/');
        console.log('Response from authenticated endpoint:', response.data);
        if (Array.isArray(response.data)) {
          console.log('Usuarios cargados:', response.data);
          setUsuarios(response.data);
        } else {
          throw new Error('Formato de respuesta inválido');
        }
        setError(null);
      } catch (err) {
        console.error('Error al cargar usuarios:', err);
        setError('Error al cargar los usuarios');
      } finally {
        setCargando(false);
      }
    };
    
    cargarUsuarios();
  }, []);

  // Control de acceso: solo administradores pueden acceder
  if (!usuario?.isAuthenticated || (usuario?.rol !== 'administrador' && usuario?.rol !== 'admin')) {
    return (
      <div className={`min-h-screen ${tema === 'oscuro' ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">Acceso Denegado</h2>
            <p className={`${tema === 'oscuro' ? 'text-gray-300' : 'text-gray-600'}`}>No tienes permisos para acceder a esta sección.</p>
            <p className={`text-sm ${tema === 'oscuro' ? 'text-gray-400' : 'text-gray-500'} mt-2`}>Solo los administradores pueden gestionar usuarios.</p>
          </div>
        </div>
      </div>
    );
  }

  // Función para recargar usuarios (para usar en otros lugares)
  const recargarUsuarios = async () => {
    try {
      setCargando(true);
      // Usar el endpoint con autenticación que respeta el tenant del usuario
      const response = await apiServiceClient.get('/auth/usuarios/');
      console.log('Response from authenticated endpoint:', response.data);
      if (Array.isArray(response.data)) {
        setUsuarios(response.data);
      } else {
        throw new Error('Formato de respuesta inválido');
      }
      setError(null);
    } catch (err) {
      console.error('Error al cargar usuarios:', err);
      setError('Error al cargar los usuarios');
    } finally {
      setCargando(false);
    }
  };

  const crearUsuario = async () => {
    try {
      const response = await apiServiceClient.post('/auth/usuarios/', nuevoUsuario);
      if (response.status === 201) {
        await recargarUsuarios();
        setMostrarModalNuevo(false);
        setNuevoUsuario({
          nombre: '',
          correo: '',
          telefono: '',
          password: '',
          rol: 'operador',
          activo: true
        });
      }
    } catch (err) {
      console.error('Error al crear usuario:', err);
      setError('Error al crear el usuario');
    }
  };

  const editarUsuario = async () => {
    if (!usuarioEditando) return;
    
    try {
      const response = await apiServiceClient.put(`/auth/usuarios/${usuarioEditando.id}`, {
        nombre: usuarioEditando.nombre,
        correo: usuarioEditando.correo,
        telefono: usuarioEditando.telefono,
        rol: usuarioEditando.rol,
        activo: usuarioEditando.activo
      });
      
      if (response.status === 200) {
        await recargarUsuarios();
        setMostrarModalEditar(false);
        setUsuarioEditando(null);
      }
    } catch (err) {
      console.error('Error al editar usuario:', err);
      setError('Error al editar el usuario');
    }
  };

  const eliminarUsuario = async (usuario: Usuario) => {
    if (window.confirm(`¿Está seguro de que desea eliminar al usuario "${usuario.nombre}"?`)) {
      try {
        const response = await apiServiceClient.delete(`/auth/usuarios/${usuario.id}`);
        if (response.status === 200) {
          await recargarUsuarios();
        }
      } catch (err) {
        console.error('Error al eliminar usuario:', err);
        setError('Error al eliminar el usuario');
      }
    }
  };

  const abrirModalEditar = (usuario: Usuario) => {
    setUsuarioEditando({ ...usuario });
    setMostrarModalEditar(true);
  };

  const abrirModalPassword = (usuario: Usuario) => {
    console.log('Abriendo modal de cambio de contraseña para usuario:', usuario);
    setUsuarioCambioPassword(usuario);
    setNuevaPassword('');
    setConfirmarPassword('');
    setMostrarModalPassword(true);
  };

  const cambiarPassword = async () => {
    if (!usuarioCambioPassword) return;
    
    if (nuevaPassword !== confirmarPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    
    if (nuevaPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    
    try {
      const response = await apiServiceClient.put(`/auth/usuarios/change-password/${usuarioCambioPassword.id}`, {
        password: nuevaPassword
      });
      
      if (response.status === 200) {
        setMostrarModalPassword(false);
        setUsuarioCambioPassword(null);
        setNuevaPassword('');
        setConfirmarPassword('');
        setError(null);
        // Mostrar mensaje de éxito (opcional)
        console.log('Contraseña cambiada exitosamente');
      }
    } catch (err) {
      console.error('Error al cambiar contraseña:', err);
      setError('Error al cambiar la contraseña');
    }
  };

  if (cargando) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600 dark:text-gray-400">Cargando usuarios...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg p-4">
        <div className="flex">
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800 dark:text-red-200">Error</h3>
            <div className="mt-2 text-sm text-red-700 dark:text-red-300">
              <p>{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Administración</h1>
          <p className="text-gray-600 dark:text-gray-400">Gestión de usuarios del sistema multitenant</p>
        </div>
        <div className="flex space-x-2">
          <button 
            onClick={() => setMostrarModalNuevo(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Usuario</span>
          </button>
        </div>
      </div>

      {/* Métricas de administración */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Usuarios Totales</p>
              <p className="text-2xl font-bold text-blue-600">{usuarios.length}</p>
            </div>
            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
              <span className="text-blue-600 dark:text-blue-400 text-sm font-bold">👥</span>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Usuarios Activos</p>
              <p className="text-2xl font-bold text-green-600">{usuarios.filter((u: Usuario) => u.activo).length}</p>
            </div>
            <div className="w-8 h-8 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
              <span className="text-green-600 dark:text-green-400 text-sm font-bold">✓</span>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Usuarios Inactivos</p>
              <p className="text-2xl font-bold text-red-600">{usuarios.filter((u: Usuario) => !u.activo).length}</p>
            </div>
            <div className="w-8 h-8 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
              <span className="text-red-600 dark:text-red-400 text-sm font-bold">✗</span>
            </div>
          </div>
        </div>
      </div>

      {/* Gestión de usuarios */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Gestión de Usuarios</h3>
        </div>
        {usuarios.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-gray-500 dark:text-gray-400">No se encontraron usuarios</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Usuario
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Teléfono
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Rol
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Último Acceso
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {usuarios.map((usuario) => (
                  <tr key={usuario.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center">
                            <span className="text-white font-medium text-sm">
                              {usuario.nombre.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                            </span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{usuario.nombre}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">{usuario.correo}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {usuario.telefono || <span className="text-gray-400 dark:text-gray-600">No registrado</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRolColor(usuario.rol)}`}>
                        {capitalizar(usuario.rol)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${usuario.activo ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
                        {usuario.activo ? (
                          <Plus className="w-3 h-3 mr-1" />
                        ) : (
                          <Trash2 className="w-3 h-3 mr-1" />
                        )}
                        {usuario.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatearFecha(usuario.ultimo_ingreso)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => abrirModalEditar(usuario)}
                          className="text-yellow-600 hover:text-yellow-900 dark:text-yellow-400 dark:hover:text-yellow-300 px-2 py-1 rounded"
                          aria-label="Editar usuario"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => abrirModalPassword(usuario)}
                          className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300 px-2 py-1 rounded"
                          aria-label="Cambiar contraseña"
                          title="Cambiar contraseña"
                        >
                          <Filter className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => eliminarUsuario(usuario)}
                          className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 px-2 py-1 rounded"
                          aria-label="Eliminar usuario"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Nuevo Usuario */}
      {mostrarModalNuevo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Nuevo Usuario</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="nuevo-nombre" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre</label>
                <input
                  id="nuevo-nombre"
                  type="text"
                  placeholder="Ingrese el nombre completo"
                  value={nuevoUsuario.nombre}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNuevoUsuario({...nuevoUsuario, nombre: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="nuevo-correo" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Correo</label>
                <input
                  id="nuevo-correo"
                  type="email"
                  placeholder="ejemplo@correo.com"
                  value={nuevoUsuario.correo}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNuevoUsuario({...nuevoUsuario, correo: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="nuevo-telefono" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Teléfono</label>
                <input
                  id="nuevo-telefono"
                  type="text"
                  placeholder="Número de teléfono"
                  value={nuevoUsuario.telefono}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNuevoUsuario({...nuevoUsuario, telefono: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="nuevo-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contraseña</label>
                <input
                  id="nuevo-password"
                  type="password"
                  placeholder="Contraseña segura"
                  value={nuevoUsuario.password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNuevoUsuario({...nuevoUsuario, password: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="nuevo-rol" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rol</label>
                <select
                  id="nuevo-rol"
                  value={nuevoUsuario.rol}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNuevoUsuario({...nuevoUsuario, rol: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                >
                  <option value="operador">Operador</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="administrador">Administrador</option>
                </select>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="activo"
                  checked={nuevoUsuario.activo}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNuevoUsuario({...nuevoUsuario, activo: e.target.checked})}
                  className="mr-2"
                />
                <label htmlFor="activo" className="text-sm font-medium text-gray-700 dark:text-gray-300">Usuario activo</label>
              </div>
            </div>
            <div className="flex justify-end space-x-2 mt-6">
              <button
                onClick={() => setMostrarModalNuevo(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cancelar
              </button>
              <button
                onClick={crearUsuario}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Crear Usuario
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Usuario */}
      {mostrarModalEditar && usuarioEditando && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Editar Usuario</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="editar-nombre" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre</label>
                <input
                  id="editar-nombre"
                  type="text"
                  placeholder="Ingrese el nombre completo"
                  value={usuarioEditando.nombre}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsuarioEditando({...usuarioEditando, nombre: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="editar-correo" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Correo</label>
                <input
                  id="editar-correo"
                  type="email"
                  placeholder="ejemplo@correo.com"
                  value={usuarioEditando.correo}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsuarioEditando({...usuarioEditando, correo: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="editar-telefono" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Teléfono</label>
                <input
                  id="editar-telefono"
                  type="text"
                  placeholder="Número de teléfono"
                  value={usuarioEditando.telefono || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsuarioEditando({...usuarioEditando, telefono: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="editar-rol" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rol</label>
                <select
                  id="editar-rol"
                  value={usuarioEditando.rol}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setUsuarioEditando({...usuarioEditando, rol: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                >
                  <option value="operador">Operador</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="administrador">Administrador</option>
                </select>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="activoEdit"
                  checked={usuarioEditando.activo}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsuarioEditando({...usuarioEditando, activo: e.target.checked})}
                  className="mr-2"
                />
                <label htmlFor="activoEdit" className="text-sm font-medium text-gray-700 dark:text-gray-300">Usuario activo</label>
              </div>
            </div>
            <div className="flex justify-end space-x-2 mt-6">
              <button
                onClick={() => setMostrarModalEditar(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cancelar
              </button>
              <button
                onClick={editarUsuario}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cambiar Contraseña */}
      {mostrarModalPassword && usuarioCambioPassword && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Cambiar Contraseña - {usuarioCambioPassword.nombre}
            </h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="nueva-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nueva Contraseña
                </label>
                <input
                  id="nueva-password"
                  type="password"
                  placeholder="Ingrese la nueva contraseña"
                  value={nuevaPassword}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNuevaPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                  minLength={6}
                />
              </div>
              <div>
                <label htmlFor="confirmar-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Confirmar Contraseña
                </label>
                <input
                  id="confirmar-password"
                  type="password"
                  placeholder="Confirme la nueva contraseña"
                  value={confirmarPassword}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmarPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                  minLength={6}
                />
              </div>
              {nuevaPassword && confirmarPassword && nuevaPassword !== confirmarPassword && (
                <p className="text-red-500 text-sm">Las contraseñas no coinciden</p>
              )}
              {nuevaPassword && nuevaPassword.length < 6 && (
                <p className="text-red-500 text-sm">La contraseña debe tener al menos 6 caracteres</p>
              )}
            </div>
            <div className="flex justify-end space-x-2 mt-6">
              <button
                onClick={() => {
                  setMostrarModalPassword(false);
                  setUsuarioCambioPassword(null);
                  setNuevaPassword('');
                  setConfirmarPassword('');
                }}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cancelar
              </button>
              <button
                onClick={cambiarPassword}
                disabled={!nuevaPassword || !confirmarPassword || nuevaPassword !== confirmarPassword || nuevaPassword.length < 6}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Cambiar Contraseña
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Administracion;
