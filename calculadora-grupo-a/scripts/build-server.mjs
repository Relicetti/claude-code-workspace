import { build } from 'esbuild';

await build({
  entryPoints: ['server/prodServer.ts'],
  outfile: 'dist-server/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // pdfjs carrega o worker por import dinâmico: fica fora do bundle e vem do node_modules.
  external: ['pdfjs-dist'],
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});

console.log('[build-server] dist-server/index.js gerado.');
