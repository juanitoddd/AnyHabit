import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    // `npm run dev` talks to a backend started with `uvicorn backend.main:app`.
    // Proxying keeps the browser on one origin, so the auth cookie behaves the
    // same in development as it does behind nginx in production.
    proxy: {
      '/auth': 'http://localhost:8000',
      '/trackers': 'http://localhost:8000',
      '/groups': 'http://localhost:8000',
      '/dashboard': 'http://localhost:8000',
      '/developer': 'http://localhost:8000',
      '/export': 'http://localhost:8000',
      '/import': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
      '/version': 'http://localhost:8000'
    }
  },

  build: {
    // Charting and grid layout are heavy and rarely change. Splitting them out
    // keeps the app chunk small enough to re-download quickly after an update —
    // which matters when the server is a Raspberry Pi on home broadband.
    rollupOptions: {
      output: {
        // Rolldown (Vite 8) wants the function form here, not an object map.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
          if (id.includes('react-grid-layout') || id.includes('react-resizable')) return 'vendor-grid';
          if (id.includes('react-router')) return 'vendor-router';
          if (id.includes('lucide-react')) return 'vendor-icons';
          return 'vendor';
        }
      }
    },
    chunkSizeWarningLimit: 700
  }
});
