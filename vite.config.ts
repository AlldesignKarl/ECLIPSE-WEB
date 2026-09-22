import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    rollupOptions: {
      // Dos paginas: la web del estudio y la de Alldesign Karl, que es un
      // trabajo del estudio y se sirve en /alldesign-karl/.
      input: {
        main: resolve(__dirname, 'index.html'),
        alldesign: resolve(__dirname, 'alldesign-karl/index.html'),
      },
      output: {
        // Three va en su propio fragmento: cambia poco y se cachea aparte del
        // codigo de la pieza, que se toca en cada iteracion.
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three';
          return undefined;
        },
      },
    },
  },
});
