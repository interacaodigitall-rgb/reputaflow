import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        injectRegister: null,
        manifest: false, // Handled dynamically via /public/manifest.json and pwaManager.ts
        devOptions: {
          enabled: false,
        },
      }),
    ],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
        (process.env.VITE_SUPABASE_URL || 'https://ltpxwagdnrtuulzhfdjk.supabase.co')
          .replace(/\/rest\/v1\/?$/i, '')
          .replace(/\/+$/, '')
      ),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
