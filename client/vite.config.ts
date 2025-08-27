import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',  // Usar rutas absolutas para los assets
  define: {
    'import.meta.env.VITE_WS_URL': JSON.stringify('wss://kryotecsense-production.up.railway.app/ws/operaciones/'),
    'import.meta.env.VITE_WS_LOCAL_URL': JSON.stringify('ws://localhost:8000/ws/operaciones/'),
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
        target: 'ws://localhost:8000',
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
