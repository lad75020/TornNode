/* eslint-disable no-unused-vars */
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { viteFastify } from '@fastify/vite/plugin';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  return {
    root: resolve(process.cwd(), 'client'),
    plugins: [
      // Writes the production config cache consumed by @fastify/vite at startup.
      viteFastify({ spa: true }),
      // Runtime automatique: plus besoin d'avoir `import React` partout
      react({ jsxRuntime: 'automatic' })
    ],
    build: {
      // Keep the Fastify Vite cache at client/dist/vite.config.json.
      outDir: 'dist',
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom']
          }
        }
      },
      chunkSizeWarningLimit: 900,
      preview: {port: 4173, host: 'localhost', allowedHosts:'rpi5.dubertrand.corp'}
    }
  };
});
