import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  
    const env = loadEnv(mode, '.', '');
    const backendUrl = env.VITE_BACKEND_URL || 'http://127.0.0.1:5000';
    return {
      server: {
        port: 5432,
        host: '0.0.0.0',
        proxy: {
          '/api/': {
            target: backendUrl,
            changeOrigin: true,
            secure: false,
          },
          '/uploads/': {
            target: backendUrl,
            changeOrigin: true,
            secure: false,
          },
        },
      },
      plugins: [react(),
        tailwindcss()
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
