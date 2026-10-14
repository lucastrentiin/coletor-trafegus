import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath, URL } from 'node:url';

// A tela de login precisa ser um HTML autocontido: sem sessão, o
// web/server.js redireciona qualquer caminho (inclusive /assets/*) para
// /login.html. Por isso CSS, JS e fontes vão embutidos no próprio arquivo.
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile({ removeViteModuleLoader: true })],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    outDir: process.env.COLETOR_OUT ?? '../web',
    emptyOutDir: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: { input: fileURLToPath(new URL('./login.html', import.meta.url)) },
  },
});
