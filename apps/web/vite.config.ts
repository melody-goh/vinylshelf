import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The API is reached through this proxy in development, so the browser sees a single
// origin and the SameSite=Lax session cookie just works (ADR 0006, ADR 0007).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
