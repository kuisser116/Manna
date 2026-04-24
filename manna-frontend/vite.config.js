import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true, // Evita que Vite cambie al puerto 5174 si el 5173 está ocupado, lo que rompería la validación de Google OAuth
    allowedHosts: true,
    headers: {
      // COOP: Permite que el popup de Google OAuth se comunique con la ventana principal (opener)
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      // COEP: Permite cargar recursos (imágenes/scripts) de otros dominios sin necesidad de CORP headers
      'Cross-Origin-Embedder-Policy': 'unsafe-none',
    }
  }
})
