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

// ===== Limitador de concurrencia y reintentos básicos para mitigar ERR_INSUFFICIENT_RESOURCES =====
// ===== Nueva implementación de limitador de concurrencia (solo controla despacho de config) =====
interface QueuedConfig {
  resolve: (cfg: InternalAxiosRequestConfig) => void;
  config: InternalAxiosRequestConfig;
}

const MAX_CONCURRENT = 5; // número máximo de requests simultáneos de escritura
const RETRY_STATUS: number[] = [429, 503, 500];
const RETRY_LIMIT = 3;
const queued: QueuedConfig[] = [];
let activeWrites = 0;

const isWriteMethod = (method?: string) => ['post','put','patch','delete'].includes((method||'').toLowerCase());

const dispatchQueue = () => {
  while (activeWrites < MAX_CONCURRENT && queued.length > 0) {
    const { resolve, config } = queued.shift()!;
    activeWrites++;
    resolve(config); // deja continuar la petición (axios ejecutará el request)
  }
};

// Interceptor de request: encola SOLO operaciones de escritura; retorna el config cuando hay cupo
apiServiceClient.interceptors.request.use((config) => {
  if (!isWriteMethod(config.method)) return config;
  return new Promise<InternalAxiosRequestConfig>((resolve) => {
    // Inicializar contador de intentos si no existe
    (config as any).__attempt = (config as any).__attempt || 0;
    queued.push({ resolve, config });
    dispatchQueue();
  });
});

// Interceptor de respuesta: libera cupo y maneja reintentos básicos con backoff exponencial
apiServiceClient.interceptors.response.use(
  (response) => {
    if (isWriteMethod(response.config?.method)) {
      activeWrites = Math.max(0, activeWrites - 1);
      dispatchQueue();
    }
    return response;
  },
  (error: AxiosError) => {
    const config = error.config as InternalAxiosRequestConfig & { __attempt?: number };
    if (config && isWriteMethod(config.method)) {
      const attempt = config.__attempt ?? 0;
      const status = (error.response && (error.response as any).status) as number | undefined;
      const networkLike = error.code === 'ERR_NETWORK' || error.message?.includes('Network') || error.message?.includes('INSUFFICIENT_RESOURCES');
      const shouldRetry = (networkLike || (status && RETRY_STATUS.includes(status))) && attempt < RETRY_LIMIT;

      activeWrites = Math.max(0, activeWrites - 1); // liberar slot del intento fallido

      if (shouldRetry) {
        const nextAttempt = attempt + 1;
        const delay = 300 * Math.pow(2, attempt); // 300, 600, 1200ms
        config.__attempt = nextAttempt;
        return new Promise((resolve) => {
          setTimeout(() => {
            queued.push({
              resolve: (cfg) => resolve(apiServiceClient.request(cfg)),
              config
            });
            dispatchQueue();
          }, delay);
        });
      }

      // No hay reintento: re-despachar siguientes y propagar error
      dispatchQueue();
    }
    return Promise.reject(error);
  }
);

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
