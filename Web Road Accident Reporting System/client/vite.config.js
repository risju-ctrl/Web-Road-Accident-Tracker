import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 3000, proxy: { '/api': 'http://localhost:5000' } },
  // Mock mode also emits a standalone console page (preview.html) so the
  // dashboard can be demoed or captured without a backend or a login.
  build: process.env.VITE_USE_MOCK_DASHBOARD === 'true'
    ? { rollupOptions: { input: { index: resolve(__dirname, 'index.html'), preview: resolve(__dirname, 'preview.html') } } }
    : undefined
});
