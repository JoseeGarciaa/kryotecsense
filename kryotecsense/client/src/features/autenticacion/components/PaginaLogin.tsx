import React, { useState } from 'react';
import { Leaf, Eye, EyeOff, Sun, Moon } from 'lucide-react';
import { useTema } from '../../../shared/hooks/useTema';
import apiClient from '../../../api/apiClient'; // Ajusta la ruta si es necesario

const PaginaLogin: React.FC = () => {
  const { tema, alternarTema } = useTema();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [recordarme, setRecordarme] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const manejarEnvio = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    setError('');

    try {
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);

                  const response = await apiClient.post('/token', formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (response.data.access_token) {
        localStorage.setItem('accessToken', response.data.access_token);
        window.location.href = '/'; // Redirige al dashboard principal
      } else {
        setError('No se recibió el token de acceso.');
      }
    } catch (err: any) {
      if (err.response && err.response.status === 401) {
        setError('Credenciales incorrectas. Por favor, inténtalo de nuevo.');
      } else {
        setError('Ocurrió un error al intentar iniciar sesión.');
        console.error(err);
      }
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex dark:bg-dark-bg dark:from-dark-bg dark:to-dark-bg">
      {/* Lado Izquierdo - Imagen */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900 dark:to-primary-800 p-12">
        <img 
          src="/Checking boxes-bro.svg" 
          alt="Ilustración de inicio de sesión" 
          className="w-full h-full object-contain"
        />
      </div>

      {/* Lado Derecho - Formulario de Login */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex items-center justify-between mb-12">
            <div className="flex items-center space-x-2">
              <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center">
                <Leaf className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-bold text-light-text dark:text-dark-text">KryotecSense</span>
            </div>
            <button
              onClick={alternarTema}
              className="p-2 rounded-full hover:bg-primary-100 dark:hover:bg-primary-900 transition-colors"
              aria-label="Cambiar tema"
            >
              {tema === 'oscuro' ? (
                <Sun className="h-5 w-5 text-primary-500" />
              ) : (
                <Moon className="h-5 w-5 text-primary-600" />
              )}
            </button>
          </div>

          {/* Mensaje de bienvenida */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-light-text dark:text-dark-text mb-2">
              Bienvenido de Vuelta, <span className="text-primary-600 dark:text-primary-400">Por favor inicia sesión</span>
            </h1>
            <p className="text-gray-600 dark:text-gray-400">en tu cuenta.</p>
          </div>

          {/* Formulario de Login */}
          <form onSubmit={manejarEnvio} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-light-text dark:text-dark-text mb-2">Correo Electrónico</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@ejemplo.com"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                required
              />
            </div>

            <div className="relative">
              <label htmlFor="password" className="block text-sm font-medium text-light-text dark:text-dark-text mb-2">Contraseña</label>
              <div className="relative">
                <input
                  type={mostrarPassword ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tu contraseña"
                  className="w-full px-4 py-3 border border-light-border dark:border-dark-border rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 bg-light-card dark:bg-dark-card text-light-text dark:text-dark-text"
                  required
                />
                <button
                  type="button"
                  onClick={() => setMostrarPassword(!mostrarPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5"
                >
                  {mostrarPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="recordarme"
                  name="recordarme"
                  type="checkbox"
                  checked={recordarme}
                  onChange={(e) => setRecordarme(e.target.checked)}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
                />
                <label htmlFor="recordarme" className="ml-2 block text-sm text-light-text dark:text-dark-text">Recordarme</label>
              </div>

              <div className="text-sm">
                <a href="#" className="font-medium text-primary-600 dark:text-primary-400 hover:text-primary-500 dark:hover:text-primary-300">¿Olvidaste tu contraseña?</a>
              </div>
            </div>

            {error && <p className="text-sm text-center text-red-600">{error}</p>}

            <div>
              <button
                type="submit"
                disabled={cargando}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 transition-all duration-200"
              >
                {cargando ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              </button>
            </div>
          </form>


        </div>
      </div>
    </div>
  );
};

export default PaginaLogin;