import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { sourcemap: true },
  server: {
    host: '127.0.0.1',
    hmr: false, // CSV data lives in memory; edits must not trigger a page reload.
    fs: {
      strict: true,
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/real-*/**', '**/private/**', '**/data/raw/**', '**/data/cache/**', '**/outputs/**'],
    },
  },
});
