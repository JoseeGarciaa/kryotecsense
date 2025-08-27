import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';

// Configuración base para el API Gateway
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 segundos de timeout para operaciones complejas
});

// Cliente específico para servicios que van a través del API Gateway
const apiServiceClient = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 segundos de timeout para operaciones complejas
});

// Interceptor para añadir el token de autenticación a las cabeceras
const addAuthInterceptor = (client: AxiosInstance) => {
  client.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error: AxiosError) => {
      return Promise.reject(error);
    }
  );

  // Interceptor para manejar errores de autenticación
  client.interceptors.response.use(
    (response: AxiosResponse) => response,
    (error: AxiosError) => {
      if (error.response?.status === 401) {
        // Token expirado o inválido
        localStorage.removeItem('accessToken');
        // Usar setTimeout para evitar problemas con redirecciones durante peticiones AJAX
        setTimeout(() => {
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        }, 100);
      }
      return Promise.reject(error);
    }
  );
};

// Aplicar interceptores a ambos clientes
addAuthInterceptor(apiClient);
addAuthInterceptor(apiServiceClient);

export default apiClient;
export { apiServiceClient };
