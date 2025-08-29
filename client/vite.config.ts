import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',  // Usar rutas absolutas para los assets
  define: {
    // Configuración explícita de variables de entorno
    'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || 'https://kryotecsense-production.up.railway.app'),
    'import.meta.env.VITE_TIMER_WS_URL': JSON.stringify(process.env.VITE_TIMER_WS_URL || 'wss://kryotecsense-production.up.railway.app/ws/timers'),
    // Legacy WS constants kept for compatibility
    'import.meta.env.VITE_WS_URL': JSON.stringify(''),
    'import.meta.env.VITE_WS_LOCAL_URL': JSON.stringify(''),
  },
  build: {
    // Optimizaciones para reducir uso de memoria
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom', 'react-router-dom'],
          'charts': ['chart.js', 'react-chartjs-2'],
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
  // Dev-only WS proxy (not used in production)
  target: 'ws://localhost:8001',
        ws: true,
        changeOrigin: true,
      }
    },
  },
  preview: {
    host: '0.0.0.0',
    port: process.env.PORT ? parseInt(process.env.PORT) : 4173,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ['lucide-react', '@hello-pangea/dnd'],
  },
});
