import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// Build principal: gera index.html + assets/ dentro de ../web, ao lado do
// web/server.js (que continua servindo os arquivos estáticos e a API).
// O server.js e demais arquivos de backend em web/ nunca são apagados.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    outDir: process.env.COLETOR_OUT ?? '../web',
    emptyOutDir: false,
    assetsDir: 'assets',
    rollupOptions: {
      input: fileURLToPath(new URL('./index.html', import.meta.url)),
      output: {
        // Bibliotecas mudam pouco: ficam em arquivos próprios e o navegador as reaproveita entre versões.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
          ui: ['radix-ui', 'sonner', 'lucide-react'],
          data: ['@tanstack/react-query'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.COLETOR_API ?? 'http://127.0.0.1:3301', changeOrigin: false } },
  },
});
