import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solidPlugin()],
  server: {
    port: 3000,
    proxy: {
      ...Object.fromEntries(['/api', '/image-backgrounds', '/video-backgrounds'].map(route => [route, `http://127.0.0.1:${process.env.PORT || 3002}`])),
      '/uploads': {
        target: `http://127.0.0.1:${process.env.PORT || 3002}`,
        bypass(req) {
          // Asset imports need Vite's JS transform, not Node's JPEG response.
          const query = new URL(req.url || '/', 'http://localhost').searchParams;
          if (['import', 'raw', 'url'].some(flag => query.has(flag))) return req.url;
        },
      },
    },
  },
  build: {
    target: 'esnext',
    sourcemap: true
  },
});
