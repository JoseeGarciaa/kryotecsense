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
type PendingRequest = {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  config: InternalAxiosRequestConfig;
  attempt: number;
};

const MAX_CONCURRENT = 5; // número máximo de requests simultáneos pesados
const RETRY_STATUS: number[] = [429, 503, 500];
const RETRY_LIMIT = 3;
const queue: PendingRequest[] = [];
let activeCount = 0;

const isWriteMethod = (method?: string) => ['post','put','patch','delete'].includes((method||'').toLowerCase());

const scheduleNext = () => {
  if (activeCount >= MAX_CONCURRENT) return;
  const nextIndex = queue.findIndex(r => true);
  if (nextIndex === -1) return;
  const req = queue.splice(nextIndex,1)[0];
  runRequest(req);
};

const runRequest = async (pending: PendingRequest) => {
  activeCount++;
  try {
    const response = await axios.request(pending.config);
    pending.resolve(response);
  } catch (err: any) {
    const status = err?.response?.status;
    const networkLike = err?.code === 'ERR_NETWORK' || err?.message?.includes('Network') || err?.message?.includes('INCOMPLETE') || err?.message?.includes('INSUFFICIENT_RESOURCES');
    if ((networkLike || (status && RETRY_STATUS.includes(status))) && pending.attempt < RETRY_LIMIT) {
      const delay = 300 * Math.pow(2, pending.attempt); // backoff exponencial
      setTimeout(() => {
        pending.attempt += 1;
        queue.push(pending);
        scheduleNext();
      }, delay);
    } else {
      pending.reject(err);
    }
  } finally {
    activeCount--;
    scheduleNext();
  }
};

// Interceptor para aplicar cola solo a métodos de escritura y evitar saturación
apiServiceClient.interceptors.request.use((config) => {
  if (!isWriteMethod(config.method)) return config; // lecturas siguen normal
  return new Promise((resolve, reject) => {
    queue.push({ resolve, reject, config, attempt: 0 });
    scheduleNext();
  });
});

// Respuesta: no necesitamos modificar (reintentos se manejan en runRequest). Solo pasar.
apiServiceClient.interceptors.response.use(r => r, e => Promise.reject(e));

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
