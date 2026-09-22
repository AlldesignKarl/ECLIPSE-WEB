import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// En produccion /api/presupuesto es una funcion de Vercel (api/presupuesto.ts).
// En desarrollo Vite no la sirve: este puente la ejecuta con la misma firma
// (Request -> Response) para poder probar el formulario en local.
function apiDev(): Plugin {
  return {
    name: 'alldesign-api-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/presupuesto', async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const mod = await server.ssrLoadModule('/api/presupuesto.ts');
        const handler = req.method === 'POST' ? mod.POST : null;
        if (!handler) {
          res.statusCode = 405;
          res.end();
          return;
        }
        const request = new Request(`http://localhost${req.originalUrl ?? ''}`, {
          method: 'POST',
          headers: req.headers as Record<string, string>,
          body: Buffer.concat(chunks),
        });
        const out: Response = await handler(request);
        res.statusCode = out.status;
        out.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await out.arrayBuffer()));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), apiDev()],
  build: {
    target: 'es2022',
    rollupOptions: {
      // Dos paginas: la web del estudio y la de Alldesign Karl, que es un
      // trabajo del estudio y se sirve en /alldesign-karl/.
      input: {
        main: resolve(__dirname, 'index.html'),
        alldesign: resolve(__dirname, 'alldesign-karl/index.html'),
        presupuesto: resolve(__dirname, 'alldesign-karl/presupuesto/index.html'),
        privacidad: resolve(__dirname, 'alldesign-karl/privacidad/index.html'),
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
