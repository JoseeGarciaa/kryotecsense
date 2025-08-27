import React, { useState, useEffect } from 'react';
import { User, Settings as SettingsIcon, Bell, Shield, Eye, EyeOff } from 'lucide-react';
import { useTema } from '../../../shared/hooks/useTema';
import { useAuth } from '../../../shared/hooks/useAuth';
import { useNotificationSound } from '../../../hooks/useNotificationSound';

const Configuracion: React.FC = () => {
  const { tema, alternarTema } = useTema();
  const usuario = useAuth();
  const { settings: soundSettings, updateSettings: updateSoundSettings, playNotificationSound } = useNotificationSound();
  
  // Estados para las configuraciones del usuario
  const [configuracion, setConfiguracion] = useState({
    // Información personal
    nombre: localStorage.getItem('nombreUsuario') || 'Usuario Admin',
    correo: usuario.correo || '',
    telefono: '',
    
    // Preferencias de interfaz
    tema: tema,
    idioma: 'es',
    modoSidebar: localStorage.getItem('sidebarMode') || 'hover',
    
    // Notificaciones
    notificacionesEmail: true,
    notificacionesPush: true,
    notificacionesAlertas: true,
    notificacionesReportes: false,
    
    // Seguridad
    autenticacionDosFactor: false,
    sesionExpiracion: '8', // horas
    
    // Dashboard
    actualizacionAutomatica: true,
    intervaloActualizacion: '30', // segundos
    mostrarGraficos: true,
    mostrarMetricas: true
  });

  const [mostrarCambiarPassword, setMostrarCambiarPassword] = useState(false);
  const [passwordData, setPasswordData] = useState({
    actual: '',
    nueva: '',
    confirmar: ''
  });

  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'success' | 'error', texto: string } | null>(null);

  // Cargar configuración del usuario al montar el componente
  useEffect(() => {
    // Aquí se cargarían las configuraciones desde el backend
    // Por ahora usamos valores por defecto
  }, []);

  const handleConfiguracionChange = (campo: string, valor: any) => {
    setConfiguracion(prev => ({
      ...prev,
      [campo]: valor
    }));
  };

  const handlePasswordChange = (campo: string, valor: string) => {
    setPasswordData(prev => ({
      ...prev,
      [campo]: valor
    }));
  };

  const guardarConfiguracion = async () => {
    try {
      setGuardando(true);
      
      // Simular guardado en backend
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Guardar en localStorage
      localStorage.setItem('nombreUsuario', configuracion.nombre);
      localStorage.setItem('tema', configuracion.tema);
      localStorage.setItem('sidebarMode', configuracion.modoSidebar);
      localStorage.setItem('idioma', configuracion.idioma);
      
      setMensaje({ tipo: 'success', texto: 'Configuración guardada exitosamente' });
      
    } catch (error) {
      console.error('Error al guardar configuración:', error);
      setMensaje({ tipo: 'error', texto: 'Error al guardar la configuración' });
    } finally {
      setGuardando(false);
      setTimeout(() => setMensaje(null), 3000);
    }
  };

  const cambiarPassword = async () => {
    if (passwordData.nueva !== passwordData.confirmar) {
      setMensaje({ tipo: 'error', texto: 'Las contraseñas no coinciden' });
      setTimeout(() => setMensaje(null), 3000);
      return;
    }

    if (passwordData.nueva.length < 6) {
      setMensaje({ tipo: 'error', texto: 'La contraseña debe tener al menos 6 caracteres' });
      setTimeout(() => setMensaje(null), 3000);
      return;
    }

    try {
      // Aquí se enviaría la solicitud de cambio de contraseña al backend
      // await apiServiceClient.post('/users/change-password', passwordData);
      
      setMensaje({ tipo: 'success', texto: 'Contraseña cambiada exitosamente' });
      setPasswordData({ actual: '', nueva: '', confirmar: '' });
      setMostrarCambiarPassword(false);
      setTimeout(() => setMensaje(null), 3000);
    } catch (error) {
      setMensaje({ tipo: 'error', texto: 'Error al cambiar la contraseña' });
      setTimeout(() => setMensaje(null), 3000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">Configuración</h1>
          <p className="text-gray-600 dark:text-gray-400">Personaliza tu experiencia en KryoTecSense</p>
        </div>
        <button
          onClick={guardarConfiguracion}
          disabled={guardando}
          className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <SettingsIcon className="w-4 h-4" />
          <span>{guardando ? 'Guardando...' : 'Guardar Cambios'}</span>
        </button>
      </div>

      {/* Mensaje de estado */}
      {mensaje && (
        <div className={`p-4 rounded-lg ${mensaje.tipo === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {mensaje.texto}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Información Personal */}
        <div className="bg-light-card dark:bg-dark-card p-6 rounded-lg border border-light-border dark:border-dark-border">
          <div className="flex items-center space-x-2 mb-4">
            <User className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">Información Personal</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-light-text dark:text-dark-text mb-1">
                Nombre Completo
              </label>
              <input
                type="text"
                value={configuracion.nombre}
                onChange={(e) => handleConfiguracionChange('nombre', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Ingrese su nombre completo"
                title="Nombre completo del usuario"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-light-text dark:text-dark-text mb-1">
                Correo Electrónico
              </label>
              <input
                type="email"
                value={configuracion.correo}
                onChange={(e) => handleConfiguracionChange('correo', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="ejemplo@correo.com"
                title="Correo electrónico del usuario"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-light-text dark:text-dark-text mb-1">
                Teléfono
              </label>
              <input
                type="tel"
                value={configuracion.telefono}
                onChange={(e) => handleConfiguracionChange('telefono', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Opcional"
              />
            </div>

            <div className="pt-4 border-t border-light-border dark:border-dark-border">
              <button
                onClick={() => setMostrarCambiarPassword(!mostrarCambiarPassword)}
                className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm font-medium"
              >
                {mostrarCambiarPassword ? 'Cancelar cambio de contraseña' : 'Cambiar contraseña'}
              </button>
            </div>

            {mostrarCambiarPassword && (
              <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div>
                  <label className="block text-sm font-medium text-light-text dark:text-dark-text mb-1">
                    Contraseña Actual
                  </label>
                  <input
                    type="password"
                    value={passwordData.actual}
                    onChange={(e) => handlePasswordChange('actual', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Ingrese su contraseña actual"
                    title="Contraseña actual del usuario"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-light-text dark:text-dark-text mb-1">
                    Nueva Contraseña
                  </label>
                  <input
                    type="password"
                    value={passwordData.nueva}
                    onChange={(e) => handlePasswordChange('nueva', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Ingrese su nueva contraseña"
                    title="Nueva contraseña del usuario"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-light-text dark:text-dark-text mb-1">
                    Confirmar Nueva Contraseña
                  </label>
                  <input
                    type="password"
                    value={passwordData.confirmar}
                    onChange={(e) => handlePasswordChange('confirmar', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Confirme su nueva contraseña"
                    title="Confirmación de la nueva contraseña"
                  />
                </div>
                <button
                  onClick={cambiarPassword}
                  className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm"
                >
                  Cambiar Contraseña
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Preferencias de Interfaz */}
        <div className="bg-light-card dark:bg-dark-card p-6 rounded-lg border border-light-border dark:border-dark-border">
          <div className="flex items-center space-x-2 mb-4">
            <SettingsIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">Interfaz</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-light-text dark:text-dark-text mb-2">
                Tema
              </label>
              <div className="flex space-x-3">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="tema"
                    value="claro"
                    checked={configuracion.tema === 'claro'}
                    onChange={(e) => handleConfiguracionChange('tema', e.target.value)}
                    className="mr-2"
                  />
                  <span className="text-sm">Claro</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="tema"
                    value="oscuro"
                    checked={configuracion.tema === 'oscuro'}
                    onChange={(e) => handleConfiguracionChange('tema', e.target.value)}
                    className="mr-2"
                  />
                  <span className="text-sm">Oscuro</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-light-text dark:text-dark-text mb-2">
                Modo de Barra Lateral
              </label>
              <select
                value={configuracion.modoSidebar}
                onChange={(e) => handleConfiguracionChange('modoSidebar', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                title="Seleccionar modo de barra lateral"
              >
                <option value="expanded">Expandido</option>
                <option value="collapsed">Colapsado</option>
                <option value="hover">Expandir al pasar</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-light-text dark:text-dark-text mb-2">
                Idioma
              </label>
              <select
                value={configuracion.idioma}
                onChange={(e) => handleConfiguracionChange('idioma', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                title="Seleccionar idioma de la interfaz"
              >
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
        </div>

        {/* Notificaciones */}
        <div className="bg-light-card dark:bg-dark-card p-6 rounded-lg border border-light-border dark:border-dark-border">
          <div className="flex items-center space-x-2 mb-4">
            <Bell className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">Notificaciones</h2>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-light-text dark:text-dark-text">Notificaciones por Email</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={configuracion.notificacionesEmail}
                  onChange={(e) => handleConfiguracionChange('notificacionesEmail', e.target.checked)}
                  className="sr-only peer"
                  title="Activar o desactivar notificaciones por email"
                  aria-label="Notificaciones por Email"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-light-text dark:text-dark-text">Notificaciones Push</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={configuracion.notificacionesPush}
                  onChange={(e) => handleConfiguracionChange('notificacionesPush', e.target.checked)}
                  className="sr-only peer"
                  title="Activar o desactivar notificaciones push"
                  aria-label="Notificaciones Push"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-light-text dark:text-dark-text">Alertas del Sistema</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={configuracion.notificacionesAlertas}
                  onChange={(e) => handleConfiguracionChange('notificacionesAlertas', e.target.checked)}
                  className="sr-only peer"
                  title="Activar o desactivar alertas del sistema"
                  aria-label="Alertas del Sistema"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-light-text dark:text-dark-text">Reportes Programados</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={configuracion.notificacionesReportes}
                  onChange={(e) => handleConfiguracionChange('notificacionesReportes', e.target.checked)}
                  className="sr-only peer"
                  title="Activar o desactivar reportes programados"
                  aria-label="Reportes Programados"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
              </label>
            </div>

            {/* Configuración de Sonido */}
            <div className="border-t border-light-border dark:border-dark-border pt-4 mt-4">
              <h3 className="text-sm font-medium text-light-text dark:text-dark-text mb-3">
                Configuración de Sonido
              </h3>
              
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-light-text dark:text-dark-text">Sonido de Notificaciones</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={soundSettings.enabled}
                    onChange={(e) => updateSoundSettings({ enabled: e.target.checked })}
                    className="sr-only peer"
                    title="Activar o desactivar sonido de notificaciones"
                    aria-label="Sonido de Notificaciones"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                </label>
              </div>

              {soundSettings.enabled && (
                <>
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-light-text dark:text-dark-text mb-2">
                      Volumen: {Math.round(soundSettings.volume * 100)}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={soundSettings.volume}
                      onChange={(e) => updateSoundSettings({ volume: parseFloat(e.target.value) })}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                    />
                  </div>
                  
                  <button
                    onClick={playNotificationSound}
                    className="text-sm bg-primary-600 hover:bg-primary-700 text-white px-3 py-1 rounded-md transition-colors"
                  >
                    Probar Sonido
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Dashboard */}
        <div className="bg-light-card dark:bg-dark-card p-6 rounded-lg border border-light-border dark:border-dark-border">
          <div className="flex items-center space-x-2 mb-4">
            <SettingsIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">Dashboard</h2>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-light-text dark:text-dark-text">Actualización Automática</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={configuracion.actualizacionAutomatica}
                  onChange={(e) => handleConfiguracionChange('actualizacionAutomatica', e.target.checked)}
                  className="sr-only peer"
                  title="Activar o desactivar actualización automática del dashboard"
                  aria-label="Actualización Automática"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-light-text dark:text-dark-text mb-2">
                Intervalo de Actualización (segundos)
              </label>
              <select
                value={configuracion.intervaloActualizacion}
                onChange={(e) => handleConfiguracionChange('intervaloActualizacion', e.target.value)}
                disabled={!configuracion.actualizacionAutomatica}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                title="Seleccionar intervalo de actualización automática"
              >
                <option value="15">15 segundos</option>
                <option value="30">30 segundos</option>
                <option value="60">1 minuto</option>
                <option value="300">5 minutos</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-light-text dark:text-dark-text">Mostrar Gráficos</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={configuracion.mostrarGraficos}
                  onChange={(e) => handleConfiguracionChange('mostrarGraficos', e.target.checked)}
                  className="sr-only peer"
                  title="Mostrar o ocultar gráficos en el dashboard"
                  aria-label="Mostrar Gráficos"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-light-text dark:text-dark-text">Mostrar Métricas</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={configuracion.mostrarMetricas}
                  onChange={(e) => handleConfiguracionChange('mostrarMetricas', e.target.checked)}
                  className="sr-only peer"
                  title="Mostrar o ocultar métricas en el dashboard"
                  aria-label="Mostrar Métricas"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Configuracion;
