import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // AERIS/VAAYU backend (port 8010: Docker/WSL holds 8000 on the dev laptop)
        target: 'http://127.0.0.1:8010',
        changeOrigin: true,
      },
    },
  },
});
