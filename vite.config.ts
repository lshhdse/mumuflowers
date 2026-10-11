import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://127.0.0.1:8787' },
    watch: {
      ignored: [
        '**/.tools/**',
        '**/android/**',
        '**/server/data/**',
        '**/artifacts/**',
        '**/test-results/**',
      ],
    },
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.tools/**', '**/server/data/**'],
    },
  },
  build: { chunkSizeWarningLimit: 700 },
});
