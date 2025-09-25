import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  return {
    root: resolve(process.cwd(), 'client'),
    plugins: [
      // Runtime automatique: plus besoin d'avoir `import React` partout
      react({ jsxRuntime: 'automatic' })
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom']
          }
        }
      },
      chunkSizeWarningLimit: 900
    }
  };
});
