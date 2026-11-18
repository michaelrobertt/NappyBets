import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const PROD_CSP =
  "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:";

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [
    react(),
    {
      name: 'nappy-csp',
      transformIndexHtml(html) {
        const csp =
          command === 'build'
            ? PROD_CSP
            : "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:* http://localhost:*";
        return html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${csp}" />`);
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
}));
